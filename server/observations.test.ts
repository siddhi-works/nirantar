import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setup, P1_ABHA, TEST_WS, type Harness } from './test-utils';
import { scope } from './seed';
import { observations, observationVersions } from './db/schema';

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);

const recall = async (cookie: string, id = 'P1') => (await h.get(`/patients/${id}/recall`, cookie)).json();

describe('recording values', () => {
  it('records a nurse\'s vitals and shows them in the record with who entered them', async () => {
    const nurse = await h.nurse();
    const r = await h.post('/patients/P1/observations', { entries: [{ code: 'sbp', value: 132 }, { code: 'dbp', value: 84 }, { code: 'weight', value: 69.5 }, { code: 'height', value: 171 }, { code: 'pulse', value: 76 }] }, nurse);
    expect(r.status).toBe(201);
    const rec = await recall(nurse);
    const bp = rec.missingMeasures.find((m: { code: string }) => m.code === 'bp');
    expect(bp.readings[0].display).toBe('BP 132/84 mmHg');
    const sbp = rec.facts.find((f: { code: string; source: string }) => f.code === 'sbp' && f.source === 'staff-entered');
    expect(sbp.verifiedBy).toBe('Sr. Kavita Mishra');
    expect(sbp.citation.source).toMatchObject({ kind: 'entry', status: 'verified' });
    const wt = rec.trends.find((t: { code: string }) => t.code === 'weight');
    expect(wt.recorded.map((p: { value: number }) => p.value)).toEqual([69.5]);
    expect(wt.latest.value).toBe(70); // the slip weight is still the last slip reading
  });

  it('refuses implausible, incomplete and future entries with a reason', async () => {
    const nurse = await h.nurse();
    const bad = async (body: unknown) => { const r = await h.post('/patients/P1/observations', body, nurse); expect(r.status).toBe(400); return (await r.json()).message as string; };
    expect(await bad({ entries: [{ code: 'sbp', value: 400 }, { code: 'dbp', value: 80 }] })).toMatch(/implausible/);
    expect(await bad({ entries: [{ code: 'sbp', value: 120 }] })).toMatch(/both/);
    expect(await bad({ entries: [{ code: 'sbp', value: 80 }, { code: 'dbp', value: 90 }] })).toMatch(/Diastolic/);
    expect(await bad({ entries: [{ code: 'hba1c', value: 'abc' }] })).toMatch(/number/);
    expect(await bad({ entries: [{ code: 'weight', value: 70 }], date: '2999-01-01' })).toMatch(/future/);
    expect(await bad({ entries: [{ code: 'nonsense', value: 1 }] })).toMatch(/not recognised/);
  });

  it('is not open to patients', async () => {
    const r = await h.post('/patients/P1/observations', { entries: [{ code: 'weight', value: 70 }] }, await h.patient(P1_ABHA));
    expect(r.status).toBe(403);
  });
});

describe('correcting a value read from a follow-up slip', () => {
  it('changes the trend, keeps the original, and records who and why', async () => {
    const doctor = await h.doctor();
    const before = await recall(doctor);
    const hb = before.trends.find((t: { code: string }) => t.code === 'hba1c');
    expect(hb.latest.value).toBe(5.9);
    const quote = hb.latest.citation.quote;
    const r = await h.post(`/patients/P1/facts/${hb.latest.factId}/correct`, { value: 6.0, reason: 'Slip shows 6.0 on re-reading the original' }, doctor);
    expect(r.status).toBe(200);
    const after = await recall(doctor);
    const hb2 = after.trends.find((t: { code: string }) => t.code === 'hba1c');
    expect(hb2.latest.value).toBe(6);
    expect(hb2.latest.verification).toBe('corrected');
    expect(hb2.latest.citation.quote).toBe(quote); // the slip text is untouched
    const fact = after.facts.find((f: { id: string }) => f.id === hb.latest.factId);
    expect(fact.detail).toMatchObject({ originalValue: 5.9, correctionReason: expect.stringMatching(/re-reading/) });
    expect(fact.verifiedBy).toBe('Dr. Swati Mani');
  });

  it('refuses an implausible correction and a missing reason', async () => {
    const doctor = await h.doctor();
    const rec = await recall(doctor);
    const id = rec.trends.find((t: { code: string }) => t.code === 'fbs').latest.factId;
    expect((await h.post(`/patients/P1/facts/${id}/correct`, { value: 5, reason: 'typo fix here' }, doctor)).status).toBe(400);
    expect((await h.post(`/patients/P1/facts/${id}/correct`, { value: 100, reason: '' }, doctor)).status).toBe(400);
  });

  it('does not touch another patient\'s record', async () => {
    const doctor = await h.doctor();
    const rec2 = await recall(doctor, 'P2');
    expect(rec2.trends.find((t: { code: string }) => t.code === 'hba1c').latest.value).toBe(6.5);
  });
});

