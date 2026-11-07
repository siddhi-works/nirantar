import { beforeAll, describe, expect, it } from 'vitest';
import { setup, P1_ABHA, type Harness } from './test-utils';

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);

const RAMESH = { name: 'Ramesh Chandra Tiwari', age: 58, sex: 'M', phone: '9876500011', abha: '93-1100-2234-5567' };
async function register(cookie: string) {
  const s = await (await h.post('/patients/register/start', RAMESH, cookie)).json();
  await h.post('/patients/register/verify', { draftId: s.draftId, otp: s.sandboxOtp }, cookie);
  return (await (await h.post('/patients/register/complete', { draftId: s.draftId, consent: { purposes: ['create-record', 'abha-link'], mode: 'in-person-verbal' } }, cookie)).json()).patient.id as string;
}
const words = (s: string) => s.trim().split(/\s+/).length;

describe('the summary', () => {
  it('is short sentences written only from the record, with absences stated', async () => {
    const doctor = await h.doctor();
    for (const id of ['P1', 'P2']) {
      const s = await (await h.get(`/patients/${id}/summary`, doctor)).json();
      expect(s.words, id).toBeLessThanOrEqual(80);
      expect(s.words, id).toBeGreaterThanOrEqual(40);
      expect(words(s.text)).toBe(s.words);
      expect(s.text, id).toMatch(/HbA1c/);
    }
    const p1 = (await (await h.get('/patients/P1/summary', doctor)).json()).text as string;
    expect(p1).toMatch(/HbA1c went from 6\.5% \(3 Oct 2025\) to 5\.9% \(3 Oct 2026\)/);
    expect(p1).toMatch(/Mr\. Rajesh Kumar Singh is a 50-year-old man/);
    expect(p1).toMatch(/Metformin/);
    expect(p1).toMatch(/Not on record:/);
  });

  it('says plainly that a new patient has nothing, then uses only what has been confirmed', async () => {
    const nurse = await h.nurse('a8a8a8a8a8a8');
    const id = await register(nurse);
    const empty = await (await h.get(`/patients/${id}/summary`, nurse)).json();
    expect(empty).toMatchObject({ complete: false });
    expect(empty.text).toMatch(/^Unavailable: nothing has been recorded/);
    expect(empty.text).toMatch(/Needs input/);
    await h.post(`/patients/${id}/observations`, { entries: [{ code: 'hba1c', value: 7.4 }] }, nurse);
    const some = (await (await h.get(`/patients/${id}/summary`, nurse)).json()).text as string;
    expect(some).toMatch(/HbA1c is 7\.4%/);
    expect(some).toMatch(/no diagnosis recorded \(needs input\)/);
    expect(some).toMatch(/No medicines are recorded \(needs input\)/);
    expect(some).not.toMatch(/Metformin|Type 2/); // nothing invented
    expect((await h.get('/patients/P1/summary', await h.patient(P1_ABHA))).status).toBe(403);
  });
});

