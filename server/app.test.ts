import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, type Db } from './db/client';
import { createApp } from './app';
import { DevAuthProvider } from './auth/provider';
import { loadConfig } from './config';
import { accessLog, consents, sessions } from './db/schema';
import { DEV_DOCTOR, DEV_NURSE, FACILITY_HFR, seed } from './seed';

const OTP = '482915';
const P1_ABHA = '91-2612-3348-1056';
const P2_ABHA = '14-7004-8821-5590';
const JSON_H = { 'content-type': 'application/json' };

let db: Db;
let app: ReturnType<typeof createApp>;

const post = (path: string, body: unknown, cookie?: string, extra: Record<string, string> = {}) =>
  app.request(`/api${path}`, { method: 'POST', headers: { ...JSON_H, ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body) });
const get = (path: string, cookie?: string) => app.request(`/api${path}`, { headers: cookie ? { cookie } : {} });

async function signIn(body: Record<string, string>): Promise<string> {
  const r = await post('/auth/otp/verify', { otp: OTP, ...body });
  expect(r.status).toBe(200);
  const raw = r.headers.get('set-cookie')!;
  return raw.split(';')[0];
}
const doctor = () => signIn({ role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR });
const nurse = () => signIn({ role: 'nurse', hprId: DEV_NURSE.hprId, hfrId: FACILITY_HFR });
const patient = (abha: string) => signIn({ role: 'patient', abha });

beforeAll(async () => {
  db = await createDb();
  await seed(db);
  app = createApp({ db, config: loadConfig({ DEV_OTP: OTP, REQUIRE_OTP: 'true' }), auth: new DevAuthProvider(OTP) });
}, 60_000);

