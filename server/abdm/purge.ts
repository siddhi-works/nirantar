import { and, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { gatewayMessages, receivedRecords, recordAnnotations, simConsents } from '../db/schema';
import { randomUUID } from 'node:crypto';

/**
 * The receiving hospital's duty under the consent: when the patient withdraws it, or the date it was told to erase by arrives,
 * its copy of the record (and the notes beside it) must be deleted. Returns how many copies were erased.
 */
export async function purgeReceivedCopies(db: Db, where: { workspace?: string; hiuHfr?: string; consentId?: string } = {}, now = new Date()): Promise<number> {
  const scope = [where.workspace ? eq(simConsents.workspace, where.workspace) : undefined, where.hiuHfr ? eq(simConsents.hiuHfr, where.hiuHfr) : undefined, where.consentId ? eq(simConsents.id, where.consentId) : undefined].filter(Boolean);
  const due = await db.select().from(simConsents).where(and(...scope, or(eq(simConsents.status, 'revoked'), and(isNotNull(simConsents.dataEraseAt), lt(simConsents.dataEraseAt, now)), and(eq(simConsents.status, 'granted'), isNotNull(simConsents.expiresAt), lt(simConsents.expiresAt, now)))));
  let erased = 0;
  for (const c of due) {
    // A consent that has only expired still lets the receiver keep its copy until its erase date. A withdrawn one does not.
    const mustErase = c.status === 'revoked' || (c.dataEraseAt && c.dataEraseAt.getTime() < now.getTime());
    if (!mustErase) continue;
    const rows = await db.select({ id: receivedRecords.id }).from(receivedRecords).where(eq(receivedRecords.consentId, c.id));
    if (!rows.length) continue;
    await db.delete(recordAnnotations).where(inArray(recordAnnotations.receivedId, rows.map(r => r.id)));
    await db.delete(receivedRecords).where(eq(receivedRecords.consentId, c.id));
    await db.insert(gatewayMessages).values({ workspace: c.workspace, requestId: randomUUID(), from: 'hiu', to: 'hiu', path: 'erase-received-copy', status: 'ok', summary: c.status === 'revoked' ? 'The patient withdrew consent, so the receiving hospital erased its copy' : 'The erase date passed, so the receiving hospital erased its copy' });
    erased += rows.length;
  }
  return erased;
}
