import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { z } from 'zod';
import { accessLog, editRequests, gatewayMessages, observations, opdSettings, opdVisits, patients, registeredPatients } from '../db/schema';
import { NOT_FOUND, digits, patientOf, type AppCtx, type Ctx, type Env } from '../ctx';
import { FACILITY_HFR } from '../seed';
import { loadDemoDay } from '../opd-demo';
import { addVisit, enteredMinutes, predict, visitsOn, type Visit } from '../opd';
import { REG_ID, findPatientByAbha, holderOf, registeredPatient } from '../registry';
import { FACILITIES } from '../sim/facilities';
import { todayIST } from '../time';

const view = (v: Visit, p: ReturnType<typeof predict>, held = true) => ({
  id: v.id, token: v.token, name: v.name, patientId: v.patientId, abha: v.abha ?? undefined, held, hfrId: v.hfrId, source: v.source as 'scan-and-share' | 'desk', priority: v.priority as 'routine' | 'urgent',
  status: v.status as 'waiting' | 'ongoing' | 'done' | 'cancelled', joinedAt: v.createdAt.toISOString(), calledAt: v.calledAt?.toISOString(), doneAt: v.doneAt?.toISOString(),
  ...(p.waiting[v.id] ? { position: p.waiting[v.id].position, startsAt: p.waiting[v.id].startsAt, waitMinutes: p.waiting[v.id].waitMinutes } : {}),
});

/**
 * The OPD queue: tokens, who is being seen, how long the wait is likely to be. A patient joins by scanning the hospital's QR
 * code in their own app (Scan & Share) or is added at the desk; staff call, finish or cancel visits.
 */
