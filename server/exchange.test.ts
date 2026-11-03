import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { setup, P1_ABHA, P2_ABHA, type Harness } from './test-utils';
import { accessLog, simCareContexts, simConsents, simTransfers } from './db/schema';

const P1_PDF = new Uint8Array(readFileSync(new URL('./assets/originals/patient-1-followups.pdf', import.meta.url)));
const REQ = { purpose: 'Treatment', validityDays: 30 };
let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);

const request = (cookie: string, abha: string, extra = {}) => h.post('/exchange/requests', { abha, ...REQ, ...extra }, cookie);
const mineB = async (cookie: string) => (await (await h.get('/exchange/requests', cookie)).json()).items as { id: string; abha: string; status: string; hiuName: string; receivedId: string | null }[];
const patientList = async (cookie: string) => (await (await h.get('/exchange/consents', cookie)).json()).items as { id: string; status: string; hiuName: string; purpose: string }[];
const obsOf = (b: { entry: { resource: Record<string, unknown> }[] }, text: string) => b.entry.map(e => e.resource).find(r => r.resourceType === 'Observation' && (r.code as { text: string }).text === text) as Record<string, any> | undefined;

describe('a second hospital asks for a record', () => {
  it('cannot read the record directly, even though it can search', async () => {
    const b = await h.doctorB();
    expect((await h.post('/patients/lookup', { abha: P1_ABHA }, b)).status).toBe(404);
    expect((await h.get('/patients/P1/recall', b)).status).toBe(404);
    expect((await h.get('/patients/P1/original', b)).status).toBe(404);
  });

  it('gets the same reply, and the same kind of list entry, whether or not the ABHA exists', async () => {
    const b = await h.doctorB();
    const real = await request(b, P1_ABHA);
    const nobody = await request(b, '99-9999-9999-9999');
    expect(real.status).toBe(202); expect(nobody.status).toBe(202);
    expect(await real.json()).toEqual(await nobody.json());
    const list = await mineB(b);
    expect(list).toHaveLength(2);
    expect(list.every(x => x.status === 'requested' && x.hiuName === 'Civil Hospital, Lucknow' && x.receivedId === null)).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/Rajesh|Singh/); // no name before the patient agrees
  });

  it('does not stack duplicate requests, and ignores the holding hospital asking itself', async () => {
    const b = await h.doctorB();
    await request(b, P1_ABHA);
    expect((await mineB(b)).length).toBe(2);
    const a = await h.doctor();
    expect((await request(a, P1_ABHA)).status).toBe(202);
    expect(await h.db.select().from(simConsents).where(eq(simConsents.hiuHfr, 'IN2900011882'))).toHaveLength(0);
  });

  it('rejects a malformed request', async () => {
    const b = await h.doctorB();
    expect((await request(b, '123')).status).toBe(400);
    expect((await request(b, P1_ABHA, { purpose: 'Curiosity' })).status).toBe(400);
    expect((await request(b, P1_ABHA, { validityDays: 5000 })).status).toBe(400);
    expect((await h.post('/exchange/requests', { abha: P1_ABHA, ...REQ }, await h.patient(P1_ABHA))).status).toBe(403);
  });
});

describe('the patient decides', () => {
  it('sees only their own requests', async () => {
    const mine = await patientList(await h.patient(P1_ABHA));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'requested', hiuName: 'Civil Hospital, Lucknow', purpose: 'Treatment' });
    expect(await patientList(await h.patient(P2_ABHA))).toHaveLength(0);
  });

  it('cannot answer someone else\'s request', async () => {
    const id = (await patientList(await h.patient(P1_ABHA)))[0].id;
    expect((await h.post(`/exchange/consents/${id}/decision`, { decision: 'grant' }, await h.patient(P2_ABHA))).status).toBe(404);
    expect((await h.post(`/exchange/consents/${id}/decision`, { decision: 'grant' }, await h.doctorB())).status).toBe(403);
  });

  it('keeps the record closed until they grant, and answers only once', async () => {
    const b = await h.doctorB(); const p = await h.patient(P1_ABHA);
    const id = (await patientList(p))[0].id;
    expect((await h.post(`/exchange/consents/${id}/fetch`, {}, b)).status).toBe(404);
    expect((await h.post(`/exchange/consents/${id}/decision`, { decision: 'grant' }, p)).status).toBe(200);
    expect((await h.post(`/exchange/consents/${id}/decision`, { decision: 'deny' }, p)).status).toBe(409);
  });
});

