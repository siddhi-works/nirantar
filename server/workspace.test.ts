import { beforeAll, describe, expect, it } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { setup, P1_ABHA, P2_ABHA, OTP, type Harness } from './test-utils';
import { documents, fileBlobs, observations, simConsents, workspaces } from './db/schema';
import { clearIdleWorkspaces, newWorkspaceId, scope, WORKSPACE_RE } from './seed';
import { DEV_DOCTOR, FACILITY_HFR } from './seed';

const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';
const P1_PDF = new Uint8Array(readFileSync(new URL('./assets/originals/patient-1-followups.pdf', import.meta.url)));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3, 4]);

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);
const recall = async (cookie: string, id = 'P1') => (await h.get(`/patients/${id}/recall`, cookie)).json();
const hb = (r: { trends: { code: string; latest: { value: number } }[] }) => r.trends.find(t => t.code === 'hba1c')!.latest.value;

describe('two testers using the same site', () => {
  it('never see each other\'s corrections, vitals, uploads or confirmations', async () => {
    const a = await h.doctor(A); const b = await h.doctor(B);
    const before = await recall(a);
    const factId = before.trends.find((t: { code: string }) => t.code === 'hba1c').latest.factId;

    // tester A changes things
    expect((await h.post(`/patients/P1/facts/${factId}/correct`, { value: 7.7, reason: 'Tester A checks the original' }, a)).status).toBe(200);
    expect((await h.post('/patients/P1/observations', { entries: [{ code: 'weight', value: 61.5 }] }, a)).status).toBe(201);
    const doc = await (await h.upload('P1', P1_PDF, 'a.pdf', 'Prescription', a)).json();
    expect(doc.waiting).toBeGreaterThan(0);
    expect(hb(await recall(a))).toBe(7.7);

    // tester B sees none of it
    const seenByB = await recall(b);
    expect(hb(seenByB)).toBe(5.9);
    expect(seenByB.trends.find((t: { code: string }) => t.code === 'weight').recorded).toHaveLength(0);
    expect((await (await h.get('/patients/P1/documents', b)).json()).items).toHaveLength(0);
    expect((await (await h.get('/patients/P1/observations', b)).json()).items).toHaveLength(0);

    // and cannot reach A's things by id
    expect((await h.get(`/documents/${doc.id}`, b)).status).toBe(404);
    expect((await h.get(`/documents/${doc.id}/file`, b)).status).toBe(404);
    const aObs = (await (await h.get('/patients/P1/observations', a)).json()).items[0];
    expect((await h.post(`/patients/P1/observations/${aObs.id}/confirm`, {}, b)).status).toBe(404);
    expect((await h.post(`/patients/P1/documents/${doc.id}/push`, {}, b)).status).toBe(404);
    expect(hb(await recall(a))).toBe(7.7); // A's work is untouched by B's attempts
  });

  it('each gets their own waiting consent request, and answering one does not answer the other', async () => {
    const pa = await h.patient(P1_ABHA, A); const pb = await h.patient(P1_ABHA, B);
    const listA = (await (await h.get('/exchange/consents', pa)).json()).items;
    const listB = (await (await h.get('/exchange/consents', pb)).json()).items;
    expect(listA).toHaveLength(1); expect(listB).toHaveLength(1);
    expect(listA[0].id).not.toBe(listB[0].id);
    expect((await h.post(`/exchange/consents/${listA[0].id}/decision`, { decision: 'grant' }, pa)).status).toBe(200);

    // B's patient still sees a request waiting; B cannot answer A's request
    expect((await (await h.get('/exchange/consents', pb)).json()).items[0].status).toBe('requested');
    expect((await h.post(`/exchange/consents/${listA[0].id}/decision`, { decision: 'deny' }, pb)).status).toBe(404);

    // the other hospital, in A's space, can fetch; in B's space it cannot, and cannot use A's request
    const hospA = await h.doctorB(A); const hospB = await h.doctorB(B);
    const reqA = (await (await h.get('/exchange/requests', hospA)).json()).items;
    expect(reqA[0].status).toBe('granted');
    expect((await h.post(`/exchange/consents/${listA[0].id}/fetch`, {}, hospB)).status).toBe(404);
    expect((await h.post(`/exchange/consents/${listA[0].id}/fetch`, {}, hospA)).status).toBe(201);
    expect((await (await h.get('/exchange/requests', hospB)).json()).items[0].status).toBe('requested');
    expect((await (await h.get('/exchange/received', hospA)).json()).items).toHaveLength(1);
    expect((await (await h.get('/exchange/received', hospB)).json()).items).toHaveLength(0);
    const receivedId = (await (await h.get('/exchange/received', hospA)).json()).items[0].id;
    expect((await h.get(`/exchange/received/${receivedId}`, hospB)).status).toBe(404);
    expect((await h.post(`/exchange/received/${receivedId}/annotations`, { text: 'not yours to write' }, hospB)).status).toBe(404);
  });

  it('keeps a request for an unknown ABHA number inside the tester who made it', async () => {
    const hospA = await h.doctorB(A); const hospB = await h.doctorB(B);
    await h.post('/exchange/requests', { abha: '77-7777-7777-7777', purpose: 'Treatment', validityDays: 30 }, hospA);
    const mineA = (await (await h.get('/exchange/requests', hospA)).json()).items.map((x: { abha: string }) => x.abha);
    const mineB = (await (await h.get('/exchange/requests', hospB)).json()).items.map((x: { abha: string }) => x.abha);
    expect(mineA).toContain('77-7777-7777-7777');
    expect(mineB).not.toContain('77-7777-7777-7777');
  });
});