export function opdRoutes({ db, requireUser }: AppCtx) {
  const r = new Hono<Env>();
  const log = (ws: string, requestId: string, from: string, to: string, path: string, summary: string) =>
    db.insert(gatewayMessages).values({ workspace: ws, requestId, from, to, path, status: 'ok', summary });

  async function snapshot(workspace: string, hfrId: string) {
    const visits = await visitsOn(db, workspace, hfrId, todayIST());
    const p = predict(visits, await enteredMinutes(db, workspace, hfrId));
    const count = (s: Visit['status']) => visits.filter(v => v.status === s).length;
    const holders = new Map<string, string | null>();
    for (const v of visits) if (!holders.has(v.patientId)) holders.set(v.patientId, await holderOf(db, v.patientId));
    return {
      day: todayIST(), hfrId, items: visits.map(v => view(v, p, holders.get(v.patientId) === hfrId)),
      counts: { appointments: visits.filter(v => v.status !== 'cancelled').length, waiting: count('waiting'), ongoing: count('ongoing'), done: count('done'), cancelled: count('cancelled') },
      avgMinutes: p.avgMinutes, basis: p.basis, basedOn: p.basedOn, rush: p.rush,
    };
  }

  /* ───────── staff ───────── */

  r.get('/opd/queue', requireUser('doctor', 'nurse'), async c => {
    const u = c.get('user');
    return u.hfrId ? c.json(await snapshot(u.workspace, u.hfrId)) : c.json(NOT_FOUND, 404);
  });

  /** Add a patient at the desk, by ABHA number. */
  r.post('/opd/walk-in', requireUser('doctor', 'nurse'), async c => {
    const u = c.get('user');
    const body = z.object({ abha: z.string().max(40), priority: z.enum(['routine', 'urgent']).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!u.hfrId || !body.success) return c.json({ error: 'invalid', message: 'Enter the patient’s 14-digit ABHA number.' }, 400);
    const abha = digits(body.data.abha);
    if (abha.length !== 14) return c.json({ error: 'invalid', message: 'An ABHA number has 14 digits.' }, 400);
    // Anyone who arrives can be given a token. Whether this hospital may open their record is a separate question: if it does
    // not hold it, the queue offers "Request access".
    const who = await findPatientByAbha(db, u.workspace, abha);
    if (!who) return c.json({ error: 'invalid', message: 'No patient with this ABHA number was found.' }, 404);
    const today = await visitsOn(db, u.workspace, u.hfrId, todayIST());
    if (today.some(v => v.patientId === who!.id && (v.status === 'waiting' || v.status === 'ongoing'))) return c.json({ error: 'invalid', message: `${who.name} is already in today’s queue.` }, 409);
    const v = await addVisit(db, { id: randomUUID(), workspace: u.workspace, hfrId: u.hfrId!, patientId: who.id, name: who.name, abha, source: 'desk', priority: body.data.priority ?? 'routine', status: 'waiting', byLabel: u.name });
    await db.insert(accessLog).values({ userId: u.id, role: u.role, action: 'opd-add', patientId: who.id, outcome: 'allowed' });
    return c.json({ token: v.token, ...(await snapshot(u.workspace, u.hfrId)) }, 201);
  });

  /** A made-up general-medicine OPD morning: six clearly labelled demo patients with records, all in today's queue. */
  r.post('/opd/demo-day', requireUser('doctor', 'nurse'), async c => {
    const u = c.get('user');
    if (!u.hfrId) return c.json({ error: 'invalid', message: 'Sign in at a hospital first.' }, 400);
    const added = await loadDemoDay(db, { id: u.id, workspace: u.workspace, hfrId: u.hfrId });
    if (!added) return c.json({ error: 'invalid', message: 'The demo OPD day is already loaded here.' }, 409);
    await db.insert(accessLog).values({ userId: u.id, role: u.role, action: 'load-demo-opd', patientId: '-', outcome: 'allowed' });
    return c.json({ added, ...(await snapshot(u.workspace, u.hfrId)) }, 201);
  });

  /** What staff say one consultation takes, for the waiting time until enough real ones have been timed. */
  r.post('/opd/settings', requireUser('doctor', 'nurse'), async c => {
    const u = c.get('user');
    const body = z.object({ minutesPerPatient: z.number().int().min(2).max(60) }).safeParse(await c.req.json().catch(() => null));
    if (!u.hfrId || !body.success) return c.json({ error: 'invalid', message: 'Enter the minutes one consultation takes, from 2 to 60.' }, 400);
    await db.insert(opdSettings).values({ workspace: u.workspace, hfrId: u.hfrId, minutesPerPatient: body.data.minutesPerPatient, byLabel: u.name })
      .onConflictDoUpdate({ target: [opdSettings.workspace, opdSettings.hfrId], set: { minutesPerPatient: body.data.minutesPerPatient, byLabel: u.name, at: new Date() } });
    return c.json(await snapshot(u.workspace, u.hfrId));
  });

  /** What needs a person's attention right now, read from the real data. Nothing is listed that is not there. */
  r.get('/attention', requireUser('doctor', 'nurse'), async c => {
    const u = c.get('user');
    const items: { kind: 'review' | 'queue' | 'correction'; title: string; patientId?: string; name?: string }[] = [];
    if (!u.hfrId) return c.json({ items });
    const waiting = await db.select({ pid: observations.patientId }).from(observations).where(and(eq(observations.status, 'extracted'), like(observations.patientId, `%~${u.workspace}`)));
    const byPatient = new Map<string, number>();
    for (const w of waiting) byPatient.set(w.pid.split('~')[0], (byPatient.get(w.pid.split('~')[0]) ?? 0) + 1);
    for (const [pid, n] of byPatient) {
      let name: string | undefined;
      if (pid.startsWith('R')) { const [reg] = await db.select().from(registeredPatients).where(eq(registeredPatients.id, pid)).limit(1); if (!reg || reg.hfrId !== u.hfrId || reg.workspace !== u.workspace) continue; name = reg.name; }
      else if (u.hfrId === FACILITY_HFR) name = patientOf(pid)?.name; else continue;
      if (name) items.push({ kind: 'review', title: `${n} value${n === 1 ? '' : 's'} read from documents wait for review`, patientId: pid, name });
    }
    const asks = await db.select().from(editRequests).where(and(eq(editRequests.workspace, u.workspace), eq(editRequests.status, 'pending')));
    for (const a of asks) {
      const who = a.patientId.startsWith('R') ? (await db.select().from(registeredPatients).where(eq(registeredPatients.id, a.patientId)).limit(1))[0] : null;
      if (a.patientId.startsWith('R') && (!who || who.hfrId !== u.hfrId)) continue;
      if (!a.patientId.startsWith('R') && u.hfrId !== FACILITY_HFR) continue;
      items.push({ kind: 'correction', title: `A patient asked for a correction: ${a.subject}`, patientId: a.patientId, name: who?.name ?? patientOf(a.patientId)?.name });
    }
    const q = await visitsOn(db, u.workspace, u.hfrId, todayIST());
    const w = q.filter(v => v.status === 'waiting').length;
    if (w) items.push({ kind: 'queue', title: `${w} patient${w === 1 ? ' is' : 's are'} waiting in the OPD queue` });
    return c.json({ items });
  });

  /* ───────── the patient's own app ───────── */

  /**
   * Scan & Share. In real ABDM the patient's app scans the hospital's QR code, the consent manager sends the profile to the
   * hospital (`/v3/hip/patient/profile/share`) and the hospital answers with a token (`.../on-share`). Each hop is written to
   * the message log so it can be seen.
   */
  r.post('/opd/scan-and-share', requireUser('patient'), async c => {
    const u = c.get('user');
    const body = z.object({ hfr: z.string().max(20) }).safeParse(await c.req.json().catch(() => null));
    if (!u.patientId || !body.success) return c.json({ error: 'invalid', message: 'This QR code is not recognised.' }, 400);
    const hfr = body.data.hfr;
    if (!FACILITIES[hfr]) return c.json({ error: 'invalid', message: 'This QR code is not a hospital this sandbox knows.' }, 404);
    const today = await visitsOn(db, u.workspace, hfr, todayIST());
    const already = today.find(v => v.patientId === u.patientId && (v.status === 'waiting' || v.status === 'ongoing'));
    if (already) return c.json(await mineView(u.workspace, u.patientId));
    const reg = REG_ID.test(u.patientId) ? await registeredPatient(db, u.patientId) : undefined;
    const [row] = reg ? [{ abha: reg.abha }] : await db.select().from(patients).where(eq(patients.id, u.patientId)).limit(1);
    const v = await addVisit(db, { id: randomUUID(), workspace: u.workspace, hfrId: hfr, patientId: u.patientId, name: reg?.name ?? patientOf(u.patientId)?.name ?? u.name, abha: row?.abha ?? null, source: 'scan-and-share', status: 'waiting', byLabel: 'Patient (QR)' });
    const rid = randomUUID();
    await log(u.workspace, rid, 'phr-app', 'hie-cm', '/scan', 'The patient scanned the hospital QR code');
    await log(u.workspace, rid, 'hie-cm', 'hip', '/v3/hip/patient/profile/share', 'The patient’s profile was shared with their consent');
    await log(u.workspace, rid, 'hip', 'hie-cm', '/v3/hip/patient/profile/on-share', `Token ${v.token} issued`);
    await db.insert(accessLog).values({ userId: u.id, role: u.role, action: 'opd-scan-and-share', patientId: u.patientId, outcome: 'allowed' });
    return c.json(await mineView(u.workspace, u.patientId), 201);
  });

  /** The hospital that holds a patient's record: the home hospital for the sample patients, the registering hospital for the rest. */
  async function hospitalOf(patientId: string) {
    if (!REG_ID.test(patientId)) return FACILITY_HFR;
    return (await registeredPatient(db, patientId))?.hfrId ?? FACILITY_HFR;
  }

  /** The patient's latest visit today, at whichever hospital they joined. */
  async function mineView(workspace: string, patientId: string) {
    let best: { v: Visit; hfr: string } | null = null;
    for (const hfr of Object.keys(FACILITIES)) {
      const mine = (await visitsOn(db, workspace, hfr, todayIST())).filter(x => x.patientId === patientId);
      const last = mine.at(-1);
      if (last && (!best || last.createdAt > best.v.createdAt)) best = { v: last, hfr };
    }
    const hfr = best?.hfr ?? await hospitalOf(patientId);
    const visits = await visitsOn(db, workspace, hfr, todayIST());
    const p = predict(visits, await enteredMinutes(db, workspace, hfr));
    return { visit: best ? view(best.v, p, (await holderOf(db, patientId)) === hfr) : null, avgMinutes: p.avgMinutes, basis: p.basis, rush: p.rush, hospital: hfr, hospitalName: FACILITIES[hfr] ?? hfr };
  }

  r.get('/opd/me', requireUser('patient'), async c => {
    const u = c.get('user');
    if (!u.patientId) return c.json(NOT_FOUND, 404);
    return c.json(await mineView(u.workspace, u.patientId));
  });

  r.post('/opd/me/cancel', requireUser('patient'), async c => {
    const u = c.get('user');
    if (!u.patientId) return c.json(NOT_FOUND, 404);
    const mineVisits = (await Promise.all(Object.keys(FACILITIES).map(h => visitsOn(db, u.workspace, h, todayIST())))).flat().filter(v => v.patientId === u.patientId && v.status === 'waiting');
    if (mineVisits.length) await db.update(opdVisits).set({ status: 'cancelled', doneAt: new Date() }).where(and(inArray(opdVisits.id, mineVisits.map(v => v.id))));
    return c.json(await mineView(u.workspace, u.patientId));
  });

  /** What passed between the systems for this tester's space. Summaries only, never health data. */
  r.get('/network/messages', requireUser('doctor', 'nurse', 'patient'), async c => {
    const u = c.get('user');
    const rows = await db.select().from(gatewayMessages).where(eq(gatewayMessages.workspace, u.workspace)).orderBy(gatewayMessages.id).limit(200);
    return c.json({ items: rows.reverse().map(m => ({ id: m.id, requestId: m.requestId, from: m.from, to: m.to, path: m.path, status: m.status, summary: m.summary, at: m.at.toISOString() })) });
  });

  /* Registered last: `/opd/:id/...` would otherwise also catch the patient's own `/opd/me/cancel`. */
  async function mine(c: Ctx) {
    const u = c.get('user');
    const [v] = await db.select().from(opdVisits).where(eq(opdVisits.id, c.req.param('id') ?? '')).limit(1);
    return v && u.hfrId && v.workspace === u.workspace && v.hfrId === u.hfrId ? { u, v } : null;
  }
  const change = (path: string, action: string, allowed: Visit['status'][], apply: (v: Visit, others: Visit[]) => Partial<Visit> | string) =>
    r.post(path, requireUser('doctor', 'nurse'), async c => {
      const m = await mine(c); if (!m) return c.json(NOT_FOUND, 404);
      if (!allowed.includes(m.v.status as Visit['status'])) return c.json({ error: 'invalid', message: `This visit is already ${m.v.status}.` }, 409);
      const others = await visitsOn(db, m.u.workspace, m.u.hfrId!, m.v.day);
      const out = apply(m.v, others);
      if (typeof out === 'string') return c.json({ error: 'invalid', message: out }, 409);
      await db.update(opdVisits).set(out).where(eq(opdVisits.id, m.v.id));
      if (m.v.patientId) await db.insert(accessLog).values({ userId: m.u.id, role: m.u.role, action, patientId: m.v.patientId, outcome: 'allowed' });
      return c.json(await snapshot(m.u.workspace, m.u.hfrId!));
    });
  change('/opd/:id/call', 'opd-call', ['waiting'], (_v, all) => all.some(x => x.status === 'ongoing') ? 'Finish the patient who is being seen first.' : { status: 'ongoing', calledAt: new Date() });
  change('/opd/:id/done', 'opd-done', ['ongoing'], () => ({ status: 'done', doneAt: new Date() }));
  change('/opd/:id/cancel', 'opd-cancel', ['waiting', 'ongoing'], () => ({ status: 'cancelled', doneAt: new Date() }));
  change('/opd/:id/priority', 'opd-priority', ['waiting'], v => ({ priority: v.priority === 'urgent' ? 'routine' : 'urgent' }));

  return r;
}