describe('lifestyle advice and patient education', () => {
  it('explains the advice that is written, and says what is missing where none is', async () => {
    const patient = await h.patient(P1_ABHA, 'b9b9b9b9b9b9');
    const mine = await (await h.get('/patients/P1/counselling', patient)).json();
    expect(mine.advice.length).toBeGreaterThan(0);
    expect(mine.advice.some((a: { topics: string[] }) => a.topics.includes('diet'))).toBe(true);
    expect(mine.unavailable).toBeNull();
    expect((await h.get('/patients/P2/counselling', patient)).status).toBe(404); // another patient

    const nurse = await h.nurse('c1c1c1c1c1c1');
    const id = await register(nurse);
    const none = await (await h.get(`/patients/${id}/counselling`, nurse)).json();
    expect(none.advice).toEqual([]);
    expect(none.unavailable).toMatch(/Needs input/);
    expect((await h.post(`/patients/${id}/advice`, { text: 'Walk for 30 minutes daily' }, nurse)).status).toBe(403); // only a doctor writes advice
    const doctor = await h.doctor('c1c1c1c1c1c1');
    expect((await h.post(`/patients/${id}/advice`, { text: 'Walk for 30 minutes daily' }, doctor)).status).toBe(201);
    expect((await h.post(`/patients/${id}/advice`, { text: 'x' }, doctor)).status).toBe(400);
    const after = await (await h.get(`/patients/${id}/counselling`, doctor)).json();
    expect(after.advice[0]).toMatchObject({ text: 'Walk for 30 minutes daily', source: 'doctor', topics: ['activity'] });
    expect(after.unavailable).toBeNull();
  });

  it('records who counselled the patient on which topic', async () => {
    const nurse = await h.nurse('d2d2d2d2d2d2');
    expect((await h.post('/patients/P1/education', { topic: 'foot' }, nurse)).status).toBe(201);
    expect((await h.post('/patients/P1/education', { topic: 'nonsense' }, nurse)).status).toBe(400);
    const log = (await (await h.get('/patients/P1/counselling', nurse)).json()).education;
    expect(log).toEqual([expect.objectContaining({ topic: 'foot', by: 'Sr. Kavita Mishra' })]);
    expect((await h.post('/patients/P1/education', { topic: 'foot' }, await h.patient(P1_ABHA))).status).toBe(403);
  });
});

describe('a patient asks for a correction', () => {
  const ask = (cookie: string, over: Record<string, unknown> = {}) =>
    h.post('/patients/P1/edit-requests', { subject: 'HbA1c 5.9% on 3 Dec 2027', proposed: '6.9%', reason: 'The slip says 6.9, I checked it', ...over }, cookie);

  it('goes to staff, is answered with a reason, and nobody edits the record for them', async () => {
    const ws = 'e3e3e3e3e3e3';
    const patient = await h.patient(P1_ABHA, ws);
    expect((await ask(patient)).status).toBe(201);
    expect((await ask(patient, { reason: 'no' })).status).toBe(400);
    expect((await h.post('/patients/P2/edit-requests', { subject: 'x y z', proposed: '1', reason: 'because it is wrong' }, patient)).status).toBe(404);

    const nurse = await h.nurse(ws);
    const attention = (await (await h.get('/attention', nurse)).json()).items as { kind: string; title: string }[];
    expect(attention.some(a => a.kind === 'correction' && /HbA1c 5\.9%/.test(a.title))).toBe(true);
    const list = (await (await h.get('/patients/P1/edit-requests', nurse)).json()).items as { id: string; status: string }[];
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('pending');
    const before = (await (await h.get('/patients/P1/recall', nurse)).json()).trends.find((t: { code: string }) => t.code === 'hba1c').latest.value;

    expect((await h.post(`/edit-requests/${list[0].id}/decide`, { decision: 'rejected' }, nurse)).status).toBe(400); // a reason is needed
    expect((await h.post(`/edit-requests/${list[0].id}/decide`, { decision: 'rejected', note: 'The original slip reads 5.9' }, nurse)).status).toBe(200);
    expect((await h.post(`/edit-requests/${list[0].id}/decide`, { decision: 'accepted', note: 'changed my mind' }, nurse)).status).toBe(409);
    const seen = (await (await h.get('/patients/P1/edit-requests', patient)).json()).items[0];
    expect(seen).toMatchObject({ status: 'rejected', decisionNote: 'The original slip reads 5.9', decidedBy: 'Sr. Kavita Mishra' });
    const after = (await (await h.get('/patients/P1/recall', nurse)).json()).trends.find((t: { code: string }) => t.code === 'hba1c').latest.value;
    expect(after).toBe(before); // a request alone changes nothing
    expect((await h.post(`/edit-requests/${list[0].id}/decide`, { decision: 'accepted', note: 'not my space' }, await h.nurse('f4f4f4f4f4f4'))).status).toBe(404);
  });

  it('is limited to ten waiting requests', async () => {
    const patient = await h.patient(P1_ABHA, 'a5a5a5a5a5a5');
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await ask(patient, { subject: `HbA1c reading number ${i}` })).status;
    expect(last).toBe(409);
  });
});
