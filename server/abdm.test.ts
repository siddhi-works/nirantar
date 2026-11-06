import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setup, P1_ABHA, P2_ABHA, type Harness } from './test-utils';
import { hipConsentCopies, receivedRecords, simConsents } from './db/schema';
import { verify } from './abdm/artefact';

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);

const REQ = { purpose: 'Treatment', validityDays: 30 };
/** The receiving hospital asks; returns the consent id once the patient (P2) has answered. */
async function ask(ws: string, extra: Record<string, unknown> = {}, grant: Record<string, unknown> | null = { decision: 'grant' }) {
  const b = await h.doctorB(ws); const p = await h.patient(P2_ABHA, ws);
  expect((await h.post('/exchange/requests', { abha: P2_ABHA, ...REQ, ...extra }, b)).status).toBe(202);
  const item = ((await (await h.get('/exchange/consents', p)).json()).items as { id: string; status: string }[]).find(x => x.status === 'requested')!;
  const res = grant ? await h.post(`/exchange/consents/${item.id}/decision`, grant, p) : null;
  return { b, p, id: item.id, res };
}
const types = (bundle: { entry: { resource: { resourceType: string } }[] }) => new Set(bundle.entry.map(e => e.resource.resourceType));
async function fetched(b: string, id: string) {
  const r = await h.post(`/exchange/consents/${id}/fetch`, {}, b);
  if (r.status !== 201) return { status: r.status, body: await r.json() };
  const view = await (await h.get(`/exchange/received/${(await r.json()).receivedId}`, b)).json();
  return { status: 201, view, body: view };
}

describe('the signed consent', () => {
  it('records what was asked, what the patient allowed, and who signed it, and the sending hospital keeps its own copy', async () => {
    const { b, id } = await ask('a1a1a1a1a1a1', { hiTypes: ['Prescription', 'DiagnosticReport'], keepDays: 14 }, { decision: 'grant', hiTypes: ['Prescription'], validityDays: 7, keepDays: 3 });
    const [row] = await h.db.select().from(simConsents).where(eq(simConsents.id, id));
    expect(row).toMatchObject({ status: 'granted', hiTypes: 'Prescription', validityDays: 7, keepDays: 3, purposeCode: 'CAREMGT', requesterName: 'Dr. Rohit Verma', requesterReg: '71-6100-2255-3094' });
    const art = verify(row.artefact!, row.signature!)!;
    expect(art).toMatchObject({ status: 'GRANTED', hiTypes: ['Prescription'], hiu: { id: 'IN0900022991' }, hip: { id: 'IN2900011882' }, purpose: { code: 'CAREMGT' } });
    expect(art.permission).toMatchObject({ accessMode: 'VIEW', frequency: { unit: 'HOUR', value: 1, repeats: 0 } });
    expect(new Date(art.permission.dataEraseAt).getTime() - new Date(art.createdAt).getTime()).toBeCloseTo(3 * 86_400_000, -4);
    const [copy] = await h.db.select().from(hipConsentCopies).where(eq(hipConsentCopies.consentId, id));
    expect(copy).toMatchObject({ status: 'GRANTED', hipHfr: 'IN2900011882', signature: row.signature });
    expect(verify(copy.artefact, copy.signature)).toEqual(art);
    expect(b).toBeTruthy();
  });

  it('lets the patient allow less than was asked, never more, and never a longer period', async () => {
    const { p, id, res } = await ask('b2b2b2b2b2b2', { hiTypes: ['DiagnosticReport'] }, { decision: 'grant', hiTypes: ['Prescription'] });
    expect(res!.status).toBe(400); // Prescription was not asked for
    expect((await h.post(`/exchange/consents/${id}/decision`, { decision: 'grant', hiTypes: [] }, p)).status).toBe(400);
    expect((await h.post(`/exchange/consents/${id}/decision`, { decision: 'grant', validityDays: 365, keepDays: 365 }, p)).status).toBe(200);
    const [row] = await h.db.select().from(simConsents).where(eq(simConsents.id, id));
    expect(row.validityDays).toBe(30); // clamped to what was asked
    expect(row.keepDays).toBe(30);
  });

  it('sends only the kinds of record that were allowed, and only values inside the date range', async () => {
    const { b, id } = await ask('c3c3c3c3c3c3', {}, { decision: 'grant', hiTypes: ['Prescription'] });
    const got = await fetched(b, id);
    expect(got.status).toBe(201);
    const t = types(got.view.bundle);
    expect(t.has('MedicationStatement')).toBe(true);
    expect(t.has('Observation')).toBe(false);
    expect(t.has('Condition')).toBe(false);
    expect(t.has('Patient')).toBe(true);

    const second = await ask('d4d4d4d4d4d4', { hiTypes: ['DiagnosticReport'], from: '2001-01-01' }, { decision: 'grant' });
    const only = await fetched(second.b, second.id);
    const obs = only.view.bundle.entry.map((e: { resource: { resourceType: string; effectiveDateTime?: string } }) => e.resource).filter((x: { resourceType: string }) => x.resourceType === 'Observation');
    expect(obs.length).toBeGreaterThan(0);
    for (const o of obs) expect(String(o.effectiveDateTime) >= '2001-01-01').toBe(true);
    expect(types(only.view.bundle).has('MedicationStatement')).toBe(false);
  });

  it('is refused if the signed consent was altered, or the sending hospital’s copy was withdrawn', async () => {
    const one = await ask('e5e5e5e5e5e5');
    const [row] = await h.db.select().from(simConsents).where(eq(simConsents.id, one.id));
    await h.db.update(simConsents).set({ artefact: row.artefact!.replace('"OPConsultation"', '"OPConsultation","Everything"') }).where(eq(simConsents.id, one.id));
    const bad = await fetched(one.b, one.id);
    expect(bad.status).toBe(403);
    expect(bad.body.message).toMatch(/could not be verified/);

    const two = await ask('f6f6f6f6f6f6');
    await h.db.update(hipConsentCopies).set({ status: 'REVOKED' }).where(eq(hipConsentCopies.consentId, two.id));
    const refused = await fetched(two.b, two.id);
    expect(refused.status).toBe(403);
    expect(refused.body.message).toMatch(/sending hospital refused/);
    expect((await h.db.select().from(receivedRecords).where(eq(receivedRecords.consentId, two.id))).length).toBe(0);
  });
});

