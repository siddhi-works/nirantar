import { beforeAll, describe, expect, it } from 'vitest';
import { setup, P1_ABHA, type Harness } from './test-utils';

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);

describe('ASHA / USHA worker referral', () => {
  it('is made by staff of the holding hospital, seen by the patient, and refused elsewhere', async () => {
    const ws = 'a5a5a5a5a5a5';
    const nurse = await h.nurse(ws);
    const bad = await h.post('/patients/P1/asha-referrals', { worker: 'asha', reason: 'nonsense' }, nurse);
    expect(bad.status).toBe(400);
    const ok = await h.post('/patients/P1/asha-referrals', { worker: 'usha', reason: 'diet-walking', note: 'Lives near the market' }, nurse);
    expect(ok.status).toBe(201);
    const list = (await (await h.get('/patients/P1/asha-referrals', nurse)).json()).items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ worker: 'usha', reason: 'diet-walking', note: 'Lives near the market' });
    const patient = await h.patient(P1_ABHA, ws);
    expect((await (await h.get('/patients/P1/asha-referrals', patient)).json()).items).toHaveLength(1);
    expect((await h.post('/patients/P1/asha-referrals', { worker: 'asha', reason: 'home-visit' }, patient)).status).toBe(403); // a patient cannot send themselves
    const other = await h.doctorB(ws);
    expect((await h.get('/patients/P1/asha-referrals', other)).status).toBe(404);
    expect((await h.post('/patients/P1/asha-referrals', { worker: 'asha', reason: 'home-visit' }, other)).status).toBe(404);
  });
});

describe('history flags and HOMA-IR inputs', () => {
  it('records fasting insulin and history results as facts, and rejects implausible or unknown values', async () => {
    const doctor = await h.doctor('a6a6a6a6a6a6');
    expect((await h.post('/patients/P1/observations', { entries: [{ code: 'insulin', value: 9999 }] }, doctor)).status).toBe(400);
    expect((await h.post('/patients/P1/observations', { entries: [{ code: 'hiv', value: 'maybe' }] }, doctor)).status).toBe(400);
    const res = await h.post('/patients/P1/observations', { entries: [{ code: 'insulin', value: 14.2 }, { code: 'fbs', value: 130 }, { code: 'hcv', value: 'positive' }, { code: 'prior-mi', value: 'yes' }] }, doctor);
    expect(res.status).toBe(201);
    const recall = await (await h.get('/patients/P1/recall', doctor)).json();
    const codes = recall.facts.filter((f: { source: string }) => f.source === 'staff-entered').map((f: { code: string }) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['insulin', 'fbs', 'hcv', 'prior-mi']));
  });
});

describe('the mock OPD day', () => {
  it('registers six labelled demo patients with records and queues them, once', async () => {
    const nurse = await h.nurse('a7a7a7a7a7a7');
    const first = await h.post('/opd/demo-day', {}, nurse);
    expect(first.status).toBe(201);
    expect((await first.json()).added).toBe(6);
    expect((await h.post('/opd/demo-day', {}, nurse)).status).toBe(409);
    const q = await (await h.get('/opd/queue', nurse)).json();
    expect(q.items).toHaveLength(6);
    expect(q.items.every((v: { name: string }) => v.name.endsWith('(demo)'))).toBe(true);
    const mi = q.items.find((v: { name: string }) => v.name.startsWith('Mohammed'));
    const vals = (await (await h.get(`/patients/${mi.patientId}/observations`, nurse)).json()).items;
    expect(vals.find((o: { code: string }) => o.code === 'prior-mi')).toBeTruthy();
    expect(vals.every((o: { by: string }) => o.by === 'Demo OPD · sample data')).toBe(true);
    // the patient's own page still says the values are demo entries: the source is named, never hidden
    expect(vals[0].origin).toBe('entry');
  });
});

describe('help: report a complaint', () => {
  it('needs a sign-in, validates, is saved with who sent it, and is limited per person', async () => {
    expect((await h.req('POST', '/help/complaints', { kind: 'other', message: 'Something went wrong here' })).status).toBe(401);
    const patient = await h.patient(P1_ABHA, 'a8a8a8a8a8a8');
    expect((await h.post('/help/complaints', { kind: 'nonsense', message: 'Something went wrong here' }, patient)).status).toBe(400);
    expect((await h.post('/help/complaints', { kind: 'wrong-record', message: 'too short' }, patient)).status).toBe(400);
    const ok = await h.post('/help/complaints', { kind: 'wrong-record', message: 'The date on my last report is wrong', contact: '9876500000' }, patient);
    expect(ok.status).toBe(201);
    expect((await ok.json()).reference).toMatch(/^NC-\d{5}$/);
    const mine = (await (await h.get('/help/complaints', patient)).json()).items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'wrong-record' });
    // another person does not see it
    const doctor = await h.doctor('a8a8a8a8a8a8');
    expect((await (await h.get('/help/complaints', doctor)).json()).items).toHaveLength(0);
    for (let i = 0; i < 4; i++) await h.post('/help/complaints', { kind: 'other', message: `Another report number ${i} here` }, patient);
    expect((await h.post('/help/complaints', { kind: 'other', message: 'One report too many here' }, patient)).status).toBe(429);
  });
});
