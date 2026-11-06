import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setup, P1_ABHA, type Harness } from './test-utils';
import type { OcrProvider } from './ocr/provider';
import { nameMatches, mismatches, SANDBOX_ABHA } from './sim/abha';
import { registrationDrafts } from './db/schema';

let ocrText = 'Date 05/11/2026\nFBS 142 mg/dl  HbA1c 7.1%';
const ocr: OcrProvider = { name: 'stand-in', recognise: async () => [ocrText] };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3, 4]);
let h: Harness;
beforeAll(async () => { h = await setup({ ocr }); }, 60_000);

const RAMESH = { name: 'Ramesh Chandra Tiwari', age: 58, sex: 'M', phone: '9876500011', abha: '93-1100-2234-5567' };
const AGREE = { purposes: ['create-record', 'abha-link', 'share-abdm'], mode: 'in-person-signed' };
const start = (cookie: string, over: Record<string, unknown> = {}) => h.post('/patients/register/start', { ...RAMESH, ...over }, cookie);
const verify = (cookie: string, draftId: string, otp: string) => h.post('/patients/register/verify', { draftId, otp }, cookie);
const complete = (cookie: string, draftId: string, consent: unknown = AGREE) => h.post('/patients/register/complete', { draftId, consent }, cookie);
/** The whole thing, as a nurse would do it. */
async function registerFully(cookie: string, over: Record<string, unknown> = {}, consent: unknown = AGREE) {
  const s = await (await start(cookie, over)).json();
  expect((await verify(cookie, s.draftId, s.sandboxOtp)).status).toBe(200);
  const r = await complete(cookie, s.draftId, consent);
  return { r, body: await r.json() };
}
const list = async (cookie: string) => (await (await h.get('/patients/registered', cookie)).json()).items as { id: string; name: string }[];

describe('matching a patient against an ABHA profile', () => {
  it('forgives titles, word order, an initial and one letter of spelling, but not another person', () => {
    expect(nameMatches('Mr. Ramesh Chandra Tiwari', 'Ramesh Chandra Tiwari')).toBe(true);
    expect(nameMatches('Tiwari Ramesh Chandra', 'Ramesh Chandra Tiwari')).toBe(true);
    expect(nameMatches('Ramesh C. Tiwari', 'Ramesh Chandra Tiwari')).toBe(true);
    expect(nameMatches('Ramesh Chandra Tiwary', 'Ramesh Chandra Tiwari')).toBe(true);
    expect(nameMatches('Ramesh Tiwari', 'Ramesh Chandra Tiwari')).toBe(true);
    expect(nameMatches('Suresh Chandra Tiwari', 'Ramesh Chandra Tiwari')).toBe(false);
    expect(nameMatches('Ramesh', 'Ramesh Chandra Tiwari')).toBe(false);
    expect(nameMatches('Anita Kumari Gupta', 'Ramesh Chandra Tiwari')).toBe(false);
  });
  it('allows two years on the age, and needs the same sex and mobile number', () => {
    const p = SANDBOX_ABHA[0];
    const ok = { name: p.name, age: p.age + 2, sex: p.sex, mobile: p.mobile };
    expect(mismatches(ok, p)).toEqual([]);
    expect(mismatches({ ...ok, age: p.age + 3 }, p)).toEqual(['age']);
    expect(mismatches({ ...ok, sex: 'F', mobile: '9000000000' }, p)).toEqual(['sex', 'mobile']);
  });
});