describe('a workspace is made at sign-in', () => {
  it('is created and remembered in a cookie when the browser has none, and a made-up cookie is ignored', async () => {
    const r = await h.post('/auth/otp/verify', { otp: OTP, role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR });
    const cookies = r.headers.getSetCookie();
    expect(cookies[0]).toMatch(/^nirantar_sid=/); // the session cookie stays first
    const ws = cookies.find(c => c.startsWith('nirantar_ws='))!.split(';')[0].split('=')[1];
    expect(ws).toMatch(WORKSPACE_RE);
    expect(cookies.find(c => c.startsWith('nirantar_ws='))).toMatch(/HttpOnly/i);

    const forged = await h.post('/auth/otp/verify', { otp: OTP, role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR }, 'nirantar_ws=../../etc/passwd');
    const minted = forged.headers.getSetCookie().find(c => c.startsWith('nirantar_ws='))!.split(';')[0].split('=')[1];
    expect(minted).toMatch(WORKSPACE_RE);
    expect(minted).not.toBe('../../etc/passwd');
  });
});

describe('starting fresh', () => {
  it('moves only this tester to an empty space, and their old work is still there if they come back', async () => {
    const C = 'cccccccccccc';
    const a = await h.doctor(C);
    const factId = (await recall(a)).trends.find((t: { code: string }) => t.code === 'hba1c').latest.factId;
    await h.post(`/patients/P1/facts/${factId}/correct`, { value: 8.8, reason: 'before starting fresh' }, a);
    await h.upload('P1', P1_PDF, 'c.pdf', 'Prescription', a);
    expect(hb(await recall(a))).toBe(8.8);

    const other = await h.doctor(B);
    const otherBefore = hb(await recall(other));

    const fresh = await h.post('/workspace/fresh', {}, a);
    expect(fresh.status).toBe(200);
    const newWs = fresh.headers.getSetCookie().find(c => c.startsWith('nirantar_ws='))!.split(';')[0].split('=')[1];
    expect(newWs).toMatch(WORKSPACE_RE); expect(newWs).not.toBe(C);

    // the same session now shows the original record, no uploads, and a new waiting request
    expect(hb(await recall(a))).toBe(5.9);
    expect((await (await h.get('/patients/P1/documents', a)).json()).items).toHaveLength(0);
    expect((await (await h.get('/exchange/requests', await h.doctorB(newWs))).json()).items[0].status).toBe('requested');
    // nobody else was touched, and the old space still has its work
    expect(hb(await recall(other))).toBe(otherBefore);
    expect(hb(await recall(await h.doctor(C)))).toBe(8.8);
  });

  it('is limited, so it cannot be used to flood the database with new spaces', async () => {
    const lone = await setup();
    const cookie = await lone.doctor('dddddddddddd');
    let last = 0;
    for (let i = 0; i < 7; i++) last = (await lone.post('/workspace/fresh', {}, cookie)).status;
    expect(last).toBe(429);
  });
});

