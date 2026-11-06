import { beforeAll, describe, expect, it } from 'vitest';
import { setup, type Harness } from './test-utils';
import { registeredPatients } from './db/schema';
import { FACILITY_HFR } from './seed';

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);

const TOTAL = 100_000;
const NOW = new Date();
const abhaOf = (i: number) => `98${String(i).padStart(12, '0')}`;

describe('a hospital with one lakh registered patients', () => {
  it('lists, counts and searches in pages without loading everyone', async () => {
    const ws = 'abcabcabcabc';
    const doctor = await h.doctor(ws); // the hospital's own space
    for (let from = 0; from < TOTAL; from += 2_000) {
      await h.db.insert(registeredPatients).values(Array.from({ length: 2_000 }, (_, k) => {
        const i = from + k;
        return {
          id: `R${i.toString(16).padStart(8, '0')}`, workspace: ws, hfrId: FACILITY_HFR, abha: abhaOf(i), abhaSource: 'created', name: `Patient ${String(i).padStart(6, '0')}`,
          age: 30 + (i % 50), sex: 'F', phone: '9876500000', verifiedAt: NOW, verifyMethod: 'mobile-otp', consentPurposes: 'create-record,abha-link', consentVersion: 'v1', consentMode: 'in-person-verbal', consentAt: NOW, byUserId: 'u-doc-1', byLabel: 'Dr. Swati Mani',
        };
      }));
    }
    const timed = async (path: string) => { const t0 = performance.now(); const r = await h.get(path, doctor); const ms = performance.now() - t0; return { body: await r.json(), ms, status: r.status }; };

    const first = await timed('/patients/directory?limit=25&offset=0');
    expect(first.status).toBe(200);
    expect(first.body.total).toBe(TOTAL + 2); // the two sample patients plus everyone registered
    expect(first.body.items).toHaveLength(25);

    const deep = await timed('/patients/directory?limit=25&offset=99000');
    expect(deep.body.items).toHaveLength(25);

    const byName = await timed('/patients/directory?q=Patient%20042&limit=25');
    expect(byName.body.total).toBe(1000); // 042000 to 042999

    const byAbha = await timed(`/patients/directory?q=${abhaOf(77_777)}&limit=25`);
    expect(byAbha.body.items.map((p: { name: string }) => p.name)).toEqual(['Patient 077777']);

    const list = await timed('/patients/registered?limit=25&offset=50000');
    expect(list.body.total).toBe(TOTAL);
    expect(list.body.items).toHaveLength(25);

    const worst = Math.max(first.ms, deep.ms, byName.ms, byAbha.ms, list.ms);
    console.log(`100,000 patients: first page ${first.ms.toFixed(0)} ms, deep page ${deep.ms.toFixed(0)} ms, name search ${byName.ms.toFixed(0)} ms, ABHA search ${byAbha.ms.toFixed(0)} ms, hospital list ${list.ms.toFixed(0)} ms`);
    expect(worst).toBeLessThan(3_000); // an in-memory test database, so a loose bound: it proves paging, not production speed
  }, 300_000);
});