describe('what the receiving hospital must do afterwards', () => {
  it('erases its copy on the date it was told to, and the daily clean-up does the same for every space', async () => {
    const { b, id } = await ask('a7a7a7a7a7a7');
    const got = await fetched(b, id);
    expect(got.status).toBe(201);
    await h.db.update(simConsents).set({ dataEraseAt: new Date(Date.now() - 1000) }).where(eq(simConsents.id, id));
    const list = (await (await h.get('/exchange/received', b)).json()).items as unknown[];
    expect(list).toEqual([]);
    expect((await h.db.select().from(receivedRecords).where(eq(receivedRecords.consentId, id))).length).toBe(0);

    const other = await ask('b8b8b8b8b8b8');
    await fetched(other.b, other.id);
    await h.db.update(simConsents).set({ dataEraseAt: new Date(Date.now() - 1000) }).where(eq(simConsents.id, other.id));
    const run = await (await h.app.request('/api/maintenance')).json();
    expect(run.receivedCopiesErased).toBeGreaterThanOrEqual(1);
    expect((await h.db.select().from(receivedRecords).where(eq(receivedRecords.consentId, other.id))).length).toBe(0);
  });

  it('keeps a copy after the permission merely expires, until its erase date', async () => {
    const { b, id } = await ask('c9c9c9c9c9c9');
    await fetched(b, id);
    await h.db.update(simConsents).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(simConsents.id, id));
    expect((await (await h.get('/exchange/received', b)).json()).items).toHaveLength(1);
    expect((await h.post(`/exchange/consents/${id}/fetch`, {}, b)).status).toBe(404); // but no new transfer
  });
});

describe('the message log', () => {
  it('shows each hop of a consent and a transfer, in order, without any health data', async () => {
    const ws = 'd1d1d1d1d1d1';
    const { b, p, id } = await ask(ws);
    await fetched(b, id);
    await h.post(`/exchange/consents/${id}/revoke`, {}, p);
    const log = (await (await h.get('/network/messages', b)).json()).items as { path: string; requestId: string; summary: string }[];
    const paths = [...log].reverse().map(m => m.path);
    const at = (x: string) => paths.indexOf(x);
    expect(at('/v3/consent-requests/init')).toBeGreaterThanOrEqual(0);
    expect(at('/v3/consent-requests/init')).toBeLessThan(at('/v3/consent-requests/approve'));
    expect(at('/v3/consent-requests/approve')).toBeLessThan(at('/v3/health-information/cm/request'));
    expect(at('/v3/health-information/cm/request')).toBeLessThan(at('/v3/health-information/hip/request'));
    expect(at('/v3/health-information/hip/request')).toBeLessThan(at('/v3/hiu/health-information/transfer'));
    expect(at('/v3/hiu/health-information/transfer')).toBeLessThan(at('/v3/consent/revoke'));
    expect(paths).toContain('erase-received-copy');
    const dump = JSON.stringify(log);
    for (const secret of ['Rajesh', 'Savitri', 'Metformin', 'HbA1c', P1_ABHA, P2_ABHA]) expect(dump).not.toContain(secret);
  });
});