describe('the encrypted transfer', () => {
  let receivedId = '';
  it('delivers the record to the asking hospital as FHIR, and shows who sent it', async () => {
    const b = await h.doctorB();
    const consent = (await mineB(b)).find(x => x.status === 'granted')!;
    const r = await h.post(`/exchange/consents/${consent.id}/fetch`, {}, b);
    expect(r.status).toBe(201);
    receivedId = (await r.json()).receivedId;
    const view = await (await h.get(`/exchange/received/${receivedId}`, b)).json();
    expect(view.fromName).toBe('District Hospital, Gorakhpur');
    expect(view.bundle).toMatchObject({ resourceType: 'Bundle', type: 'document' });
    const types = view.bundle.entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType);
    expect(types[0]).toBe('Composition');
    expect(types).toEqual(expect.arrayContaining(['Patient', 'Organization', 'Condition', 'MedicationStatement', 'Observation']));
    const hb = obsOf(view.bundle, 'HbA1c')!;
    expect(hb.code.coding[0]).toMatchObject({ system: 'http://loinc.org', code: '4548-4' });
    expect(hb.valueQuantity.value).toBeTypeOf('number');
    expect(view.bundle.entry.find((e: { resource: { resourceType: string } }) => e.resource.resourceType === 'Patient').resource.name[0].text).toMatch(/Rajesh/);
    expect((await mineB(b)).find(x => x.id === consent.id)!.receivedId).toBe(receivedId);
  });

  it('never holds the record in readable form at the gateway', async () => {
    const rows = await h.db.select().from(simTransfers);
    expect(rows.length).toBeGreaterThan(0);
    const dump = JSON.stringify(rows);
    for (const secret of ['Rajesh', 'HbA1c', 'Metformin', 'Gorakhpur', 'Observation']) expect(dump).not.toContain(secret);
  });

  it('is visible only to the hospital that asked', async () => {
    expect((await h.get(`/exchange/received/${receivedId}`, await h.doctor())).status).toBe(404);
    expect((await h.get(`/exchange/received/${receivedId}`, await h.patient(P1_ABHA))).status).toBe(403);
    expect((await h.get(`/exchange/received/${receivedId}`)).status).toBe(401);
    const consentId = (await mineB(await h.doctorB())).find(x => x.status === 'granted')!.id;
    expect((await h.post(`/exchange/consents/${consentId}/fetch`, {}, await h.doctor())).status).toBe(404);
  });

  it('stays read-only: a note can be added beside it, the record itself is unchanged', async () => {
    const b = await h.doctorB();
    const before = (await (await h.get(`/exchange/received/${receivedId}`, b)).json()).bundle;
    expect((await h.post(`/exchange/received/${receivedId}/annotations`, { text: 'Checked against our own HbA1c today' }, b)).status).toBe(201);
    expect((await h.post(`/exchange/received/${receivedId}/annotations`, { text: 'x' }, b)).status).toBe(400);
    expect((await h.post(`/exchange/received/${receivedId}/annotations`, { text: 'not mine to add' }, await h.doctor())).status).toBe(404);
    const after = await (await h.get(`/exchange/received/${receivedId}`, b)).json();
    expect(after.bundle).toEqual(before);
    expect(after.annotations).toMatchObject([{ text: 'Checked against our own HbA1c today', by: 'Dr. Rohit Verma' }]);
    expect((await h.req('PUT', `/exchange/received/${receivedId}`, { bundle: {} }, b)).status).toBe(404);
  });

  it('carries a correction with its reason, and sends only final values', async () => {
    const doctor = await h.doctor();
    const rec = await (await h.get('/patients/P1/recall', doctor)).json();
    const fact = rec.trends.find((t: { code: string }) => t.code === 'hba1c').latest;
    await h.post(`/patients/P1/facts/${fact.factId}/correct`, { value: 6.1, reason: 'Slip reads 6.1 on re-checking' }, doctor);
    const b = await h.doctorB();
    const consent = (await mineB(b)).find(x => x.status === 'granted')!;
    const id = (await (await h.post(`/exchange/consents/${consent.id}/fetch`, {}, b)).json()).receivedId;
    const bundle = (await (await h.get(`/exchange/received/${id}`, b)).json()).bundle;
    const corrected = bundle.entry.map((e: { resource: Record<string, any> }) => e.resource).find((r: Record<string, any>) => r.resourceType === 'Observation' && r.note?.[0]?.text.startsWith('Corrected'));
    expect(corrected.valueQuantity.value).toBe(6.1);
    expect(corrected.status).toBe('final');
    expect(corrected.note[0].text).toMatch(/Corrected from 5\.9.*re-checking/);
    const statuses = bundle.entry.map((e: { resource: Record<string, any> }) => e.resource).filter((r: Record<string, any>) => r.resourceType === 'Observation').map((r: Record<string, any>) => r.status);
    expect(new Set(statuses)).toEqual(new Set(['final']));
  });
});

