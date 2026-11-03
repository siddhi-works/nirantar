import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { accessLog, factVerifications, patients } from '../db/schema';
import { buildRecall } from '../core/engine';
import { documentView } from '../core/views';
import { originalPdf } from '../storage';
import { NOT_FOUND, digits, patientOf, type AppCtx, type Env } from '../ctx';

export const patientIdParam = z.string().regex(/^P\d{1,6}$/);
const docIdParam = z.string().regex(/^[A-Za-z0-9-]{1,40}$/);

export function patientRoutes(ctx: AppCtx) {
  const { db, requireUser, open, opsFor } = ctx;
  const r = new Hono<Env>();

  r.post('/patients/lookup', requireUser('doctor', 'nurse'), async c => {
    const parsed = z.object({ abha: z.string().max(40) }).safeParse(await c.req.json().catch(() => null));
    const abha = parsed.success ? digits(parsed.data.abha) : '';
    if (abha.length !== 14) return c.json(NOT_FOUND, 404);
    const [p] = await db.select().from(patients).where(eq(patients.abha, abha)).limit(1);
    const user = c.get('user');
    if (!p) {
      await db.insert(accessLog).values({ userId: user.id, role: user.role, action: 'lookup', outcome: 'denied' });
      return c.json(NOT_FOUND, 404); // same reply as "found but no consent"
    }
    if (!(await open(c, p.id, 'lookup'))) return c.json(NOT_FOUND, 404);
    return c.json({ patientId: p.id, name: patientOf(p.id)?.name ?? '' });
  });

  r.get('/patients/:id/recall', requireUser(), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    if (!id.success || !(await open(c, id.data, 'view-record'))) return c.json(NOT_FOUND, 404);
    return c.json(buildRecall(id.data, await opsFor(id.data)));
  });

  r.get('/patients/:id/documents/:docId', requireUser(), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    const doc = docIdParam.safeParse(c.req.param('docId'));
    if (!id.success || !doc.success || !(await open(c, id.data, 'view-document'))) return c.json(NOT_FOUND, 404);
    return c.json(documentView(id.data, doc.data, await opsFor(id.data)));
  });

  r.get('/patients/:id/original', requireUser(), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    if (!id.success || !(await open(c, id.data, 'view-original'))) return c.json(NOT_FOUND, 404);
    const pdf = await originalPdf(id.data);
    if (!pdf) return c.json(NOT_FOUND, 404);
    return new Response(pdf as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  });

  r.post('/patients/:id/verify', requireUser('doctor', 'nurse'), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    const body = z.object({ factIds: z.array(z.string().max(80)).min(1).max(50) }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !(await open(c, id.data, 'verify-values'))) return c.json(NOT_FOUND, 404);
    if (!body.success) return c.json({ error: 'bad_request' }, 400);
    const known = new Set(buildRecall(id.data, await opsFor(id.data)).facts.map(f => f.id));
    const ids = [...new Set(body.data.factIds)].filter(f => known.has(f));
    if (!ids.length) return c.json({ error: 'bad_request' }, 400);
    const user = c.get('user');
    await db.insert(factVerifications)
      .values(ids.map(factId => ({ patientId: id.data, factId, byUserId: user.id, byLabel: user.name })))
      .onConflictDoNothing();
    return c.json({ count: ids.length });
  });

  return r;
}
