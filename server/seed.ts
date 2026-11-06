import { randomBytes } from 'node:crypto';
import type { Db } from './db/client';
import { eq, inArray, like, lt } from 'drizzle-orm';
import { profilePhotos, abdmTransfers, consentEvents, consents, documents, editRequests, educationLog, exchangeKeys, gatewayMessages, hipConsentCopies, opdSettings, opdVisits, patientAdvice, sessions, factVerifications, fileBlobs, observations, observationVersions, patients, receivedRecords, recordAnnotations, registeredPatients, registrationDrafts, simCareContexts, simConsents, simTransfers, users, workspaces } from './db/schema';
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

/* ───────── private sample spaces ─────────
 * Everything a tester adds (uploads, corrections, confirmations, consent choices, received records) belongs to their
 * workspace, tied to their browser. Two testers never see each other's changes, and "start fresh" is a new workspace.
 */

export const WORKSPACE_RE = /^[a-f0-9]{12}$/;
export const newWorkspaceId = () => randomBytes(6).toString('hex');
/** The key under which a patient's added data is stored inside a workspace. */
export const scope = (patientId: string, ws: string) => `${patientId}~${ws}`;
export const baseOf = (scoped: string) => scoped.split('~')[0];
export const workspaceOf = (scoped: string) => scoped.split('~')[1] ?? '';

const IDLE_DAYS = 14;

/** Make sure a workspace exists and has the starting data: a request from the other hospital waiting for the first patient. */
export async function ensureWorkspace(db: Db, ws: string): Promise<void> {
  // Insert first and see whether this request created the row. Two sign-ins at once cannot both create it,
  // so the starting request from the other hospital is added exactly once.
  const created = await db.insert(workspaces).values({ id: ws }).onConflictDoNothing().returning({ id: workspaces.id });
  if (!created.length) { await db.update(workspaces).set({ seenAt: new Date() }).where(eq(workspaces.id, ws)); return; }
  // Nothing else is created for a new space: a request from another hospital exists only when a hospital really makes one.
}

/** Remove every workspace nobody has touched for two weeks, with its uploads. Returns how many were cleared. */
export async function clearIdleWorkspaces(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - IDLE_DAYS * 86_400_000);
  const stale = await db.select({ id: workspaces.id }).from(workspaces).where(lt(workspaces.seenAt, cutoff)).limit(25);
  for (const { id: ws } of stale) await removeWorkspace(db, ws);
  return stale.length;
}

export async function removeWorkspace(db: Db, ws: string): Promise<void> {
  await db.delete(profilePhotos).where(eq(profilePhotos.workspace, ws));
  const mine = `%~${ws}`;
  const docs = await db.select({ id: documents.id }).from(documents).where(like(documents.patientId, mine));
  if (docs.length) await db.delete(fileBlobs).where(inArray(fileBlobs.id, docs.map(d => d.id)));
  const consentRows = await db.select({ id: simConsents.id }).from(simConsents).where(eq(simConsents.workspace, ws));
  if (consentRows.length) {
    const ids = consentRows.map(c => c.id);
    const transfers = [
      ...(await db.select({ id: simTransfers.id }).from(simTransfers).where(inArray(simTransfers.consentId, ids))),
      ...(await db.select({ id: abdmTransfers.id }).from(abdmTransfers).where(inArray(abdmTransfers.consentId, ids))),
    ];
    if (transfers.length) await db.delete(exchangeKeys).where(inArray(exchangeKeys.id, transfers.map(t => t.id)));
    await db.delete(simTransfers).where(inArray(simTransfers.consentId, ids));
    await db.delete(abdmTransfers).where(inArray(abdmTransfers.consentId, ids));
  }
  const received = await db.select({ id: receivedRecords.id }).from(receivedRecords).where(eq(receivedRecords.workspace, ws));
  if (received.length) await db.delete(recordAnnotations).where(inArray(recordAnnotations.receivedId, received.map(r => r.id)));
  await db.delete(receivedRecords).where(eq(receivedRecords.workspace, ws));
  await db.delete(simConsents).where(eq(simConsents.workspace, ws));
  const regs = await db.select({ id: registeredPatients.id }).from(registeredPatients).where(eq(registeredPatients.workspace, ws));
  await db.delete(sessions).where(eq(sessions.workspace, ws));
  if (regs.length) {
    const made = (await db.select({ id: users.id }).from(users).where(inArray(users.patientId, regs.map(r => r.id)))).map(u => u.id);
    if (made.length) { await db.delete(sessions).where(inArray(sessions.userId, made)); await db.delete(users).where(inArray(users.id, made)); } // the sign-ins made for them
  }
  for (const t of [opdVisits, opdSettings, editRequests, educationLog, patientAdvice, gatewayMessages, hipConsentCopies, consentEvents]) await db.delete(t).where(eq(t.workspace, ws));
  await db.delete(registeredPatients).where(eq(registeredPatients.workspace, ws));
  await db.delete(registrationDrafts).where(eq(registrationDrafts.workspace, ws));
  for (const t of [documents, observations, observationVersions, factVerifications, simCareContexts]) await db.delete(t).where(like(t.patientId, mine));
  await db.delete(workspaces).where(eq(workspaces.id, ws));
}