describe('values read from a document wait for a person', () => {
  const seedExtracted = async () => {
    const id = crypto.randomUUID();
    await h.db.insert(observations).values({ id, patientId: scope('P2', TEST_WS), code: 'egfr', valueNum: 61, obsDate: '2026-11-03', origin: 'upload', documentId: 'doc-x', sourceText: 'eGFR 61 mL/min', status: 'extracted', byUserId: 'system', byLabel: 'Document reader' });
    return id;
  };

  it('does not count until confirmed, then counts with the confirmer named', async () => {
    const doctor = await h.doctor();
    const id = await seedExtracted();
    let rec = await recall(doctor, 'P2');
    expect(rec.missingMeasures.find((m: { code: string }) => m.code === 'egfr').readings ?? []).toHaveLength(0);
    expect((await h.post(`/patients/P2/observations/${id}/confirm`, {}, doctor)).status).toBe(200);
    rec = await recall(doctor, 'P2');
    const egfr = rec.missingMeasures.find((m: { code: string }) => m.code === 'egfr');
    expect(egfr.readings[0].display).toMatch(/61/);
    const v = await h.db.select().from(observationVersions).where(eq(observationVersions.observationId, id));
    expect(v[0].byLabel).toBe('Dr. Swati Mani');
    expect((await h.post(`/patients/P2/observations/${id}/confirm`, {}, doctor)).status).toBe(409);
  });

  it('a correction keeps what was first read; a rejected value never counts', async () => {
    const doctor = await h.doctor();
    const a = await seedExtracted();
    expect((await h.post(`/patients/P2/observations/${a}/correct`, { value: 16, reason: 'OCR read 61 but the report says 16' }, doctor)).status).toBe(200);
    const list = await (await h.get('/patients/P2/observations', doctor)).json();
    const item = list.items.find((i: { id: string }) => i.id === a);
    expect(item).toMatchObject({ status: 'corrected', original: '61', current: 16 });
    expect(item.history[0].reason).toMatch(/OCR read 61/);

    const b = await seedExtracted();
    expect((await h.post(`/patients/P2/observations/${b}/reject`, { reason: 'Belongs to a different patient' }, doctor)).status).toBe(200);
    expect((await h.post(`/patients/P2/observations/${b}/correct`, { value: 50, reason: 'try anyway please' }, doctor)).status).toBe(409);
    const rec = await recall(doctor, 'P2');
    expect(JSON.stringify(rec.facts)).not.toContain(b);
  });

  it('cannot be reviewed through another patient\'s record', async () => {
    const doctor = await h.doctor();
    const id = await seedExtracted();
    expect((await h.post(`/patients/P1/observations/${id}/confirm`, {}, doctor)).status).toBe(404);
  });

  it('is hidden from a patient for another patient', async () => {
    expect((await h.get('/patients/P2/observations', await h.patient(P1_ABHA))).status).toBe(404);
  });
});
