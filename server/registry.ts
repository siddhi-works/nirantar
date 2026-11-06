import { randomBytes, randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { registeredPatients } from './db/schema';
import { parseRecord } from './core/parse';
import { FACILITY_HFR } from './seed';

/** Patients registered during a visit have ids like R1a2b3c4d. The two sample patients are P1 and P2. */
export const REG_ID = /^R[0-9a-f]{8}$/;
export const newPatientId = () => 'R' + randomBytes(4).toString('hex');
export type RegisteredRow = typeof registeredPatients.$inferSelect;

export async function registeredPatient(db: Db, id: string): Promise<RegisteredRow | undefined> {
  if (!REG_ID.test(id)) return undefined;
  const [row] = await db.select().from(registeredPatients).where(eq(registeredPatients.id, id)).limit(1);
  return row;
}

export async function registeredByAbha(db: Db, workspace: string, hfrId: string, abha: string): Promise<RegisteredRow | undefined> {
  const [row] = await db.select().from(registeredPatients)
    .where(and(eq(registeredPatients.workspace, workspace), eq(registeredPatients.hfrId, hfrId), eq(registeredPatients.abha, abha))).limit(1);
  return row;
}

/** A made-up 14-digit number for a sandbox patient who has no ABHA yet. It starts with 99 so it is easy to tell apart. */
export function simulatedAbha(): string {
  return '99' + Array.from({ length: 12 }, () => randomInt(0, 10)).join('');
}

/** Who may open a registered patient: staff of the hospital that registered them, in the tester's own workspace. */
export const canOpenRegistered = (row: RegisteredRow | undefined, user: { role: string; workspace: string; hfrId: string | null; patientId?: string | null }) =>
  !!row && row.workspace === user.workspace && (user.role === 'patient' ? user.patientId === row.id : !!user.hfrId && row.hfrId === user.hfrId);

export async function registeredByWorkspaceAbha(db: Db, workspace: string, abha: string): Promise<RegisteredRow | undefined> {
  const [row] = await db.select().from(registeredPatients).where(and(eq(registeredPatients.workspace, workspace), eq(registeredPatients.abha, abha))).limit(1);
  return row;
}

/**
 * The hospital that holds a patient's record. The two sample patients are held at the home hospital; a patient someone
 * registered is held at the hospital that registered them. Null when there is no such patient.
 */
export async function holderOf(db: Db, base: string): Promise<string | null> {
  if (REG_ID.test(base)) return (await registeredPatient(db, base))?.hfrId ?? null;
  return parseRecord().patients.some(p => p.id === base) ? FACILITY_HFR : null;
}

/** A patient by ABHA number among the samples and those registered in this workspace, at any hospital. */
export async function findPatientByAbha(db: Db, workspace: string, abha: string): Promise<{ id: string; name: string; holder: string } | null> {
  const sample = parseRecord().patients.find(p => p.abhaId.replace(/\D/g, '') === abha);
  if (sample) return { id: sample.id, name: sample.name, holder: FACILITY_HFR };
  const reg = await registeredByWorkspaceAbha(db, workspace, abha);
  return reg ? { id: reg.id, name: reg.name, holder: reg.hfrId } : null;
}