describe('registering a patient, step by step', () => {
  it('creates the record only after the details match, the code is right and the patient consents', async () => {
    const nurse = await h.nurse();
    const { r, body } = await registerFully(nurse);
    expect(r.status).toBe(201);
    expect(body.patient).toMatchObject({ name: RAMESH.name, abha: '93110022345567', abhaSource: 'registry', verifyMethod: 'mobile-otp', consentMode: 'in-person-signed' });
    expect(body.patient.consentPurposes).toEqual(['create-record', 'abha-link', 'share-abdm']);
    expect(body.patient.id).toMatch(/^R[0-9a-f]{8}$/);
    const doctor = await h.doctor();
    expect(await (await h.post('/patients/lookup', { abha: RAMESH.abha }, doctor)).json()).toMatchObject({ patientId: body.patient.id, registered: true });
    expect((await list(doctor)).map(x => x.id)).toContain(body.patient.id);
    expect((await (await h.get(`/patients/${body.patient.id}/profile`, doctor)).json()).consentVersion).toBeTruthy();
  });

  it('turns away details that do not match the ABHA profile, and saves nothing', async () => {
    const nurse = await h.nurse('cdcdcdcdcdcd');
    for (const [over, field] of [[{ name: 'Suresh Kumar Yadav' }, 'name'], [{ age: 40 }, 'age'], [{ sex: 'F' }, 'sex'], [{ phone: '9000000000' }, 'mobile']] as const) {
      const r = await start(nurse, over);
      expect(r.status, field).toBe(422);
      const b = await r.json();
      expect(b.fields, field).toContain(field);
      expect(b.message).toMatch(/Nothing was saved/);
    }
    expect((await start(nurse, { abha: '11-1111-1111-1111' })).status).toBe(422); // not in the registry
    expect((await start(nurse, { abha: P1_ABHA })).status).toBe(422);               // a sample patient's number is not in it either
    expect((await start(nurse, { phone: '12345' })).status).toBe(400);
    expect((await start(nurse, { name: '<script>' })).status).toBe(400);
    expect(await list(nurse)).toEqual([]);
  });

  it('will not make a record from a code that was not entered, a wrong code three times, or missing consent', async () => {
    const nurse = await h.nurse('efefefefefef');
    const s = await (await start(nurse)).json();
    expect((await complete(nurse, s.draftId)).status).toBe(409); // not verified yet
    for (let i = 0; i < 2; i++) expect((await verify(nurse, s.draftId, '000000')).status).toBe(422);
    expect((await verify(nurse, s.draftId, '000000')).status).toBe(422);
    expect((await verify(nurse, s.draftId, s.sandboxOtp)).status).toBe(429); // the draft is gone after three misses
    expect(await list(nurse)).toEqual([]);

    const s2 = await (await start(nurse)).json();
    await verify(nurse, s2.draftId, s2.sandboxOtp);
    expect((await complete(nurse, s2.draftId, { purposes: ['create-record'], mode: 'in-person-verbal' })).status).toBe(422); // must also agree to the ABHA link
    expect((await complete(nurse, s2.draftId, { purposes: [], mode: 'in-person-verbal' })).status).toBe(422);
    expect(await list(nurse)).toEqual([]);
    expect((await complete(nurse, s2.draftId, { purposes: ['create-record', 'abha-link'], mode: 'in-person-verbal' })).status).toBe(201); // sharing is optional
  });

  it('lets a patient with no ABHA be given a sample one, still with a code and consent', async () => {
    const nurse = await h.nurse('121212121212');
    const { body } = await registerFully(nurse, { name: 'Test Patient', age: 29, sex: 'F', phone: '9811122233', createAbha: true, abha: undefined });
    expect(body.patient.abhaSource).toBe('created');
    expect(body.patient.abha).toMatch(/^99\d{12}$/);
  });

  it('refuses a duplicate, a draft that belongs to someone else, an expired draft, and a patient doing any of it', async () => {
    const nurse = await h.nurse('343434343434');
    expect((await registerFully(nurse)).r.status).toBe(201);
    expect((await start(nurse)).status).toBe(409);
    const s = await (await start(nurse, { name: 'Sunita Verma', age: 47, sex: 'F', phone: '9876500022', abha: '93-2200-3345-6678' })).json();
    const other = await h.doctor('343434343434'); // same space, another person
    expect((await verify(other, s.draftId, s.sandboxOtp)).status).toBe(404);
    await h.db.update(registrationDrafts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(registrationDrafts.id, s.draftId));
    expect((await verify(nurse, s.draftId, s.sandboxOtp)).status).toBe(410);
    const p = await h.patient(P1_ABHA);
    expect((await start(p)).status).toBe(403);
    expect((await h.post('/patients/register/start', RAMESH)).status).toBe(401);
  });

  it('keeps each space and each hospital apart', async () => {
    const mine = await h.nurse('565656565656');
    const { body } = await registerFully(mine);
    const other = await h.doctor('787878787878');
    expect((await h.post('/patients/lookup', { abha: RAMESH.abha }, other)).status).toBe(404);
    expect((await h.get(`/patients/${body.patient.id}/profile`, other)).status).toBe(404);
    expect(await list(other)).toEqual([]);
    expect((await h.get(`/patients/${body.patient.id}/profile`, await h.doctorB('565656565656'))).status).toBe(404);
    expect((await h.get(`/patients/${body.patient.id}/recall`, mine)).status).toBe(404);
  });

  it('caps how many one space can register', async () => {
    const doc = await h.doctor('909090909090');
    const fresh = { name: 'Test Patient', age: 30, sex: 'M', phone: '9811122233', createAbha: true, abha: undefined };
    let made = 0; let refused = 0;
    for (let i = 0; i < 30 && !refused; i++) {
      const r = await start(doc, fresh);
      if (r.status !== 201) { refused = r.status; break; }
      const s = await r.json();
      await verify(doc, s.draftId, s.sandboxOtp);
      expect((await complete(doc, s.draftId)).status).toBe(201);
      made++;
    }
    expect(made).toBe(25);
    expect(refused).toBe(409);
  }, 120_000);
});

