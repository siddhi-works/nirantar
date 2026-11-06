import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { DOC_TYPES, type DocumentItem } from '../../src/domain/documents';
import { documents, observations } from '../db/schema';
import { MAX_UPLOAD_BYTES, sniff } from '../files';
import { processDocument } from '../documents';
import { NOT_FOUND, type AppCtx, type Env } from '../ctx';
import { patientIdParam } from './patients';

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
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniff(bytes);
    if (!mime) return c.json({ error: 'invalid', message: 'Only PDF, JPG and PNG files can be uploaded.' }, 400);

    const user = c.get('user');
    const id = randomUUID();
    await files.put(id, bytes);
    await db.insert(documents).values({
      id, patientId: pid.data, docType, fileName: file.name.slice(0, 120).replace(/[^\w.\- ()]/g, '_'), mime, size: bytes.length,
      origin: user.role === 'patient' ? 'patient' : 'staff', status: 'queued', byUserId: user.id, byLabel: user.name,
    });
    await processDocument({ db, files, ocr }, id);
    const [d] = await db.select().from(documents).where(eq(documents.id, id));
    return c.json(await item(d), 201);
  });

  r.get('/patients/:id/documents', requireUser(), async c => {
    const pid = patientIdParam.safeParse(c.req.param('id'));
    if (!pid.success || !(await open(c, pid.data, 'list-documents'))) return c.json(NOT_FOUND, 404);
    const user = c.get('user');
    const rows = await db.select().from(documents).where(eq(documents.patientId, pid.data)).orderBy(desc(documents.createdAt));
    const visible = user.role === 'patient' ? rows.filter(d => d.byUserId === user.id) : rows;
    return c.json({ items: await Promise.all(visible.map(item)) });
  });

  async function docFor(c: Parameters<typeof open>[0], action: string) {
    const [d] = await db.select().from(documents).where(eq(documents.id, c.req.param('docId') ?? '')).limit(1);
    if (!d || !(await open(c, d.patientId, action))) return null;
    const user = c.get('user');
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
