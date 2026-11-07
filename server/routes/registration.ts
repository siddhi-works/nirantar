import { Hono } from 'hono';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, count, desc, eq, gt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { accessLog, ashaReferrals, consentEvents, documents, editRequests, educationLog, fileBlobs, factVerifications, observations, observationVersions, opdVisits, patientAdvice, patients, registeredPatients, registrationDrafts, sessions, simCareContexts, users } from '../db/schema';
import { scope } from '../seed';
import { OBS_BY_CODE } from '../../src/domain/observations';
import { countRequests, record } from '../auth/ratelimit';
import { NOT_FOUND, digits, type AppCtx, type Env } from '../ctx';
import { REG_ID, newPatientId, registeredByAbha, registeredPatient, simulatedAbha, type RegisteredRow } from '../registry';
import { SANDBOX_ABHA, mismatches, profileByAbha } from '../sim/abha';

export const CONSENT_VERSION = '2026-11';
/** A public sandbox space is small on purpose. A hospital deployment sets MAX_REGISTERED_PER_SPACE high (or 0 for no cap). */
const MAX_PER_SPACE = process.env.MAX_REGISTERED_PER_SPACE === undefined ? 25 : Number(process.env.MAX_REGISTERED_PER_SPACE) || Infinity;
const MAX_OPEN_DRAFTS = 10;
const PER_PERSON = 90; // steps per person per 10 minutes
const DRAFT_MINUTES = 15;
const MAX_OTP_TRIES = 3;
const REQUIRED = ['create-record', 'abha-link'] as const;
const PURPOSES = ['create-record', 'abha-link', 'share-abdm'] as const;

