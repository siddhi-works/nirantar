import { randomUUID, randomInt } from 'node:crypto';
import { and, count, eq, like } from 'drizzle-orm';
import type { Db } from './db/client';
import { observations, registeredPatients } from './db/schema';
import { addVisit } from './opd';
import { scope } from './seed';
import { simulatedAbha } from './registry';

/** The label every demo row carries, so it can be told apart from a real entry and removed. */
export const DEMO_LABEL = 'Demo OPD · sample data';

interface DemoPatient { name: string; age: number; sex: 'M' | 'F'; place: string; rows: { daysAgo: number; v: Record<string, number | string> }[] }

/** A general-medicine OPD morning, made up for demonstration. Values are illustrative and are never real patients' results. */
const PATIENTS: DemoPatient[] = [
  { name: 'Ramesh Chandra Gupta (demo)', age: 58, sex: 'M', place: 'Gorakhpur', rows: [
    { daysAgo: 182, v: { hba1c: 8.4, fbs: 162, ppbs: 236 } }, { daysAgo: 91, v: { hba1c: 7.9, fbs: 148, ppbs: 210, weight: 76 } }, { daysAgo: 12, v: { hba1c: 7.2, fbs: 131, ppbs: 186, weight: 74, sbp: 138, dbp: 86, height: 168 } }] },
  { name: 'Sunita Kumari Verma (demo)', age: 49, sex: 'F', place: 'Deoria', rows: [
    { daysAgo: 150, v: { hba1c: 7.1, fbs: 128, ppbs: 190, insulin: 15.1 } }, { daysAgo: 20, v: { hba1c: 6.8, fbs: 118, ppbs: 172, insulin: 12.6, weight: 71, height: 157 } }] },
  { name: 'Mohammed Irfan Ansari (demo)', age: 61, sex: 'M', place: 'Kushinagar', rows: [
    { daysAgo: 200, v: { hba1c: 9.2, fbs: 196, ppbs: 288, 'prior-mi': 'yes', hcv: 'negative' } }, { daysAgo: 100, v: { hba1c: 8.8, fbs: 176, ppbs: 262 } }, { daysAgo: 9, v: { hba1c: 8.1, fbs: 158, ppbs: 231, sbp: 146, dbp: 90, weight: 82, height: 170 } }] },
  { name: 'Lata Devi Mishra (demo)', age: 44, sex: 'F', place: 'Gorakhpur', rows: [
    { daysAgo: 60, v: { hba1c: 6.3, fbs: 112, ppbs: 150, insulin: 13.4, hiv: 'negative' } }, { daysAgo: 6, v: { hba1c: 6.2, fbs: 108, ppbs: 146, insulin: 11.8, weight: 68, height: 154 } }] },
  { name: 'Harish Prasad Tiwari (demo)', age: 66, sex: 'M', place: 'Maharajganj', rows: [
    { daysAgo: 120, v: { hba1c: 7.8, fbs: 142, ppbs: 205, hcv: 'positive' } }, { daysAgo: 15, v: { hba1c: 7.5, fbs: 136, ppbs: 198, sbp: 132, dbp: 82, weight: 70, height: 165 } }] },
  { name: 'Geeta Rani Pathak (demo)', age: 37, sex: 'F', place: 'Basti', rows: [{ daysAgo: 3, v: { hba1c: 6.9, fbs: 121, ppbs: 178 } }] },
];

const dayOf = (daysAgo: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); };

/** Registers the demo patients at the hospital, records their values, and puts them in today's queue. Returns how many were added, or 0 if already loaded. */
export async function loadDemoDay(db: Db, user: { id: string; workspace: string; hfrId: string }): Promise<number> {
  const [have] = await db.select({ n: count() }).from(registeredPatients).where(and(eq(registeredPatients.workspace, user.workspace), eq(registeredPatients.hfrId, user.hfrId), like(registeredPatients.name, '% (demo)')));
  if ((have?.n ?? 0) > 0) return 0;
  const now = new Date();
  let added = 0;
  for (const p of PATIENTS) {
    const id = `R${randomInt(0, 0xffffffff).toString(16).padStart(8, '0')}`;
    const abha = simulatedAbha();
    await db.insert(registeredPatients).values({
      id, workspace: user.workspace, hfrId: user.hfrId, abha, abhaSource: 'created', name: p.name, age: p.age, sex: p.sex, phone: '9876500000', place: p.place,
      verifiedAt: now, verifyMethod: 'demo', consentPurposes: 'create-record,abha-link', consentVersion: 'demo', consentMode: 'in-person-verbal', consentAt: now, byUserId: user.id, byLabel: DEMO_LABEL,
    });
    for (const row of p.rows) {
      const groupId = randomUUID();
      for (const [code, value] of Object.entries(row.v)) {
        await db.insert(observations).values({
          id: randomUUID(), patientId: scope(id, user.workspace), code, valueNum: typeof value === 'number' ? value : null, valueText: typeof value === 'string' ? value : null,
          obsDate: dayOf(row.daysAgo), origin: 'entry', status: 'verified', groupId, byUserId: user.id, byLabel: DEMO_LABEL,
        });
      }
    }
    await addVisit(db, { id: randomUUID(), workspace: user.workspace, hfrId: user.hfrId, patientId: id, name: p.name, abha, source: 'desk', priority: 'routine', status: 'waiting', byLabel: DEMO_LABEL });
    added++;
  }
  return added;
}