describe('clearing idle spaces', () => {
  it('removes a space nobody has used for two weeks, with its uploads, and leaves recent ones alone', async () => {
    const old = newWorkspaceId(); const recent = newWorkspaceId();
    const oldDoc = await (await h.upload('P2', P1_PDF, 'old.pdf', 'Prescription', await h.doctor(old))).json();
    await h.doctor(recent);
    await h.db.update(workspaces).set({ seenAt: new Date(Date.now() - 15 * 86_400_000) }).where(eq(workspaces.id, old));

    expect(await clearIdleWorkspaces(h.db)).toBeGreaterThanOrEqual(1);
    expect(await h.db.select().from(workspaces).where(eq(workspaces.id, old))).toHaveLength(0);
    expect(await h.db.select().from(documents).where(like(documents.patientId, `%~${old}`))).toHaveLength(0);
    expect(await h.db.select().from(fileBlobs).where(eq(fileBlobs.id, oldDoc.id))).toHaveLength(0);
    expect(await h.db.select().from(observations).where(like(observations.patientId, `%~${old}`))).toHaveLength(0);
    expect(await h.db.select().from(simConsents).where(eq(simConsents.workspace, old))).toHaveLength(0);
    expect(await h.db.select().from(workspaces).where(eq(workspaces.id, recent))).toHaveLength(1);
    expect(await h.db.select().from(simConsents).where(eq(simConsents.workspace, recent))).toHaveLength(1);
  });
});

describe('limits that protect the shared database', () => {
  it('allows 8 uploads per patient, and the sample prescription works without any file', async () => {
    const lone = await setup();
    const n = await lone.nurse('eeeeeeeeeeee');
    const first = await lone.post('/patients/P2/documents/sample', {}, n);
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ status: 'done', method: 'text-layer', fileName: 'sample-prescription-P2.pdf', origin: 'staff' });
    for (let i = 1; i < 8; i++) expect((await lone.upload('P2', PNG, `x${i}.png`, 'Prescription', n)).status).toBe(201);
    const ninth = await lone.upload('P2', PNG, 'x9.png', 'Prescription', n);
    expect(ninth.status).toBe(409);
    expect((await ninth.json()).message).toMatch(/up to 8 uploads/);
    expect((await lone.post('/patients/P2/documents/sample', {}, n)).status).toBe(409);
    // another tester is not affected
    expect((await lone.post('/patients/P2/documents/sample', {}, await lone.nurse('ffffffffffff'))).status).toBe(201);
  });

  it('caps the total size of one tester\'s uploads', async () => {
    const lone = await setup();
    const n = await lone.nurse('abababababab');
    const big = new Uint8Array(4 * 1024 * 1024); big.set([0x25, 0x50, 0x44, 0x46]);
    let status = 0; let sent = 0;
    for (const pid of ['P1', 'P2', 'P1', 'P2', 'P1', 'P2', 'P1']) { status = (await lone.upload(pid, big, 'big.pdf', 'Prescription', n)).status; if (status !== 201) break; sent++; }
    expect(sent).toBe(6); // 24 MB in all
    expect(status).toBe(409);
  });

  it('does not let a patient reach the sample route for someone else', async () => {
    expect((await h.post('/patients/P2/documents/sample', {}, await h.patient(P1_ABHA, A))).status).toBe(404);
    expect((await h.post('/patients/P2/documents/sample', {}, await h.patient(P2_ABHA, A))).status).toBe(201);
  });
});

it('keeps scoped keys unambiguous', () => {
  expect(scope('P1', A)).toBe('P1~aaaaaaaaaaaa');
});