describe('withdrawing, denying and expiry', () => {
  it('stops further transfers when the patient withdraws, but the copy already received stays readable and says so', async () => {
    const b = await h.doctorB(); const p = await h.patient(P1_ABHA);
    const consent = (await mineB(b)).find(x => x.status === 'granted')!;
    expect((await h.post(`/exchange/consents/${consent.id}/revoke`, {}, p)).status).toBe(200);
    expect((await h.post(`/exchange/consents/${consent.id}/fetch`, {}, b)).status).toBe(404);
    const rid = consent.receivedId!;
    expect((await (await h.get(`/exchange/received/${rid}`, b)).json()).consentStatus).toBe('revoked');
    expect((await h.post(`/exchange/consents/${consent.id}/revoke`, {}, p)).status).toBe(409);
  });

  it('a denied request opens nothing', async () => {
    const b = await h.doctorB(); const p = await h.patient(P2_ABHA);
    await request(b, P2_ABHA);
    const id = (await patientList(p))[0].id;
    expect((await h.post(`/exchange/consents/${id}/decision`, { decision: 'deny' }, p)).status).toBe(200);
    expect((await h.post(`/exchange/consents/${id}/fetch`, {}, b)).status).toBe(404);
    expect((await patientList(p))[0].status).toBe('denied');
  });

  it('an expired permission reads as expired and opens nothing', async () => {
    const b = await h.doctorB(); const p = await h.patient(P2_ABHA);
    await request(b, P2_ABHA);
    const id = (await patientList(p)).find(x => x.status === 'requested')!.id;
    await h.post(`/exchange/consents/${id}/decision`, { decision: 'grant' }, p);
    await h.db.update(simConsents).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(simConsents.id, id));
    expect((await patientList(p)).find(x => x.id === id)!.status).toBe('expired');
    expect((await h.post(`/exchange/consents/${id}/fetch`, {}, b)).status).toBe(404);
  });

  it('writes every step to the access log', async () => {
    const actions = new Set((await h.db.select().from(accessLog)).map(r => r.action));
    for (const a of ['exchange-request', 'consent-granted', 'consent-denied', 'consent-revoked', 'exchange-fetch', 'view-received-record', 'annotate-received-record']) expect(actions.has(a)).toBe(true);
  });
});

describe('pushing a document', () => {
  it('only pushes a document whose values have all been reviewed', async () => {
    const nurse = await h.nurse();
    const doc = await (await h.upload('P1', P1_PDF, 'visits.pdf', 'Prescription', nurse)).json();
    expect(doc).toMatchObject({ status: 'done', syncStatus: 'pending' });
    expect(doc.waiting).toBeGreaterThan(0);
    const early = await h.post(`/patients/P1/documents/${doc.id}/push`, {}, nurse);
    expect(early.status).toBe(409);
    expect((await early.json()).message).toMatch(/Review the \d+ values?/);

    const items = (await (await h.get('/patients/P1/observations', nurse)).json()).items as { id: string; documentId: string }[];
    for (const o of items.filter(i => i.documentId === doc.id)) await h.post(`/patients/P1/observations/${o.id}/reject`, { reason: 'Duplicate of the slip values' }, nurse);
    expect((await h.post(`/patients/P1/documents/${doc.id}/push`, {}, nurse)).status).toBe(200);
    expect((await h.post(`/patients/P1/documents/${doc.id}/push`, {}, nurse)).status).toBe(409);
    expect(await h.db.select().from(simCareContexts)).toHaveLength(1);
    const listed = (await (await h.get('/patients/P1/documents', nurse)).json()).items.find((d: { id: string }) => d.id === doc.id);
    expect(listed.syncStatus).toBe('pushed');
  });

  it('is not open to a patient, or to a hospital without access', async () => {
    expect((await h.post('/patients/P1/documents/x/push', {}, await h.patient(P1_ABHA))).status).toBe(403);
    expect((await h.post('/patients/P1/documents/x/push', {}, await h.doctorB())).status).toBe(404);
  });
});

describe('request limits', () => {
  it('stops a hospital from flooding patients with requests', async () => {
    const lone = await setup();
    const b = await lone.doctorB();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await lone.post('/exchange/requests', { abha: `10-0000-0000-00${String(i).padStart(2, '0')}`, ...REQ }, b)).status;
    expect(last).toBe(429);
  });
});
