import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { consents, patients, users } from './db/schema';
import { parseRecord } from './core/parse';

export const FACILITY_HFR = 'IN2900011882';
export const HOME_HFR = FACILITY_HFR; // the hospital that holds both patients' records
export const OTHER_HFR = 'IN0900022991';
export const DEV_DOCTOR_B = { id: 'u-doc-2', hprId: '71-6100-2255-3094', name: 'Dr. Rohit Verma', line: 'Reg. 41207 · General Medicine' };
export const DEV_DOCTOR = { id: 'u-doc-1', hprId: '71-3304-9082-1176', name: 'Dr. Meenakshi Srivastava', line: 'Reg. 98761 · General Medicine' };
export const DEV_NURSE = { id: 'u-nur-1', hprId: '71-5521-0044-8730', name: 'Sr. Kavita Mishra', line: 'Staff Nurse · OPD 3' };

const digits = (s: string) => s.replace(/\D/g, '');

/** Idempotent. Creates the two staff users, the two patients and their sign-in accounts, and dev-granted consents. */
export async function seed(db: Db): Promise<void> {
  await db.insert(users).values([
    { id: DEV_DOCTOR.id, role: 'doctor', name: DEV_DOCTOR.name, line: DEV_DOCTOR.line, hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR },
    { id: DEV_DOCTOR_B.id, role: 'doctor', name: DEV_DOCTOR_B.name, line: DEV_DOCTOR_B.line, hprId: DEV_DOCTOR_B.hprId, hfrId: OTHER_HFR },
    { id: DEV_NURSE.id, role: 'nurse', name: DEV_NURSE.name, line: DEV_NURSE.line, hprId: DEV_NURSE.hprId, hfrId: FACILITY_HFR },
  ]).onConflictDoNothing();

  for (const p of parseRecord().patients) {
    const abha = digits(p.abhaId);
    await db.insert(patients).values({ id: p.id, abha }).onConflictDoNothing();
    await db.insert(users).values({ id: `u-pat-${p.id}`, role: 'patient', name: p.name, line: `ABHA ${p.abhaId}`, abha, patientId: p.id }).onConflictDoNothing();
    const has = await db.select({ id: consents.id }).from(consents).where(eq(consents.patientId, p.id)).limit(1);
    if (!has.length) await db.insert(consents).values({ patientId: p.id, facilityHfr: FACILITY_HFR, purpose: 'treatment', source: 'dev-auto' });
  }
}