describe('documents for a registered patient', () => {
  it('works with recorded values and uploads, and rejects a document that names someone else or another ABHA number', async () => {
    const doctor = await h.doctor('ababababab12');
    const { body } = await registerFully(doctor);
    const id = body.patient.id as string;
    expect((await h.post(`/patients/${id}/observations`, { entries: [{ code: 'hba1c', value: 7.2 }] }, doctor)).status).toBe(201);

    ocrText = 'Name: Ramesh Chandra Tiwari\nABHA: 93-1100-2234-5567\nDate 05/11/2026\nHbA1c 7.1%';
    const mine = await (await h.upload(id, PNG, 'mine.png', 'Prescription', doctor)).json();
    expect(mine).toMatchObject({ status: 'done' });
    expect(mine.values).toBeGreaterThan(0);

    ocrText = 'Name: Suresh Kumar Yadav\nDate 05/11/2026\nHbA1c 9.9%';
    const wrongName = await (await h.upload(id, PNG, 'x.png', 'Prescription', doctor)).json();
    expect(wrongName.status).toBe('failed');
    expect(wrongName.error).toMatch(/name on this document does not match/);

    ocrText = 'ABHA 93-3300-4456-7789\nDate 05/11/2026\nHbA1c 9.9%';
    const wrongAbha = await (await h.upload(id, PNG, 'y.png', 'Prescription', doctor)).json();
    expect(wrongAbha.status).toBe('failed');
    expect(wrongAbha.error).toMatch(/different ABHA number \(ending 7789\)/);
    const vals = (await (await h.get(`/patients/${id}/observations`, doctor)).json()).items as { documentId: string | null }[];
    expect(vals.some(v => v.documentId === wrongAbha.id || v.documentId === wrongName.id)).toBe(false); // nothing from them was kept

    ocrText = 'Date 05/11/2026\nHbA1c 7.0%'; // no name and no number: accepted for review, like most lab slips
    expect((await (await h.upload(id, PNG, 'z.png', 'Prescription', doctor)).json()).status).toBe('done');
  });

  it('will not push a record to ABDM unless the patient agreed to share it', async () => {
    const doctor = await h.doctor('cdcdcd121212');
    const { body } = await registerFully(doctor, {}, { purposes: ['create-record', 'abha-link'], mode: 'in-person-verbal' });
    ocrText = 'Date 05/11/2026\nHbA1c 7.0%';
    const d = await (await h.upload(body.patient.id, PNG, 'z.png', 'Prescription', doctor)).json();
    const r = await h.post(`/patients/${body.patient.id}/documents/${d.id}/push`, {}, doctor);
    expect(r.status).toBe(409);
    expect((await r.json()).message).toMatch(/not agreed to share/);
  });
});