describe('a patient registered at the other hospital', () => {
  const RAMESH = { name: 'Ramesh Chandra Tiwari', age: 58, sex: 'M', phone: '9876500011', abha: '93-1100-2234-5567' };
  async function registerAt(cookie: string) {
    const s = await (await h.post('/patients/register/start', RAMESH, cookie)).json();
    await h.post('/patients/register/verify', { draftId: s.draftId, otp: s.sandboxOtp }, cookie);
    return (await (await h.post('/patients/register/complete', { draftId: s.draftId, consent: { purposes: ['create-record', 'abha-link'], mode: 'in-person-verbal' } }, cookie)).json()).patient.id as string;
  }
  const dir = async (cookie: string) => (await (await h.get('/patients/directory', cookie)).json()).items as { patientId: string; name: string; holderName: string; access: string; consentId: string | null; receivedId: string | null }[];

  it('is kept at that hospital, shown to the other as a patient it can ask about, and shared only through the patient’s consent', async () => {
    const ws = 'e1e1e1e1e1e1';
    const lucknow = await h.doctorB(ws); const gorakhpur = await h.doctor(ws);
    const id = await registerAt(lucknow);
    await h.post(`/patients/${id}/observations`, { entries: [{ code: 'hba1c', value: 7.4 }, { code: 'fbs', value: 128 }] }, lucknow);

    // each hospital sees every patient, and what it may do
    const fromB = await dir(lucknow);
    expect(fromB.find(x => x.patientId === id)).toMatchObject({ access: 'held', holderName: 'Civil Hospital, Lucknow' });
    expect(fromB.find(x => x.patientId === 'P1')).toMatchObject({ access: 'none', holderName: 'District Hospital, Gorakhpur' });
    const fromA = await dir(gorakhpur);
    expect(fromA.map(x => x.patientId).sort()).toEqual(['P1', 'P2', id].sort());
    expect(fromA.find(x => x.patientId === id)).toMatchObject({ access: 'none', name: RAMESH.name });
    expect(fromA.find(x => x.patientId === 'P1')!.access).toBe('held');
    expect((await h.get(`/patients/${id}/profile`, gorakhpur)).status).toBe(404); // not open without access

    // Gorakhpur asks; the patient (signed in at Civil Hospital's record) allows; Gorakhpur fetches
    expect((await h.post('/exchange/requests', { abha: RAMESH.abha, ...REQ, hiTypes: ['DiagnosticReport'] }, gorakhpur)).status).toBe(202);
    expect((await dir(gorakhpur)).find(x => x.patientId === id)!.access).toBe('requested');
    const patient = await h.patient(RAMESH.abha, ws);
    const item = ((await (await h.get('/exchange/consents', patient)).json()).items as { id: string }[])[0];
    expect((await h.post(`/exchange/consents/${item.id}/decision`, { decision: 'grant' }, patient)).status).toBe(200);
    expect((await dir(gorakhpur)).find(x => x.patientId === id)).toMatchObject({ access: 'granted', consentId: item.id });
    const got = await fetched(gorakhpur, item.id);
    expect(got.status).toBe(201);
    const res = got.view.bundle.entry.map((e: { resource: Record<string, unknown> }) => e.resource);
    expect(res.find((r: { resourceType: string }) => r.resourceType === 'Patient').name[0].text).toBe(RAMESH.name);
    expect(res.find((r: { resourceType: string }) => r.resourceType === 'Organization').name).toBe('Civil Hospital, Lucknow');
    expect(res.filter((r: { resourceType: string }) => r.resourceType === 'Observation').map((o: { code: { text: string } }) => o.code.text).sort()).toEqual(['Fasting glucose (FBS)', 'HbA1c']);
    expect(got.view.fromName).toBe('Civil Hospital, Lucknow');
    expect((await dir(gorakhpur)).find(x => x.patientId === id)!.receivedId).toBeTruthy();

    // the record itself never left Civil Hospital's own data: the holder sees no "received" copy of its own patient
    expect((await (await h.get('/exchange/received', lucknow)).json()).items).toEqual([]);

    // withdrawing makes Gorakhpur erase its copy
    await h.post(`/exchange/consents/${item.id}/revoke`, {}, patient);
    expect((await (await h.get('/exchange/received', gorakhpur)).json()).items).toEqual([]);
    expect((await dir(gorakhpur)).find(x => x.patientId === id)!.access).toBe('revoked');
  });

  it('works the other way: the home hospital’s patient asked about by Civil Hospital, and a hospital cannot ask for a record it holds', async () => {
    const ws = 'e2e2e2e2e2e2';
    const lucknow = await h.doctorB(ws);
    expect((await h.post('/exchange/requests', { abha: P2_ABHA, ...REQ }, lucknow)).status).toBe(202);
    expect((await dir(lucknow)).find(x => x.patientId === 'P2')!.access).toBe('requested');
    const gorakhpur = await h.doctor(ws);
    await h.post('/exchange/requests', { abha: P2_ABHA, ...REQ }, gorakhpur); // ignored: it holds P2
    const own = await h.patient(P2_ABHA, ws);
    expect(((await (await h.get('/exchange/consents', own)).json()).items as unknown[]).length).toBe(1);
  });
});
