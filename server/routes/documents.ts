import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, like, sum } from 'drizzle-orm';
import { DOC_TYPES, type DocumentItem } from '../../src/domain/documents';
import { documents, observations } from '../db/schema';
import { readFile } from 'node:fs/promises';
import { MAX_UPLOAD_BYTES, sniff } from '../files';
import { originalPdfPath } from '../storage';
import { processDocument } from '../documents';
import { NOT_FOUND, type AppCtx, type Env } from '../ctx';
import { patientIdParam } from './patients';
import { baseOf, scope, workspaceOf } from '../seed';

export function documentRoutes(ctx: AppCtx) {
  const { db, requireUser, open, files, ocr } = ctx;
  const r = new Hono<Env>();

  async function item(d: typeof documents.$inferSelect): Promise<DocumentItem> {
    const [vals] = await db.select({ n: count() }).from(observations).where(eq(observations.documentId, d.id));
    const [wait] = await db.select({ n: count() }).from(observations).where(and(eq(observations.documentId, d.id), eq(observations.status, 'extracted')));
    return {
      id: d.id, docType: d.docType, fileName: d.fileName, mime: d.mime, size: d.size, origin: d.origin as 'staff' | 'patient', status: d.status as DocumentItem['status'],
      method: d.method as DocumentItem['method'], pages: d.pages, error: d.error, by: d.byLabel, at: d.createdAt.toISOString(),
      syncStatus: d.syncStatus as 'pending' | 'pushed', values: vals?.n ?? 0, waiting: wait?.n ?? 0,
    };
  }

  /** The most uploads kept per patient, so one visitor cannot fill the shared database for everyone. */
  const MAX_DOCUMENTS = 8;
  const MAX_WORKSPACE_BYTES = 24 * 1024 * 1024; // all of one tester's uploads together

  async function ingest(c: Parameters<typeof open>[0], patientId: string, bytes: Uint8Array, name: string, docType: string) {
    const mime = sniff(bytes);
    if (!mime) return c.json({ error: 'invalid', message: 'Only PDF, JPG and PNG files can be uploaded.' }, 400);
    const user = c.get('user');
    const key = scope(patientId, user.workspace); // this tester's own space
    const [have] = await db.select({ n: count() }).from(documents).where(eq(documents.patientId, key));
    if ((have?.n ?? 0) >= MAX_DOCUMENTS) return c.json({ error: 'invalid', message: `This site keeps up to ${MAX_DOCUMENTS} uploads per patient. Choose "Start with fresh sample data" to clear them.` }, 409);
    const [used] = await db.select({ n: sum(documents.size) }).from(documents).where(like(documents.patientId, `%~${user.workspace}`));
    if (Number(used?.n ?? 0) + bytes.length > MAX_WORKSPACE_BYTES) return c.json({ error: 'invalid', message: 'Your sample space is full. Choose "Start with fresh sample data" to clear it.' }, 409);
    const id = randomUUID();
    await files.put(id, bytes);
    await db.insert(documents).values({
      id, patientId: key, docType, fileName: name.slice(0, 120).replace(/[^\w.\- ()]/g, '_'), mime, size: bytes.length,
      origin: user.role === 'patient' ? 'patient' : 'staff', status: 'queued', byUserId: user.id, byLabel: user.name,
    });
    await processDocument({ db, files, ocr }, id);
    const [d] = await db.select().from(documents).where(eq(documents.id, id));
    return c.json(await item(d), 201);
  }

  /** Upload: stored privately, then read. Doctor, nurse or the patient themself. */
  r.post('/patients/:id/documents', requireUser(), async c => {
    const pid = patientIdParam.safeParse(c.req.param('id'));
    if (!pid.success || !(await open(c, pid.data, 'upload-document'))) return c.json(NOT_FOUND, 404);
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    const docType = typeof body?.type === 'string' ? body.type : '';
    if (!(file instanceof File)) return c.json({ error: 'invalid', message: 'Choose a file to upload.' }, 400);
    if (!(DOC_TYPES as readonly string[]).includes(docType)) return c.json({ error: 'invalid', message: 'Choose the document type.' }, 400);
    if (file.size === 0) return c.json({ error: 'invalid', message: 'The file is empty.' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: 'invalid', message: 'The file is larger than 4 MB. Upload a smaller scan.' }, 413);
    return ingest(c, pid.data, new Uint8Array(await file.arrayBuffer()), file.name, docType);
  });

  /** Upload the sample prescription for this patient, so nobody needs a file of their own to try the flow. */
  r.post('/patients/:id/documents/sample', requireUser(), async c => {
    const pid = patientIdParam.safeParse(c.req.param('id'));
    if (!pid.success || !(await open(c, pid.data, 'upload-sample-document'))) return c.json(NOT_FOUND, 404);
    const path = originalPdfPath(pid.data);
    if (!path) return c.json(NOT_FOUND, 404);
    return ingest(c, pid.data, new Uint8Array(await readFile(path)), `sample-prescription-${pid.data}.pdf`, 'Prescription');
  });

  r.get('/patients/:id/documents', requireUser(), async c => {
    const pid = patientIdParam.safeParse(c.req.param('id'));
    if (!pid.success || !(await open(c, pid.data, 'list-documents'))) return c.json(NOT_FOUND, 404);
    const user = c.get('user');
    const rows = await db.select().from(documents).where(eq(documents.patientId, scope(pid.data, user.workspace))).orderBy(desc(documents.createdAt));
    const visible = user.role === 'patient' ? rows.filter(d => d.byUserId === user.id) : rows;
    return c.json({ items: await Promise.all(visible.map(item)) });
  });

  async function docFor(c: Parameters<typeof open>[0], action: string) {
    const [d] = await db.select().from(documents).where(eq(documents.id, c.req.param('docId') ?? '')).limit(1);
    const user = c.get('user');
    if (!d || workspaceOf(d.patientId) !== user.workspace || !(await open(c, baseOf(d.patientId), action))) return null; // another tester's file is simply not found
    if (user.role === 'patient' && d.byUserId !== user.id) return null;
    return d;
  }

  r.get('/documents/:docId', requireUser(), async c => {
    const d = await docFor(c, 'view-document-status');
    return d ? c.json(await item(d)) : c.json(NOT_FOUND, 404);
  });

  r.get('/documents/:docId/file', requireUser(), async c => {
    const d = await docFor(c, 'view-uploaded-file');
    const bytes = d ? await files.get(d.id) : null;
    if (!d || !bytes) return c.json(NOT_FOUND, 404);
    // A PDF is shown by the browser's own viewer, which a sandbox policy would block. Anything else gets the strict policy.
    const headers: Record<string, string> = { 'Content-Type': d.mime, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    if (d.mime !== 'application/pdf') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
    return new Response(bytes as BodyInit, { headers });
  });

  return r;
}