describe('the patient’s rights over a registered record', () => {
  it('exports everything held, changes the optional sharing consent with a history, and erases on request', async () => {
    const doctor = await h.doctor('f1f1f1f1f1f1');
    const { body } = await registerFully(doctor);
    const id = body.patient.id as string;
    await h.post(`/patients/${id}/observations`, { entries: [{ code: 'hba1c', value: 7.2 }] }, doctor);
    ocrText = 'Date 05/11/2026\nHbA1c 7.0%';
    await h.upload(id, PNG, 'scan.png', 'Prescription', doctor);

    // everything else about the person: queue, advice, education, a correction request and their own sign-in
    await h.post('/opd/walk-in', { abha: RAMESH.abha }, doctor);
    await h.post(`/patients/${id}/advice`, { text: 'Walk for 30 minutes daily' }, doctor);
    await h.post(`/patients/${id}/education`, { topic: 'foot' }, doctor);
    const own = await h.patient(RAMESH.abha, 'f1f1f1f1f1f1');
    await h.post(`/patients/${id}/edit-requests`, { subject: 'HbA1c 7.2% on 5 Nov 2026', proposed: '7.0%', reason: 'The report says 7.0' }, own);

    const out = await h.get(`/patients/${id}/export`, doctor);
    expect(out.status).toBe(200);
    expect(out.headers.get('content-disposition')).toMatch(/attachment/);
    const copy = await out.json();
    expect(copy.patient.name).toBe(RAMESH.name);
    expect(copy.values.length).toBeGreaterThanOrEqual(2);
    expect(copy.documents).toHaveLength(1);
    expect(JSON.stringify(copy)).not.toMatch(/otpHash|byUserId/);

    // withdrawing sharing consent is allowed and recorded; the other two mean erasure
    const w = await h.post(`/patients/${id}/consent`, { action: 'withdraw', purpose: 'share-abdm', reason: 'patient asked' }, doctor);
    expect(w.status).toBe(200);
    expect((await w.json()).consentPurposes).toEqual(['create-record', 'abha-link']);
    expect((await h.post(`/patients/${id}/consent`, { action: 'withdraw', purpose: 'share-abdm' }, doctor)).status).toBe(409);
    expect((await h.post(`/patients/${id}/consent`, { action: 'withdraw', purpose: 'abha-link' }, doctor)).status).toBe(409);
    expect((await h.post(`/patients/${id}/consent`, { action: 'grant', purpose: 'share-abdm' }, doctor)).status).toBe(400); // must say how
    expect((await h.post(`/patients/${id}/consent`, { action: 'grant', purpose: 'share-abdm', mode: 'in-person-verbal' }, doctor)).status).toBe(200);
    const full = await (await h.get(`/patients/${id}/export`, doctor)).json();
    expect(full.opdVisits).toHaveLength(1);
    expect(full.lifestyleAdvice).toHaveLength(1);
    expect(full.educationGiven).toHaveLength(1);
    expect(full.correctionRequests).toHaveLength(1);
    const history = full.consentHistory;
    expect(history.map((x: { action: string }) => x.action)).toEqual(['withdrawn', 'granted']);

    // erasure needs the name typed and a reason, then nothing is left
    expect((await h.post(`/patients/${id}/erase`, { confirmName: 'Someone Else', reason: 'patient asked' }, doctor)).status).toBe(422);
    expect((await h.post(`/patients/${id}/erase`, { confirmName: RAMESH.name }, doctor)).status).toBe(400);
    const gone = await h.post(`/patients/${id}/erase`, { confirmName: RAMESH.name, reason: 'patient asked' }, doctor);
    expect(gone.status).toBe(200);
    expect((await h.get(`/patients/${id}/profile`, doctor)).status).toBe(404);
    expect((await h.get(`/patients/${id}/observations`, doctor)).status).toBe(404);
    expect(await list(doctor)).toEqual([]);
    expect((await h.post('/patients/lookup', { abha: RAMESH.abha }, doctor)).status).toBe(404);
    const t = await import('./db/schema');
    for (const tbl of [t.opdVisits, t.editRequests, t.educationLog, t.patientAdvice]) expect((await h.db.select().from(tbl).where(eq(tbl.patientId, id))).length).toBe(0);
    expect((await h.db.select().from(t.users).where(eq(t.users.patientId, id))).length).toBe(0);
    expect((await h.post('/auth/otp/verify', { role: 'patient', abha: RAMESH.abha }, 'nirantar_ws=f1f1f1f1f1f1')).status).toBe(401); // they can no longer sign in
    expect((await registerFully(doctor)).r.status).toBe(201); // the same person can be registered again afterwards
  });

  it('only the hospital that registered the patient, in the same space, can do any of it', async () => {
    const doctor = await h.doctor('f2f2f2f2f2f2');
    const { body } = await registerFully(doctor);
    const id = body.patient.id as string;
    const stranger = await h.doctor('f3f3f3f3f3f3');
    for (const path of ['export']) expect((await h.get(`/patients/${id}/${path}`, stranger)).status).toBe(404);
    expect((await h.post(`/patients/${id}/erase`, { confirmName: RAMESH.name, reason: 'x y z' }, stranger)).status).toBe(404);
    expect((await h.get(`/patients/${id}/export`, await h.patient(P1_ABHA))).status).toBe(403);
  });
});