describe('sign-in', () => {
  it('sets an httpOnly session cookie and returns the user', async () => {
    const r = await post('/auth/otp/verify', { otp: OTP, role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(r.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);
    expect((await r.json()).user.name).toBe('Dr. Swati Mani');
  });

  it('stores only a hash of the token, never the token', async () => {
    const cookie = await doctor();
    const token = cookie.split('=')[1];
    const rows = await db.select().from(sessions);
    expect(rows.some(s => s.id === token)).toBe(false);
  });

  it('gives a wrong code and an unknown account the same reply', async () => {
    const wrongCode = await post('/auth/otp/verify', { otp: '000000', role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR });
    const unknown = await post('/auth/otp/verify', { otp: OTP, role: 'doctor', hprId: '00-0000-0000-0000', hfrId: FACILITY_HFR });
    expect(wrongCode.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrongCode.json()).toEqual(await unknown.json());
  });

  it('locks an identifier after five failures, even with the right code afterwards', async () => {
    const body = { role: 'patient', abha: '11-1111-1111-1111' };
    for (let i = 0; i < 5; i++) expect((await post('/auth/otp/verify', { ...body, otp: '000000' })).status).toBe(401);
    expect((await post('/auth/otp/verify', { ...body, otp: OTP })).status).toBe(429);
  });

  it('refuses a cross-site browser write', async () => {
    const r = await post('/auth/otp/verify', { otp: OTP, role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR }, undefined, { origin: 'https://evil.example', host: 'nirantar.example' });
    expect(r.status).toBe(403);
  });

  it('refuses a write that is not JSON', async () => {
    const r = await app.request('/api/auth/otp/verify', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect(r.status).toBe(400);
  });

  it('logout revokes the session at once', async () => {
    const cookie = await doctor();
    expect((await get('/auth/me', cookie)).status).toBe(200);
    expect((await post('/auth/logout', {}, cookie)).status).toBe(200);
    expect((await get('/auth/me', cookie)).status).toBe(401);
  });
});

describe('access to a record', () => {
  it('needs a session', async () => {
    expect((await get('/patients/P1/recall')).status).toBe(401);
    expect((await get('/patients/P1/original')).status).toBe(401);
  });

  it('opens a patient by ABHA for a doctor and returns the record', async () => {
    const cookie = await doctor();
    const l = await post('/patients/lookup', { abha: P1_ABHA }, cookie);
    expect(l.status).toBe(200);
    const { patientId, name } = await l.json();
    expect(patientId).toBe('P1');
    expect(name).toMatch(/Rajesh/);
    const r = await get(`/patients/${patientId}/recall`, cookie);
    expect(r.status).toBe(200);
    const recall = await r.json();
    expect(recall.trends.find((t: { code: string }) => t.code === 'hba1c').latest.value).toBe(5.9);
  });

  it('shows an unknown ABHA and a missing consent identically', async () => {
    const cookie = await doctor();
    await db.update(consents).set({ revokedAt: new Date() }).where(eq(consents.patientId, 'P2'));
    const noConsent = await post('/patients/lookup', { abha: P2_ABHA }, cookie);
    const unknown = await post('/patients/lookup', { abha: '99-9999-9999-9999' }, cookie);
    expect(noConsent.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await noConsent.json()).toEqual(await unknown.json());
    expect((await get('/patients/P2/recall', cookie)).status).toBe(404);
    await db.update(consents).set({ revokedAt: null }).where(eq(consents.patientId, 'P2'));
  });

  it('lets a patient read only their own record', async () => {
    const cookie = await patient(P1_ABHA);
    expect((await get('/patients/P1/recall', cookie)).status).toBe(200);
    expect((await get('/patients/P2/recall', cookie)).status).toBe(404);
    expect((await post('/patients/lookup', { abha: P2_ABHA }, cookie)).status).toBe(403);
  });

  it('serves the original PDF only to someone allowed to open the patient', async () => {
    const cookie = await nurse();
    const r = await get('/patients/P1/original', cookie);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    expect((await get('/patients/P1/original', await patient(P2_ABHA))).status).toBe(404);
  });

  it('rejects malformed ids', async () => {
    const cookie = await doctor();
    expect((await get('/patients/..%2F..%2Fetc/recall', cookie)).status).toBe(404);
    expect((await get('/patients/P1/documents/..%2Fx', cookie)).status).toBe(404);
  });

  it('writes an access log row for allowed and denied reads', async () => {
    const cookie = await patient(P1_ABHA);
    await get('/patients/P1/recall', cookie);
    await get('/patients/P2/recall', cookie);
    const rows = await db.select().from(accessLog).where(and(eq(accessLog.role, 'patient'), eq(accessLog.action, 'view-record')));
    expect(rows.some(r => r.patientId === 'P1' && r.outcome === 'allowed')).toBe(true);
    expect(rows.some(r => r.patientId === 'P2' && r.outcome === 'denied')).toBe(true);
  });
});

describe('confirming a value', () => {
  it('records who confirmed it and shows it in the record', async () => {
    const cookie = await nurse();
    const before = await (await get('/patients/P1/recall', cookie)).json();
    const fact = before.facts.find((f: { verification: string }) => f.verification === 'imported');
    expect((await post('/patients/P1/verify', { factIds: [fact.id] }, cookie)).status).toBe(200);
    const after = await (await get('/patients/P1/recall', cookie)).json();
    const f2 = after.facts.find((f: { id: string }) => f.id === fact.id);
    expect(f2.verification).toBe('verified');
    expect(f2.verifiedBy).toBe('Sr. Kavita Mishra');
  });

  it('is not allowed for a patient, and ignores ids that are not facts', async () => {
    expect((await post('/patients/P1/verify', { factIds: ['x'] }, await patient(P1_ABHA))).status).toBe(403);
    expect((await post('/patients/P1/verify', { factIds: ['not-a-fact'] }, await doctor())).status).toBe(400);
  });
});

describe('configuration', () => {
  it('refuses to start in production with the dev code unless it is allowed on purpose', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', REQUIRE_OTP: 'true' })).toThrow(/dev sign-in code/);
    expect(() => loadConfig({ NODE_ENV: 'production', REQUIRE_OTP: 'true', ALLOW_DEV_OTP: 'true' })).not.toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production' })).not.toThrow(); // no code is asked for by default
  });
});
