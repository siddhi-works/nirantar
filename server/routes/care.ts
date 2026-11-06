import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { complications } from '../../src/domain/profile';
import { accessLog, editRequests, educationLog, observations, patientAdvice, registeredPatients } from '../db/schema';
import { buildRecall } from '../core/engine';
import { NOT_FOUND, baseOfId, patientOf, type AppCtx, type Env } from '../ctx';
import { REG_ID } from '../registry';
import { patientIdParam } from './patients';
import { scope } from '../seed';
import { writeSummary, type SummaryInput } from '../care/summary';
import { TOPICS, topicsFor } from '../care/education';

const CODES = ['hba1c', 'fbs', 'ppbs'] as const;

/** Summary, counselling, patient education and correction requests: each built from what is on the record, and silent where it is not. */
export function careRoutes({ db, requireUser, open, opsFor }: AppCtx) {
  const r = new Hono<Env>();
  const bad = (message: string, status: 400 | 409 | 422 = 400) => ({ body: { error: 'invalid', message }, status });

  async function advicePairs(pid: string, ws: string, recall?: ReturnType<typeof buildRecall>) {
    const slip = recall?.documents.filter(d => d.kind === 'prescription').at(-1);
    const mine = await db.select().from(patientAdvice).where(and(eq(patientAdvice.workspace, ws), eq(patientAdvice.patientId, pid))).orderBy(desc(patientAdvice.at));
    return [
      ...(slip?.advice ?? []).map(text => ({ text, source: 'slip' as const, by: slip!.doctor, at: slip!.date })),
      ...mine.map(a => ({ text: a.text, source: 'doctor' as const, by: a.byLabel, at: a.at.toISOString() })),
    ];
  }

  /** The 50 to 80 word summary shown at the top of a patient's page. */
  r.get('/patients/:id/summary', requireUser('doctor', 'nurse'), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    if (!id.success || !(await open(c, id.data, 'view-summary'))) return c.json(NOT_FOUND, 404);
    const u = c.get('user');
    let input: SummaryInput;
    if (REG_ID.test(id.data)) {
      const [p] = await db.select().from(registeredPatients).where(eq(registeredPatients.id, id.data)).limit(1);
      if (!p) return c.json(NOT_FOUND, 404);
      const rows = await db.select().from(observations).where(and(eq(observations.patientId, scope(id.data, u.workspace)), inArray(observations.status, ['verified', 'corrected'])));
      const series: SummaryInput['series'] = {};
      for (const code of CODES) series[code] = rows.filter(o => o.code === code && o.valueNum !== null).sort((a, b) => a.obsDate.localeCompare(b.obsDate)).map(o => ({ date: o.obsDate, value: o.valueNum! }));
      const have = (...codes: string[]) => rows.some(o => codes.includes(o.code));
      const missing = [!have('sbp') && 'blood pressure', !have('egfr', 'uacr') && 'kidney tests (eGFR, uACR)', !have('ldl', 'hdl', 'tg') && 'lipid profile', !have('retina') && 'retina exam', !have('foot') && 'foot exam'].filter(Boolean) as string[];
      input = { name: p.name, age: p.age, sex: p.sex as 'M' | 'F' | 'O', series, medicines: [], complications: [], missing, advice: (await advicePairs(id.data, u.workspace)).map(a => a.text) };
    } else {
      const rc = buildRecall(id.data, await opsFor(id.data, u.workspace));
      const series: SummaryInput['series'] = {};
      for (const code of CODES) series[code] = (rc.trends.find(t => t.code === code)?.points ?? []).filter(p => p.value !== null).map(p => ({ date: p.date, value: p.value! }));
      input = {
        name: rc.patient.name, age: rc.patient.age, sex: rc.patient.sex, diagnosis: rc.diagnoses.at(-1) ? { text: rc.diagnoses.at(-1)!.text, since: rc.patient.firstVisitDate } : undefined, visits: rc.visits.length, series,
        medicines: rc.medications.map(m => `${m.drug}${m.strength ? ' ' + m.strength : ''}`), complications: complications(rc).map(x => x.label),
        missing: rc.missingMeasures.filter(m => !m.readings?.length).map(m => m.label), advice: (await advicePairs(id.data, u.workspace, rc)).map(a => a.text),
      };
    }
    return c.json(writeSummary(input));
  });

  /** Advice as written, with a plain-language explanation of each. Where there is no advice it says so, and who must supply it. */
  r.get('/patients/:id/counselling', requireUser(), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    if (!id.success || !(await open(c, id.data, 'view-counselling'))) return c.json(NOT_FOUND, 404);
    const u = c.get('user');
    const rc = REG_ID.test(id.data) ? undefined : buildRecall(id.data, await opsFor(id.data, u.workspace));
    const advice = (await advicePairs(id.data, u.workspace, rc)).map(a => ({ ...a, topics: topicsFor(a.text).map(t => t.id) }));
    const done = await db.select().from(educationLog).where(and(eq(educationLog.workspace, u.workspace), eq(educationLog.patientId, id.data))).orderBy(desc(educationLog.at));
    return c.json({
      advice, topics: TOPICS.map(t => ({ id: t.id, title: t.title, steps: t.steps })),
      education: done.map(d => ({ topic: d.topic, by: d.byLabel, at: d.at.toISOString() })),
      unavailable: advice.length ? null : 'No lifestyle advice is written on this record. Needs input: the doctor can add advice for the patient.',
    });
  });

  r.post('/patients/:id/advice', requireUser('doctor'), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    const body = z.object({ text: z.string().trim().min(3).max(200) }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !(await open(c, id.data, 'add-advice'))) return c.json(NOT_FOUND, 404);
    if (!body.success) { const e = bad('Write the advice in a few words.'); return c.json(e.body, e.status); }
    const u = c.get('user');
    await db.insert(patientAdvice).values({ workspace: u.workspace, patientId: id.data, text: body.data.text, byLabel: u.name });
    return c.json({ ok: true }, 201);
  });

  /** Record that a nurse or doctor counselled the patient on a topic. */
  r.post('/patients/:id/education', requireUser('doctor', 'nurse'), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    const body = z.object({ topic: z.string().max(20) }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !(await open(c, id.data, 'record-education'))) return c.json(NOT_FOUND, 404);
    if (!body.success || !TOPICS.some(t => t.id === body.data.topic)) { const e = bad('Choose a topic from the list.'); return c.json(e.body, e.status); }
    const u = c.get('user');
    await db.insert(educationLog).values({ workspace: u.workspace, patientId: id.data, topic: body.data.topic, byLabel: u.name });
    return c.json({ ok: true }, 201);
  });

  /* ───────── a patient asks for a correction; staff decide after looking at the original ───────── */

  const shape = (e: typeof editRequests.$inferSelect) => ({
    id: e.id, patientId: e.patientId, subject: e.subject, subjectRef: e.subjectRef ?? undefined, proposed: e.proposed, reason: e.reason, status: e.status as 'pending' | 'accepted' | 'rejected',
    by: e.byLabel, at: e.createdAt.toISOString(), decidedBy: e.decidedBy ?? undefined, decisionNote: e.decisionNote ?? undefined, decidedAt: e.decidedAt?.toISOString(),
  });

  r.post('/patients/:id/edit-requests', requireUser('patient'), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    const body = z.object({ subject: z.string().trim().min(3).max(200), subjectRef: z.string().max(80).optional(), proposed: z.string().trim().min(1).max(100), reason: z.string().trim().min(5).max(300) }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !(await open(c, id.data, 'raise-edit-request'))) return c.json(NOT_FOUND, 404);
    if (!body.success) { const e = bad('Say what is wrong, what it should be, and why.'); return c.json(e.body, e.status); }
    const u = c.get('user');
    const pending = await db.select({ id: editRequests.id }).from(editRequests).where(and(eq(editRequests.workspace, u.workspace), eq(editRequests.patientId, id.data), eq(editRequests.status, 'pending')));
    if (pending.length >= 10) { const e = bad('You already have 10 requests waiting. Please wait for them to be answered.', 409); return c.json(e.body, e.status); }
    const row = { id: randomUUID(), workspace: u.workspace, patientId: id.data, subject: body.data.subject, subjectRef: body.data.subjectRef ?? null, proposed: body.data.proposed, reason: body.data.reason, status: 'pending', byLabel: u.name };
    await db.insert(editRequests).values(row);
    return c.json({ id: row.id }, 201);
  });

  r.get('/patients/:id/edit-requests', requireUser(), async c => {
    const id = patientIdParam.safeParse(c.req.param('id'));
    if (!id.success || !(await open(c, id.data, 'view-edit-requests'))) return c.json(NOT_FOUND, 404);
    const u = c.get('user');
    const rows = await db.select().from(editRequests).where(and(eq(editRequests.workspace, u.workspace), eq(editRequests.patientId, id.data))).orderBy(desc(editRequests.createdAt));
    return c.json({ items: rows.map(shape) });
  });

  /**
   * Nobody edits a record for the patient. Staff look at the original, change the value themselves with "Correct value" if
   * the request is right (the original stays on record), and then record the decision here for the patient to read.
   */
  r.post('/edit-requests/:id/decide', requireUser('doctor', 'nurse'), async c => {
    const body = z.object({ decision: z.enum(['accepted', 'rejected']), note: z.string().trim().min(3).max(300) }).safeParse(await c.req.json().catch(() => null));
    const [row] = await db.select().from(editRequests).where(eq(editRequests.id, c.req.param('id') ?? '')).limit(1);
    const u = c.get('user');
    if (!row || row.workspace !== u.workspace || !(await open(c, baseOfId(row.patientId), 'decide-edit-request'))) return c.json(NOT_FOUND, 404);
    if (!body.success) { const e = bad('Choose a decision and give a short reason.'); return c.json(e.body, e.status); }
    if (row.status !== 'pending') { const e = bad('This request has already been answered.', 409); return c.json(e.body, e.status); }
    await db.update(editRequests).set({ status: body.data.decision, decidedBy: u.name, decisionNote: body.data.note, decidedAt: new Date() }).where(eq(editRequests.id, row.id));
    await db.insert(accessLog).values({ userId: u.id, role: u.role, action: `edit-request-${body.data.decision}`, patientId: row.patientId, outcome: 'allowed' });
    return c.json({ ok: true });
  });

  void patientOf;
  return r;
}
