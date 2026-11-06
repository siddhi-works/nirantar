import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setup, P1_ABHA, P2_ABHA, type Harness } from './test-utils';
import { opdVisits } from './db/schema';
import { FACILITY_HFR } from './seed';

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);
const queue = async (cookie: string) => (await (await h.get('/opd/queue', cookie)).json());
const add = (cookie: string, abha: string, priority?: string) => h.post('/opd/walk-in', { abha, priority }, cookie);

describe('the OPD queue', () => {
  it('starts empty and shows no waiting time, because nothing has been measured or entered', async () => {
    const nurse = await h.nurse('a1a1a1a1a1a1');
    const q = await queue(nurse);
    expect(q.items).toEqual([]);
    expect(q.counts).toEqual({ appointments: 0, waiting: 0, ongoing: 0, done: 0, cancelled: 0 });
    expect(q).toMatchObject({ avgMinutes: null, basis: 'unavailable', rush: 'light' });
    const first = await (await add(nurse, P1_ABHA)).json();
    expect(first.items[0]).toMatchObject({ token: 1, status: 'waiting', position: 1, startsAt: null, waitMinutes: null });
    expect(first.avgMinutes).toBeNull();
  });

  it('adds people by ABHA number, refuses duplicates and strangers, and keeps each hospital to its own patients', async () => {
    const nurse = await h.nurse('b2b2b2b2b2b2');
    expect((await add(nurse, P1_ABHA)).status).toBe(201);
    expect((await add(nurse, P1_ABHA)).status).toBe(409);
    expect((await add(nurse, '11-1111-1111-1111')).status).toBe(404);
    expect((await add(nurse, '123')).status).toBe(400);
    const other = await (await add(await h.doctorB('b2b2b2b2b2b2'), P2_ABHA)).json(); // a token can be given to anyone who arrives; the record is another matter
    expect(other.items[0]).toMatchObject({ name: 'Mrs. Savitri Devi Pandey', held: false });
    const mine = await h.nurse('c3c3c3c3c3c3');
    expect((await queue(mine)).items).toEqual([]); // another tester's space
    expect((await h.get('/opd/queue', await h.patient(P1_ABHA))).status).toBe(403);
  });

  it('predicts the wait from what staff entered, then from consultations that were really timed', async () => {
    const nurse = await h.nurse('d4d4d4d4d4d4');
    await add(nurse, P1_ABHA); await add(nurse, P2_ABHA);
    const set = await h.post('/opd/settings', { minutesPerPatient: 10 }, nurse);
    expect((await set.json())).toMatchObject({ avgMinutes: 10, basis: 'entered' });
    const q = await queue(nurse);
    const [a, b] = q.items;
    expect(a.waitMinutes).toBeLessThanOrEqual(5);
    expect(b.waitMinutes).toBeGreaterThanOrEqual(a.waitMinutes + 5);
    expect((await h.post('/opd/settings', { minutesPerPatient: 1 }, nurse)).status).toBe(400);

    // call, finish, call, finish: then time them as 6 and 10 minutes and the measured average takes over
    expect((await h.post(`/opd/${a.id}/call`, {}, nurse)).status).toBe(200);
    expect((await h.post(`/opd/${b.id}/call`, {}, nurse)).status).toBe(409); // one at a time
    expect((await h.post(`/opd/${a.id}/done`, {}, nurse)).status).toBe(200);
    expect((await h.post(`/opd/${a.id}/done`, {}, nurse)).status).toBe(409);
    expect((await h.post(`/opd/${b.id}/call`, {}, nurse)).status).toBe(200);
    expect((await h.post(`/opd/${b.id}/done`, {}, nurse)).status).toBe(200);
    const now = Date.now();
    await h.db.update(opdVisits).set({ calledAt: new Date(now - 30 * 60_000), doneAt: new Date(now - 24 * 60_000) }).where(eq(opdVisits.id, a.id));
    await h.db.update(opdVisits).set({ calledAt: new Date(now - 20 * 60_000), doneAt: new Date(now - 10 * 60_000) }).where(eq(opdVisits.id, b.id));
    const after = await queue(nurse);
    expect(after).toMatchObject({ avgMinutes: 8, basis: 'measured', basedOn: 2 });
    expect(after.counts).toMatchObject({ done: 2, waiting: 0, appointments: 2 });
  });

  it('puts an urgent visit first and lets a visit be cancelled', async () => {
    const nurse = await h.nurse('e5e5e5e5e5e5');
    await add(nurse, P1_ABHA); await add(nurse, P2_ABHA);
    const [one, two] = (await queue(nurse)).items;
    const flipped = await (await h.post(`/opd/${two.id}/priority`, {}, nurse)).json();
    expect(flipped.items.find((x: { id: string }) => x.id === two.id)).toMatchObject({ priority: 'urgent', position: 1 });
    expect(flipped.items.find((x: { id: string }) => x.id === one.id).position).toBe(2);
    const gone = await (await h.post(`/opd/${one.id}/cancel`, {}, nurse)).json();
    expect(gone.counts).toMatchObject({ cancelled: 1, waiting: 1, appointments: 1 });
    expect((await h.post(`/opd/${one.id}/call`, {}, nurse)).status).toBe(409);
  });
});

describe('Scan & Share for a patient', () => {
  it('lets a patient join by scanning the hospital QR, shows each message that passed, and does not repeat the token', async () => {
    const patient = await h.patient(P1_ABHA, 'f6f6f6f6f6f6');
    expect((await (await h.get('/opd/me', patient)).json()).visit).toBeNull();
    const joined = await h.post('/opd/scan-and-share', { hfr: FACILITY_HFR }, patient);
    expect(joined.status).toBe(201);
    const body = await joined.json();
    expect(body.visit).toMatchObject({ token: 1, status: 'waiting', source: 'scan-and-share', position: 1 });
    expect(body.avgMinutes).toBeNull(); // nothing entered or measured yet
    const again = await (await h.post('/opd/scan-and-share', { hfr: FACILITY_HFR }, patient)).json();
    expect(again.visit.token).toBe(1);
    expect((await h.post('/opd/scan-and-share', { hfr: 'IN0000000000' }, patient)).status).toBe(404);
    const log = (await (await h.get('/network/messages', patient)).json()).items as { path: string }[];
    expect(log.map(m => m.path)).toEqual(['/v3/hip/patient/profile/on-share', '/v3/hip/patient/profile/share', '/scan']);
    // the nurse at that hospital, in the same space, sees the patient and can call them
    const nurse = await h.nurse('f6f6f6f6f6f6');
    expect((await queue(nurse)).items[0]).toMatchObject({ name: 'Mr. Rajesh Kumar Singh', source: 'scan-and-share' });
    expect((await (await h.post('/opd/me/cancel', {}, patient)).json()).visit.status).toBe('cancelled');
    expect((await h.post('/opd/scan-and-share', { hfr: FACILITY_HFR }, await h.doctor())).status).toBe(403);
  });
});

describe('what needs attention', () => {
  it('lists only what is really there: nothing at first, then waiting patients and values to review', async () => {
    const nurse = await h.nurse('a7a7a7a7a7a7');
    expect((await (await h.get('/attention', nurse)).json()).items).toEqual([]);
    await add(nurse, P1_ABHA);
    const items = (await (await h.get('/attention', nurse)).json()).items as { kind: string; title: string }[];
    expect(items).toEqual([{ kind: 'queue', title: '1 patient is waiting in the OPD queue' }]);
    expect((await h.get('/attention', await h.patient(P1_ABHA))).status).toBe(403);
  });
});
