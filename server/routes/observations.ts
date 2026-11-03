import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { OBS_BY_CODE, checkValue } from '../../src/domain/observations';
import { documents, observations, observationVersions } from '../db/schema';
import { buildRecall } from '../core/engine';
import { currentValue, originalText } from '../core/observations';
import { NOT_FOUND, type AppCtx, type Env } from '../ctx';
import { patientIdParam } from './patients';

const today = () => new Date().toISOString().slice(0, 10);
const reasonSchema = z.string().trim().min(3).max(300);

export function observationRoutes(ctx: AppCtx) {
  const { db, requireUser, open, opsFor } = ctx;
  const r = new Hono<Env>();
  const bad = (message: string) => ({ error: 'invalid', message });

  /** Typed in by staff: they are the source, so the value counts at once. */
  r.post('/patients/:id/observations', requireUser('doctor', 'nurse'), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    const body = z.object({
      entries: z.array(z.object({ code: z.string().max(30), value: z.union([z.string().max(60), z.number()]) })).min(1).max(12),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !(await open(c, id.data, 'record-values'))) return c.json(NOT_FOUND, 404);
    if (!body.success) return c.json(bad('Check the values and try again.'), 400);
    if (body.data.date && body.data.date > today()) return c.json(bad('The date cannot be in the future.'), 400);

    const checked: { code: string; value: number | string }[] = [];
    for (const e of body.data.entries) {
      if (String(e.value).trim() === '') continue; // an empty field means "not measured"
      const res = checkValue(e.code, e.value);
      if (!res.ok) return c.json(bad(res.error), 400);
      checked.push({ code: e.code, value: res.value });
    }
    if (!checked.length) return c.json(bad('Enter at least one value.'), 400);
    const num = (code: string) => checked.find(x => x.code === code)?.value as number | undefined;
    if ((num('sbp') === undefined) !== (num('dbp') === undefined)) return c.json(bad('Enter both systolic and diastolic readings.'), 400);
    if (num('sbp') !== undefined && num('dbp')! >= num('sbp')!) return c.json(bad('Diastolic should be lower than systolic. Check the readings.'), 400);

    const user = c.get('user');
    const groupId = randomUUID().slice(0, 8);
    const rows = checked.map(e => ({
      id: randomUUID(), patientId: id.data, code: e.code,
      valueNum: typeof e.value === 'number' ? e.value : null, valueText: typeof e.value === 'string' ? e.value : null,
      obsDate: body.data.date ?? today(), origin: 'entry', status: 'verified', groupId, byUserId: user.id, byLabel: user.name,
    }));
    await db.insert(observations).values(rows);
    return c.json({ ids: rows.map(x => x.id) }, 201);
  });

  /** Every recorded value for review. A patient sees only the values read from documents they uploaded. */
  r.get('/patients/:id/observations', requireUser(), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    if (!id.success || !(await open(c, id.data, 'view-values'))) return c.json(NOT_FOUND, 404);
    const user = c.get('user');
    let rows = await db.select().from(observations).where(eq(observations.patientId, id.data)).orderBy(asc(observations.createdAt));
    if (user.role === 'patient') {
      const mine = new Set((await db.select({ id: documents.id }).from(documents).where(and(eq(documents.patientId, id.data), eq(documents.byUserId, user.id)))).map(d => d.id));
      rows = rows.filter(o => o.documentId && mine.has(o.documentId));
    }
    const versions = await db.select().from(observationVersions).where(eq(observationVersions.patientId, id.data)).orderBy(asc(observationVersions.id));
    return c.json({
      items: rows.map(o => ({
        id: o.id, code: o.code, label: OBS_BY_CODE[o.code]?.label ?? o.code, unit: OBS_BY_CODE[o.code]?.unit ?? null,
        status: o.status, origin: o.origin, documentId: o.documentId, page: o.page, date: o.obsDate, flagged: o.flagged, sourceText: o.sourceText,
        original: originalText(o), current: currentValue(o, versions), by: o.byLabel, at: o.createdAt.toISOString(),
        history: versions.filter(v => v.observationId === o.id).map(v => ({ value: v.value, reason: v.reason, by: v.byLabel, at: v.at.toISOString() })),
      })),
    });
  });

  /** A patient may fix what the reader got wrong in their own upload. It stays pending: only staff can make it count. */
  r.post('/patients/:id/observations/:oid/edit', requireUser('patient'), async c => {
    const got = await change(c, 'edit');
    if (!got.o) return got.res;
    const user = c.get('user');
    const [d] = got.o.documentId ? await db.select().from(documents).where(eq(documents.id, got.o.documentId)).limit(1) : [];
    if (!d || d.byUserId !== user.id) return c.json(NOT_FOUND, 404);
    if (got.o.status !== 'extracted') return c.json(bad('This value has already been reviewed by staff.'), 409);
    const body = z.object({ value: z.union([z.string().max(60), z.number()]) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(bad('Give the corrected value.'), 400);
    const res = checkValue(got.o.code, body.data.value);
    if (!res.ok) return c.json(bad(res.error), 400);
    await db.insert(observationVersions).values({ patientId: got.pid, observationId: got.o.id, value: String(res.value), reason: 'Edited by the patient before review', byUserId: user.id, byLabel: user.name });
    return c.json({ ok: true });
  });

  async function change(c: Parameters<typeof open>[0], action: 'confirm' | 'correct' | 'reject' | 'edit') {
    const pid = patientIdParam.safeParse(c.req.param('id'));
    if (!pid.success || !(await open(c, pid.data, `${action}-value`))) return { res: c.json(NOT_FOUND, 404) };
    const [o] = await db.select().from(observations).where(and(eq(observations.id, c.req.param('oid') ?? ''), eq(observations.patientId, pid.data))).limit(1);
    if (!o) return { res: c.json(NOT_FOUND, 404) };
    return { o, pid: pid.data };
  }

  r.post('/patients/:id/observations/:oid/confirm', requireUser('doctor', 'nurse'), async c => {
    const got = await change(c, 'confirm');
    if (!got.o) return got.res;
    if (got.o.status !== 'extracted') return c.json(bad('This value has already been reviewed.'), 409);
    const user = c.get('user');
    const vs = await db.select().from(observationVersions).where(eq(observationVersions.observationId, got.o.id));
    await db.insert(observationVersions).values({ patientId: got.pid, observationId: got.o.id, value: String(currentValue(got.o, vs) ?? originalText(got.o)), reason: 'Confirmed as read from the document', byUserId: user.id, byLabel: user.name });
    await db.update(observations).set({ status: 'verified' }).where(eq(observations.id, got.o.id));
    return c.json({ ok: true });
  });

  r.post('/patients/:id/observations/:oid/correct', requireUser('doctor', 'nurse'), async c => {
    const got = await change(c, 'correct');
    if (!got.o) return got.res;
    const body = z.object({ value: z.union([z.string().max(60), z.number()]), reason: reasonSchema }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(bad('Give the corrected value and a short reason.'), 400);
    if (got.o.status === 'rejected') return c.json(bad('A rejected value cannot be edited.'), 409);
    const res = checkValue(got.o.code, body.data.value);
    if (!res.ok) return c.json(bad(res.error), 400);
    const user = c.get('user');
    await db.insert(observationVersions).values({ patientId: got.pid, observationId: got.o.id, value: String(res.value), reason: body.data.reason, byUserId: user.id, byLabel: user.name });
    await db.update(observations).set({ status: 'corrected' }).where(eq(observations.id, got.o.id));
    return c.json({ ok: true });
  });

  r.post('/patients/:id/observations/:oid/reject', requireUser('doctor', 'nurse'), async c => {
    const got = await change(c, 'reject');
    if (!got.o) return got.res;
    const body = z.object({ reason: reasonSchema }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(bad('Say briefly why this value is wrong.'), 400);
    if (got.o.status !== 'extracted') return c.json(bad('Only a value that has not been reviewed can be rejected. Correct it instead.'), 409);
    const user = c.get('user');
    await db.insert(observationVersions).values({ patientId: got.pid, observationId: got.o.id, value: originalText(got.o), reason: `Rejected: ${body.data.reason}`, byUserId: user.id, byLabel: user.name });
    await db.update(observations).set({ status: 'rejected' }).where(eq(observations.id, got.o.id));
    return c.json({ ok: true });
  });

  /** Fix a value that was read from a follow-up slip. The slip and the original value stay as they were. */
  r.post('/patients/:id/facts/:factId/correct', requireUser('doctor', 'nurse'), async c => {
    const pid = patientIdParam.safeParse(c.req.param('id'));
    const body = z.object({ value: z.union([z.string().max(60), z.number()]), reason: reasonSchema }).safeParse(await c.req.json().catch(() => null));
    if (!pid.success || !(await open(c, pid.data, 'correct-value'))) return c.json(NOT_FOUND, 404);
    if (!body.success) return c.json(bad('Give the corrected value and a short reason.'), 400);
    const fact = buildRecall(pid.data, await opsFor(pid.data)).facts.find(f => f.id === c.req.param('factId') && f.source === 'his-import' && f.kind === 'observation');
    if (!fact || typeof fact.value !== 'number' || !OBS_BY_CODE[fact.code]) return c.json(bad('This value cannot be corrected here.'), 400);
    const res = checkValue(fact.code, body.data.value);
    if (!res.ok) return c.json(bad(res.error), 400);
    const user = c.get('user');
    await db.insert(observationVersions).values({ patientId: pid.data, factId: fact.id, value: String(res.value), reason: body.data.reason, byUserId: user.id, byLabel: user.name });
    return c.json({ ok: true });
  });

  return r;
}