describe('a registered patient signs in', () => {
  it('with their ABHA number in the space they were registered in, and sees only their own record', async () => {
    const ws = 'abcabcabcabc';
    const nurse = await h.nurse(ws);
    const { body } = await registerFully(nurse);
    const id = body.patient.id as string;
    await h.post(`/patients/${id}/observations`, { entries: [{ code: 'hba1c', value: 7.4 }] }, nurse);

    const patient = await h.patient(RAMESH.abha, ws);
    const me = (await (await h.get('/auth/me', patient)).json()).user;
    expect(me).toMatchObject({ role: 'patient', name: RAMESH.name, patientId: id });
    const home = await (await h.get(`/patients/${id}/home`, patient)).json();
    expect(home.profile).toMatchObject({ name: RAMESH.name, abha: '93110022345567', consentPurposes: ['create-record', 'abha-link', 'share-abdm'] });
    expect(home.values).toEqual([expect.objectContaining({ code: 'hba1c', display: '7.4%' })]);

    // not anyone else's record, and none of the staff screens
    expect((await h.get('/patients/P1/home', patient)).status).toBe(404);
    expect((await h.get('/patients/P1/counselling', patient)).status).toBe(404);
    expect((await h.get(`/patients/${id}/profile`, patient)).status).toBe(403);
    expect((await h.get('/opd/queue', patient)).status).toBe(403);
    // another tester's space has no such patient to sign in as
    const other = await h.post('/auth/otp/verify', { role: 'patient', abha: RAMESH.abha }, 'nirantar_ws=121212121212');
    expect(other.status).toBe(401);
  });

  it('can join the OPD queue by QR, ask for a correction and read counselling for their own record', async () => {
    const ws = 'bcdbcdbcdbcd';
    const nurse = await h.nurse(ws);
    const { body } = await registerFully(nurse);
    const id = body.patient.id as string;
    const patient = await h.patient(RAMESH.abha, ws);
    const joined = await (await h.post('/opd/scan-and-share', { hfr: 'IN2900011882' }, patient)).json();
    expect(joined.visit).toMatchObject({ token: 1, name: RAMESH.name, status: 'waiting' });
    expect((await (await h.get('/opd/queue', nurse)).json()).items[0]).toMatchObject({ patientId: id, name: RAMESH.name });
    expect((await h.post(`/patients/${id}/edit-requests`, { subject: 'HbA1c 7.4% on 5 Nov 2026', proposed: '7.1%', reason: 'The report says 7.1' }, patient)).status).toBe(201);
    const c = await (await h.get(`/patients/${id}/counselling`, patient)).json();
    expect(c.unavailable).toMatch(/Needs input/);
    const ans = await (await h.post(`/patients/${id}/ask`, { question: 'What was my last HbA1c?', lang: 'en' }, patient)).json();
    expect(ans.answer).toMatch(/No HbA1c is on your record/); // nothing is made up when there is nothing yet
  });
});

describe('clearing an idle space', () => {
  it('removes everything the space holds, from every feature, and nothing of anyone else’s', async () => {
    const { removeWorkspace } = await import('./seed');
    const t = await import('./db/schema');
    const gone = 'dadadadadada'; const kept = 'dbdbdbdbdbdb';
    for (const ws of [gone, kept]) {
      const nurse = await h.nurse(ws);
      const { body } = await registerFully(nurse);
      const id = body.patient.id as string;
      await h.post(`/patients/${id}/observations`, { entries: [{ code: 'hba1c', value: 7.4 }] }, nurse);
      await h.post('/opd/walk-in', { abha: RAMESH.abha }, nurse);
      await h.post('/opd/settings', { minutesPerPatient: 8 }, nurse);
      await h.post(`/patients/${id}/education`, { topic: 'foot' }, nurse);
      await h.post(`/patients/${id}/consent`, { action: 'withdraw', purpose: 'share-abdm', reason: 'asked' }, nurse);
      await h.patient(RAMESH.abha, ws);
      const doctor = await h.doctor(ws);
      await h.post(`/patients/${id}/advice`, { text: 'Walk for 30 minutes daily' }, doctor);
      const p = await h.patient(P1_ABHA, ws);
      await h.post('/patients/P1/edit-requests', { subject: 'HbA1c 5.9% on 3 Dec 2027', proposed: '6.9%', reason: 'The slip says 6.9' }, p);
      await h.post('/opd/scan-and-share', { hfr: 'IN2900011882' }, p);
    }
    await removeWorkspace(h.db, gone);
    const inSpace = async (ws: string) => (await Promise.all([t.registeredPatients, t.opdVisits, t.opdSettings, t.editRequests, t.educationLog, t.patientAdvice, t.gatewayMessages, t.consentEvents, t.sessions].map(async tbl => (await h.db.select().from(tbl).where(eq((tbl as unknown as { workspace: never }).workspace, ws as never))).length)));
    expect((await inSpace(gone)).every(n => n === 0)).toBe(true);
    expect((await inSpace(kept)).every(n => n > 0)).toBe(true);
    const left = await h.db.select().from(t.users);
    expect(left.some(u => u.id.startsWith('u-pat-R') && u.name === RAMESH.name)).toBe(true); // the other space's patient sign-in is still there
  }, 120_000);
});