const details = z.object({
  name: z.string().trim().min(2).max(80).regex(/^[\p{L}][\p{L}\p{M} .'’-]*$/u),
  age: z.number().int().min(0).max(120),
  sex: z.enum(['M', 'F', 'O']),
  phone: z.string().max(20),
  place: z.string().trim().max(60).optional(),
  abha: z.string().max(40).optional(),
  createAbha: z.boolean().optional(),
});

const hash = (s: string) => createHash('sha256').update(s).digest();
const mask = (phone: string) => 'XXXXXX' + phone.slice(-4);

export const profileOf = (p: RegisteredRow) => ({
  id: p.id, name: p.name, age: p.age, sex: p.sex as 'M' | 'F' | 'O', abha: p.abha, abhaSource: p.abhaSource as 'registry' | 'created',
  phone: p.phone, place: p.place ?? undefined, registeredBy: p.byLabel, registeredAt: p.createdAt.toISOString(), hfrId: p.hfrId,
  verifiedAt: p.verifiedAt.toISOString(), verifyMethod: p.verifyMethod, consentPurposes: p.consentPurposes.split(','), consentVersion: p.consentVersion,
  consentMode: p.consentMode as 'in-person-signed' | 'in-person-verbal', consentAt: p.consentAt.toISOString(),
});

/**
 * Registering a patient takes three steps, and nothing becomes a patient before all three are done:
 *   1. start: the details are checked and, when the patient has an ABHA, matched against the ABHA profile;
 *   2. verify: the patient proves it is them with a code sent to their mobile;
 *   3. complete: the patient's consent is recorded, and only then is the record created.
 */
export function registrationRoutes({ db, requireUser, open }: AppCtx) {
  const r = new Hono<Env>();
  const bad = (c: { json: (b: unknown, s: number) => Response }, message: string, status: 400 | 409 | 410 | 422 | 429 = 400, extra: Record<string, unknown> = {}) => c.json({ error: 'invalid', message, ...extra }, status);

  async function throttled(userId: string) {
    const key = `reg:${userId}`; // userId already carries the space, see the callers
    if (await countRequests(db, key) >= PER_PERSON) return true;
    await record(db, key, true);
    return false;
  }
  const taken = async (workspace: string, hfr: string, abha: string) => {
    const [seeded] = await db.select({ id: patients.id }).from(patients).where(eq(patients.abha, abha)).limit(1);
    return !!seeded || !!(await registeredByAbha(db, workspace, hfr, abha));
  };

  /** The made-up people in the sandbox ABHA registry, so a tester knows whom to register. */
  r.get('/patients/register/identities', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const items = await Promise.all(SANDBOX_ABHA.map(async p => ({ ...p, registered: !!user.hfrId && await taken(user.workspace, user.hfrId, p.abha) })));
    return c.json({ items });
  });

  r.post('/patients/register/start', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    if (!user.hfrId) return c.json(NOT_FOUND, 404);
    const parsed = details.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad(c, 'Check the name (letters only), age and sex.');
    const b = parsed.data;
    if (await throttled(`${user.id}:${user.workspace}`)) return c.json({ error: 'too_many_attempts' }, 429);

    const phone = digits(b.phone).slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) return bad(c, 'Enter the patient’s 10-digit mobile number. The verification code goes there.');

    const [have] = await db.select({ n: count() }).from(registeredPatients).where(eq(registeredPatients.workspace, user.workspace));
    if ((have?.n ?? 0) >= MAX_PER_SPACE) return bad(c, `This sample space holds up to ${MAX_PER_SPACE} registered patients. Choose "Start with fresh sample data" to clear them.`, 409);
    const [open_] = await db.select({ n: count() }).from(registrationDrafts).where(and(eq(registrationDrafts.workspace, user.workspace), gt(registrationDrafts.expiresAt, new Date())));
    if ((open_?.n ?? 0) >= MAX_OPEN_DRAFTS) return bad(c, 'Too many registrations are waiting for a code. Finish or wait for them to expire.', 429);

    let abha: string; let source: 'registry' | 'created';
    if (b.createAbha) {
      source = 'created';
      abha = '';
      for (let i = 0; i < 20 && !abha; i++) { const a = simulatedAbha(); if (!(await taken(user.workspace, user.hfrId, a))) abha = a; }
    } else {
      abha = digits(b.abha ?? '');
      if (abha.length !== 14) return bad(c, 'An ABHA number has 14 digits. If the patient has none, choose “The patient has no ABHA”.');
      const profile = profileByAbha(abha);
      if (!profile) return bad(c, 'This ABHA number was not found in the sandbox ABHA registry. Check the number, or pick one of the sample identities.', 422, { field: 'abha' });
      if (await taken(user.workspace, user.hfrId, abha)) return bad(c, 'This patient is already registered here.', 409);
      const wrong = mismatches({ name: b.name, age: b.age, sex: b.sex, mobile: phone }, profile);
      if (wrong.length) return bad(c, `These details do not match the ABHA profile: ${wrong.join(', ')}. Check them against the patient’s ABHA card or app. Nothing was saved.`, 422, { fields: wrong });
      source = 'registry';
    }

    const otp = String(randomInt(100000, 1000000));
    const id = randomUUID();
    await db.insert(registrationDrafts).values({
      id, workspace: user.workspace, hfrId: user.hfrId, userId: user.id, abha, abhaSource: source, otpHash: hash(otp).toString('hex'),
      details: JSON.stringify({ name: b.name.replace(/\s+/g, ' '), age: b.age, sex: b.sex, phone, place: b.place || null }),
      expiresAt: new Date(Date.now() + DRAFT_MINUTES * 60_000),
    });
    // Real ABDM sends this to the patient's phone. The sandbox sends nothing, so it shows the code instead, and says so.
    return c.json({ draftId: id, maskedPhone: mask(phone), abha, abhaSource: source, expiresInMinutes: DRAFT_MINUTES, sandboxOtp: otp }, 201);
  });

  async function draftFor(userId: string, workspace: string, id: string) {
    const [d] = await db.select().from(registrationDrafts).where(eq(registrationDrafts.id, id)).limit(1);
    if (!d || d.userId !== userId || d.workspace !== workspace) return { error: 404 as const };
    if (d.expiresAt.getTime() < Date.now()) { await db.delete(registrationDrafts).where(eq(registrationDrafts.id, id)); return { error: 410 as const }; }
    return { d };
  }

  r.post('/patients/register/verify', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const body = z.object({ draftId: z.string().max(50), otp: z.string().regex(/^\d{6}$/) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return bad(c, 'Enter the 6-digit code.');
    if (await throttled(`${user.id}:${user.workspace}`)) return c.json({ error: 'too_many_attempts' }, 429);
    const { d, error } = await draftFor(user.id, user.workspace, body.data.draftId);
    if (!d) return error === 410 ? bad(c, 'This registration expired. Start again.', 410) : c.json(NOT_FOUND, 404);
    if (d.attempts >= MAX_OTP_TRIES) { await db.delete(registrationDrafts).where(eq(registrationDrafts.id, d.id)); return bad(c, 'Too many wrong codes. Start the registration again.', 429); }
    const ok = timingSafeEqual(hash(body.data.otp), Buffer.from(d.otpHash, 'hex'));
    if (!ok) {
      await db.update(registrationDrafts).set({ attempts: d.attempts + 1 }).where(eq(registrationDrafts.id, d.id));
      return bad(c, `That code is not right. ${MAX_OTP_TRIES - d.attempts - 1} ${MAX_OTP_TRIES - d.attempts - 1 === 1 ? 'try' : 'tries'} left.`, 422);
    }
    await db.update(registrationDrafts).set({ verifiedAt: new Date() }).where(eq(registrationDrafts.id, d.id));
    return c.json({ ok: true });
  });

  r.post('/patients/register/complete', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const body = z.object({
      draftId: z.string().max(50),
      consent: z.object({ purposes: z.array(z.enum(PURPOSES)).max(3), mode: z.enum(['in-person-signed', 'in-person-verbal']) }),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return bad(c, 'Record the patient’s consent first.');
    if (await throttled(`${user.id}:${user.workspace}`)) return c.json({ error: 'too_many_attempts' }, 429);
    const { d, error } = await draftFor(user.id, user.workspace, body.data.draftId);
    if (!d) return error === 410 ? bad(c, 'This registration expired. Start again.', 410) : c.json(NOT_FOUND, 404);
    if (!d.verifiedAt) return bad(c, 'The patient’s identity has not been verified yet.', 409);
    const purposes = [...new Set(body.data.consent.purposes)];
    const missing = REQUIRED.filter(p => !purposes.includes(p));
    if (missing.length) return bad(c, 'The patient must agree to a health record being created and linked to their ABHA. Without that, no record is made.', 422);

    const id = newPatientId();
    const who = JSON.parse(d.details) as { name: string; age: number; sex: string; phone: string; place: string | null };
    const now = new Date();
    try {
      await db.insert(registeredPatients).values({
        id, workspace: user.workspace, hfrId: d.hfrId, abha: d.abha, abhaSource: d.abhaSource, name: who.name, age: who.age, sex: who.sex, phone: who.phone, place: who.place,
        verifiedAt: d.verifiedAt, verifyMethod: 'mobile-otp', consentPurposes: purposes.join(','), consentVersion: CONSENT_VERSION, consentMode: body.data.consent.mode, consentAt: now,
        byUserId: user.id, byLabel: user.name,
      });
    } catch { await db.delete(registrationDrafts).where(eq(registrationDrafts.id, d.id)); return bad(c, 'This patient is already registered here.', 409); }
    await db.delete(registrationDrafts).where(eq(registrationDrafts.id, d.id));
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action: 'register-patient', patientId: id, outcome: 'allowed' });
    const [row] = await db.select().from(registeredPatients).where(eq(registeredPatients.id, id));
    return c.json({ patient: profileOf(row) }, 201);
  });

  /** The patients this staff member's hospital has registered in their own space, newest first. */
  r.get('/patients/registered', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }).safeParse(c.req.query());
    if (!user.hfrId || !q.success) return c.json({ items: [], total: 0 });
    const where = and(eq(registeredPatients.workspace, user.workspace), eq(registeredPatients.hfrId, user.hfrId));
    const [{ n }] = await db.select({ n: count() }).from(registeredPatients).where(where);
    const rows = await db.select().from(registeredPatients).where(where).orderBy(desc(registeredPatients.createdAt), desc(registeredPatients.id)).limit(q.data.limit).offset(q.data.offset);
    return c.json({ items: rows.map(profileOf), total: n });
  });

  r.get('/patients/:id/profile', requireUser('doctor', 'nurse'), async c => {
    const id = c.req.param('id');
    if (!REG_ID.test(id) || !(await open(c, id, 'view-profile'))) return c.json(NOT_FOUND, 404);
    const row = await registeredPatient(db, id);
    return row ? c.json(profileOf(row)) : c.json(NOT_FOUND, 404);
  });

  /** A registered patient's own page: who they are, what they agreed to, and the values staff have recorded or confirmed. */
  r.get('/patients/:id/home', requireUser('patient'), async c => {
    const id = c.req.param('id');
    const u = c.get('user');
    if (!REG_ID.test(id) || id !== u.patientId || !(await open(c, id, 'view-own-record'))) return c.json(NOT_FOUND, 404);
    const p = await registeredPatient(db, id);
    if (!p) return c.json(NOT_FOUND, 404);
    const rows = await db.select().from(observations).where(and(eq(observations.patientId, scope(id, u.workspace)), inArray(observations.status, ['verified', 'corrected'])));
    const values = rows.map(o => ({ code: o.code, label: OBS_BY_CODE[o.code]?.label ?? o.code, date: o.obsDate, value: o.valueNum, display: o.valueNum !== null ? `${o.valueNum}${OBS_BY_CODE[o.code]?.unit ? (OBS_BY_CODE[o.code].unit === '%' ? '%' : ' ' + OBS_BY_CODE[o.code].unit) : ''}` : String(o.valueText ?? ''), status: o.status, source: { origin: o.origin, documentId: o.documentId, quote: o.sourceText, by: o.byLabel } }));
    return c.json({ profile: profileOf(p), values });
  });

  /* ───────── the patient's rights over their record, carried out by staff at the patient's request ───────── */

  async function mine(c: Parameters<typeof open>[0], action: string) {
    const id = c.req.param('id') ?? '';
    if (!REG_ID.test(id) || !(await open(c, id, action))) return null;
    return (await registeredPatient(db, id)) ?? null;
  }

  /** A copy of everything held about the patient: what they are entitled to ask for. */
  r.get('/patients/:id/export', requireUser('doctor', 'nurse'), async c => {
    const p = await mine(c, 'export-record');
    if (!p) return c.json(NOT_FOUND, 404);
    const key = scope(p.id, p.workspace);
    const obs = await db.select().from(observations).where(eq(observations.patientId, key));
    const docs = await db.select().from(documents).where(eq(documents.patientId, key));
    const history = await db.select().from(consentEvents).where(eq(consentEvents.patientId, p.id));
    const mineIn = <T extends { workspace: never; patientId: never }>(t: T) => and(eq(t.workspace, p.workspace as never), eq(t.patientId, p.id as never));
    const visits = await db.select().from(opdVisits).where(mineIn(opdVisits as never));
    const advice = await db.select().from(patientAdvice).where(mineIn(patientAdvice as never));
    const taught = await db.select().from(educationLog).where(mineIn(educationLog as never));
    const asks = await db.select().from(editRequests).where(mineIn(editRequests as never));
    const out = {
      exportedAt: new Date().toISOString(), format: 'nirantar-patient-export/1',
      patient: profileOf(p),
      consentHistory: history.map(h => ({ action: h.action, purposes: h.purposes.split(','), mode: h.mode, reason: h.reason, by: h.byLabel, at: h.at.toISOString() })),
      values: obs.map(o => ({ code: o.code, value: o.valueNum ?? o.valueText, date: o.obsDate, status: o.status, origin: o.origin, enteredBy: o.byLabel })),
      documents: docs.map(d => ({ type: d.docType, fileName: d.fileName, uploadedAt: d.createdAt.toISOString(), sharedWithAbdm: d.syncStatus === 'pushed' })),
      opdVisits: visits.map(v => ({ day: v.day, token: v.token, status: v.status, source: v.source })),
      lifestyleAdvice: advice.map(a => ({ text: a.text, by: a.byLabel, at: a.at.toISOString() })),
      educationGiven: taught.map(e => ({ topic: e.topic, by: e.byLabel, at: e.at.toISOString() })),
      correctionRequests: asks.map(a => ({ subject: a.subject, proposed: a.proposed, reason: a.reason, status: a.status, decision: a.decisionNote ?? null })),
    };
    return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="patient-${p.id}-export.json"`, 'Cache-Control': 'private, no-store' } });
  });

  /** Give or withdraw the optional consent to share through ABDM. Withdrawing the other two means erasing the record. */
  r.post('/patients/:id/consent', requireUser('doctor', 'nurse'), async c => {
    const p = await mine(c, 'change-consent');
    if (!p) return c.json(NOT_FOUND, 404);
    const body = z.object({
      action: z.enum(['grant', 'withdraw']), purpose: z.enum(PURPOSES), mode: z.enum(['in-person-signed', 'in-person-verbal']).optional(), reason: z.string().trim().max(200).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return bad(c, 'Check the request and try again.');
    const user = c.get('user');
    const { action, purpose } = body.data;
    if (purpose !== 'share-abdm') return bad(c, action === 'withdraw' ? 'Withdrawing consent to keep the record or link the ABHA number means the record has to be erased. Use “Erase this record”.' : 'That consent was given at registration.', 409);
    if (action === 'grant' && !body.data.mode) return bad(c, 'Say how the consent was taken.');
    const now = p.consentPurposes.split(',').filter(Boolean);
    const next = action === 'grant' ? [...new Set([...now, purpose])] : now.filter(x => x !== purpose);
    if (next.join(',') === now.join(',')) return bad(c, action === 'grant' ? 'This consent has already been given.' : 'This consent has already been withdrawn.', 409);
    await db.update(registeredPatients).set({ consentPurposes: next.join(',') }).where(eq(registeredPatients.id, p.id));
    await db.insert(consentEvents).values({ patientId: p.id, workspace: p.workspace, action: action === 'grant' ? 'granted' : 'withdrawn', purposes: purpose, mode: body.data.mode ?? null, reason: body.data.reason ?? null, byLabel: user.name });
    const [row] = await db.select().from(registeredPatients).where(eq(registeredPatients.id, p.id));
    return c.json(profileOf(row));
  });

  /** Erase the patient and everything held about them. Only a tombstone with no personal details is kept, as proof it was done. */
  r.post('/patients/:id/erase', requireUser('doctor', 'nurse'), async c => {
    const p = await mine(c, 'erase-record');
    if (!p) return c.json(NOT_FOUND, 404);
    const body = z.object({ confirmName: z.string().max(80), reason: z.string().trim().min(3).max(200) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return bad(c, 'Give a reason for the erasure.');
    if (body.data.confirmName.trim().toLowerCase() !== p.name.toLowerCase()) return bad(c, 'Type the patient’s full name exactly to confirm the erasure.', 422);
    const user = c.get('user');
    const key = scope(p.id, p.workspace);
    const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.patientId, key));
    if (docs.length) await db.delete(fileBlobs).where(inArray(fileBlobs.id, docs.map(d => d.id)));
    for (const t of [documents, observations, observationVersions, factVerifications, simCareContexts]) await db.delete(t).where(eq(t.patientId, key));
    await db.delete(consentEvents).where(eq(consentEvents.patientId, p.id));
    // Everything else held about this person, wherever it lives: the queue, requests, advice, education, and their sign-in.
    for (const t of [opdVisits, editRequests, educationLog, patientAdvice, ashaReferrals]) await db.delete(t).where(and(eq(t.workspace, p.workspace), eq(t.patientId, p.id)));
    const login = await db.select({ id: users.id }).from(users).where(eq(users.patientId, p.id));
    if (login.length) { await db.delete(sessions).where(inArray(sessions.userId, login.map(l => l.id))); await db.delete(users).where(inArray(users.id, login.map(l => l.id))); }
    await db.delete(registeredPatients).where(eq(registeredPatients.id, p.id));
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action: `erase-patient: ${body.data.reason}`.slice(0, 120), patientId: p.id, outcome: 'allowed' });
    return c.json({ erased: true, documents: docs.length });
  });

  return r;
}
