import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ExchangeConsent, ReceivedRecordItem, ReceivedRecordView } from '../../src/domain/exchange';
import { accessLog, documents, exchangeKeys, observations, patients, receivedRecords, recordAnnotations, simCareContexts, simConsents, simTransfers } from '../db/schema';
import { buildRecall } from '../core/engine';
import { LIMITS, countRequests, record } from '../auth/ratelimit';
import { HOME_HFR } from '../seed';
import { generateKeyPair, open as unseal, seal } from '../sim/crypto';
import { buildBundle, type FhirBundle } from '../sim/fhir';
import { facilityName } from '../sim/facilities';
import { NOT_FOUND, digits, patientOf, type AppCtx, type Env } from '../ctx';
import { patientIdParam } from './patients';

type ConsentRow = typeof simConsents.$inferSelect;

/** A granted consent that has passed its end date reads as expired everywhere. */
const effective = (c: ConsentRow): ExchangeConsent['status'] =>
  c.status === 'granted' && c.expiresAt && c.expiresAt.getTime() <= Date.now() ? 'expired' : (c.status as ExchangeConsent['status']);

const fmtAbha = (d: string) => [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].join('-');

export function exchangeRoutes(ctx: AppCtx) {
  const { db, requireUser, open, opsFor } = ctx;
  const r = new Hono<Env>();

  const toConsent = (c: ConsentRow, fetched: Set<string>, received: Map<string, string>): ExchangeConsent => ({
    id: c.id, abha: fmtAbha(c.abha), hiuName: c.hiuName, hiuHfr: c.hiuHfr, purpose: c.purpose, validityDays: c.validityDays, status: effective(c),
    requestedAt: c.createdAt.toISOString(), decidedAt: c.decidedAt?.toISOString() ?? null, expiresAt: c.expiresAt?.toISOString() ?? null,
    fetched: fetched.has(c.id), receivedId: received.get(c.id) ?? null,
  });

  async function receivedIndex(ids: string[]) {
    if (!ids.length) return { fetched: new Set<string>(), received: new Map<string, string>() };
    const rows = await db.select({ id: receivedRecords.id, consentId: receivedRecords.consentId }).from(receivedRecords).where(inArray(receivedRecords.consentId, ids)).orderBy(asc(receivedRecords.receivedAt));
    return { fetched: new Set(rows.map(x => x.consentId)), received: new Map(rows.map(x => [x.consentId, x.id])) };
  }

  /* ───────── a hospital asks the patient for consent ───────── */

  r.post('/exchange/requests', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const body = z.object({ abha: z.string().max(40), purpose: z.enum(['Treatment', 'Follow-up care', 'Second opinion']), validityDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success || digits(body.data.abha).length !== 14) return c.json({ error: 'invalid', message: 'Enter the 14-digit ABHA number, a purpose and how long the access should last.' }, 400);
    const key = `xreq:${user.id}`;
    if (await countRequests(db, key) >= LIMITS.requestsPerId * 2) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, key, true);

    const abha = digits(body.data.abha);
    const [p] = await db.select().from(patients).where(eq(patients.abha, abha)).limit(1);
    const hfr = user.hfrId ?? '';
    const dup = (await db.select().from(simConsents).where(and(eq(simConsents.abha, abha), eq(simConsents.hiuHfr, hfr))))
      .some(x => x.status === 'requested' || effective(x) === 'granted');
    // A request for a number nobody has is stored too, so the hospital's list looks the same either way.
    if (!dup && hfr !== HOME_HFR) {
      await db.insert(simConsents).values({ id: randomUUID(), patientId: p?.id ?? null, abha, hiuHfr: hfr, hiuUserId: user.id, hiuName: facilityName(hfr), purpose: body.data.purpose, validityDays: body.data.validityDays, status: 'requested' });
    }
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action: 'exchange-request', patientId: p?.id ?? null, outcome: 'allowed' });
    return c.json({ ok: true }, 202);
  });

  /** The requesting hospital's own list. Never names the patient before they have agreed. */
  r.get('/exchange/requests', requireUser('doctor', 'nurse'), async c => {
    const hfr = c.get('user').hfrId ?? '';
    const rows = await db.select().from(simConsents).where(eq(simConsents.hiuHfr, hfr)).orderBy(desc(simConsents.createdAt));
    const { fetched, received } = await receivedIndex(rows.map(x => x.id));
    return c.json({ items: rows.map(x => toConsent(x, fetched, received)) });
  });

  /* ───────── the patient decides ───────── */

  r.get('/exchange/consents', requireUser('patient'), async c => {
    const pid = c.get('user').patientId ?? '';
    const rows = await db.select().from(simConsents).where(eq(simConsents.patientId, pid)).orderBy(desc(simConsents.createdAt));
    const { fetched, received } = await receivedIndex(rows.map(x => x.id));
    return c.json({ items: rows.map(x => toConsent(x, fetched, received)) });
  });

  async function mine(c: Parameters<typeof open>[0]) {
    const user = c.get('user');
    const [row] = await db.select().from(simConsents).where(and(eq(simConsents.id, c.req.param('id') ?? ''), eq(simConsents.patientId, user.patientId ?? '-'))).limit(1);
    return row;
  }

  r.post('/exchange/consents/:id/decision', requireUser('patient'), async c => {
    const row = await mine(c);
    const body = z.object({ decision: z.enum(['grant', 'deny']) }).safeParse(await c.req.json().catch(() => null));
    if (!row) return c.json(NOT_FOUND, 404);
    if (!body.success) return c.json({ error: 'bad_request' }, 400);
    if (row.status !== 'requested') return c.json({ error: 'invalid', message: 'This request has already been answered.' }, 409);
    const grant = body.data.decision === 'grant';
    await db.update(simConsents).set({ status: grant ? 'granted' : 'denied', decidedAt: new Date(), expiresAt: grant ? new Date(Date.now() + row.validityDays * 86_400_000) : null }).where(eq(simConsents.id, row.id));
    await db.insert(accessLog).values({ userId: c.get('user').id, role: 'patient', action: grant ? 'consent-granted' : 'consent-denied', patientId: row.patientId, outcome: 'allowed' });
    return c.json({ ok: true });
  });

  r.post('/exchange/consents/:id/revoke', requireUser('patient'), async c => {
    const row = await mine(c);
    if (!row) return c.json(NOT_FOUND, 404);
    if (effective(row) !== 'granted') return c.json({ error: 'invalid', message: 'Only an active permission can be withdrawn.' }, 409);
    await db.update(simConsents).set({ status: 'revoked', decidedAt: new Date() }).where(eq(simConsents.id, row.id));
    await db.insert(accessLog).values({ userId: c.get('user').id, role: 'patient', action: 'consent-revoked', patientId: row.patientId, outcome: 'allowed' });
    return c.json({ ok: true });
  });

  /* ───────── the transfer: sender (HIP), gateway, receiver (HIU) ───────── */

  r.post('/exchange/consents/:id/fetch', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const [consent] = await db.select().from(simConsents).where(eq(simConsents.id, c.req.param('id') ?? '')).limit(1);
    const allowed = !!consent && consent.hiuHfr === user.hfrId && effective(consent) === 'granted' && !!consent.patientId && !!patientOf(consent.patientId);
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action: 'exchange-fetch', patientId: consent?.patientId ?? null, outcome: allowed ? 'allowed' : 'denied' });
    if (!allowed || !consent?.patientId) return c.json(NOT_FOUND, 404);

    // Receiver: a fresh key pair for this transfer. The private key stays on this side.
    const transferId = randomUUID();
    const hiu = generateKeyPair();
    await db.insert(exchangeKeys).values({ id: transferId, hiuHfr: consent.hiuHfr, privateKey: hiu.privateKey, publicKey: hiu.publicKey });

    // Sender (the hospital that holds the record): builds the bundle and encrypts it for the receiver's public key.
    const recall = buildRecall(consent.patientId, await opsFor(consent.patientId));
    const sealed = seal(JSON.stringify(buildBundle(recall, { hfr: HOME_HFR, name: facilityName(HOME_HFR) })), hiu.publicKey);

    // Gateway: holds ciphertext and public values only, and hands them on.
    await db.insert(simTransfers).values({ id: transferId, consentId: consent.id, hipHfr: HOME_HFR, ciphertext: sealed.ciphertext, iv: sealed.iv, salt: sealed.salt, hipPublicKey: sealed.senderPublicKey });

    // Receiver: decrypts with its own private key. A changed bundle fails here and nothing is stored.
    const [t] = await db.select().from(simTransfers).where(eq(simTransfers.id, transferId));
    const [k] = await db.select().from(exchangeKeys).where(eq(exchangeKeys.id, transferId));
    let plain: string;
    try { plain = unseal({ ciphertext: t.ciphertext, iv: t.iv, salt: t.salt, senderPublicKey: t.hipPublicKey }, k.privateKey); } catch { return c.json({ error: 'invalid', message: 'The record could not be verified and was not stored.' }, 502); }
    const receivedId = randomUUID();
    await db.insert(receivedRecords).values({ id: receivedId, patientId: consent.patientId, consentId: consent.id, hiuHfr: consent.hiuHfr, fromHfr: t.hipHfr, bundle: plain });
    return c.json({ receivedId }, 201);
  });

  /* ───────── the receiving hospital reads it, read-only ───────── */

  const summary = (b: FhirBundle) => {
    const pat = b.entry.find(e => e.resource.resourceType === 'Patient')?.resource as { name?: { text: string }[] } | undefined;
    return { patientName: pat?.name?.[0]?.text ?? '', observations: b.entry.filter(e => e.resource.resourceType === 'Observation').length };
  };

  r.get('/exchange/received', requireUser('doctor', 'nurse'), async c => {
    const hfr = c.get('user').hfrId ?? '';
    const rows = await db.select().from(receivedRecords).where(eq(receivedRecords.hiuHfr, hfr)).orderBy(desc(receivedRecords.receivedAt));
    const notes = rows.length ? await db.select().from(recordAnnotations).where(inArray(recordAnnotations.receivedId, rows.map(x => x.id))) : [];
    return c.json({
      items: rows.map(x => ({ id: x.id, fromName: facilityName(x.fromHfr), receivedAt: x.receivedAt.toISOString(), annotations: notes.filter(n => n.receivedId === x.id).length, ...summary(JSON.parse(x.bundle) as FhirBundle) } satisfies ReceivedRecordItem)),
    });
  });

  async function receivedFor(c: Parameters<typeof open>[0], action: string) {
    const user = c.get('user');
    const [row] = await db.select().from(receivedRecords).where(eq(receivedRecords.id, c.req.param('id') ?? '')).limit(1);
    const ok = !!row && row.hiuHfr === user.hfrId;
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action, patientId: row?.patientId ?? null, outcome: ok ? 'allowed' : 'denied' });
    return ok ? row : null;
  }

  r.get('/exchange/received/:id', requireUser('doctor', 'nurse'), async c => {
    const row = await receivedFor(c, 'view-received-record');
    if (!row) return c.json(NOT_FOUND, 404);
    const notes = await db.select().from(recordAnnotations).where(eq(recordAnnotations.receivedId, row.id)).orderBy(asc(recordAnnotations.id));
    const [consent] = await db.select().from(simConsents).where(eq(simConsents.id, row.consentId)).limit(1);
    return c.json({
      id: row.id, fromName: facilityName(row.fromHfr), receivedAt: row.receivedAt.toISOString(), bundle: JSON.parse(row.bundle),
      consentStatus: consent ? effective(consent) : 'expired',
      annotations: notes.map(n => ({ id: n.id, text: n.text, by: n.byLabel, at: n.at.toISOString() })),
    } satisfies ReceivedRecordView);
  });

  r.post('/exchange/received/:id/annotations', requireUser('doctor', 'nurse'), async c => {
    const row = await receivedFor(c, 'annotate-received-record');
    const body = z.object({ text: z.string().trim().min(2).max(500) }).safeParse(await c.req.json().catch(() => null));
    if (!row) return c.json(NOT_FOUND, 404);
    if (!body.success) return c.json({ error: 'invalid', message: 'Write a short note.' }, 400);
    const user = c.get('user');
    await db.insert(recordAnnotations).values({ receivedId: row.id, text: body.data.text, byUserId: user.id, byLabel: user.name });
    return c.json({ ok: true }, 201);
  });

  /* ───────── the holding hospital makes a document available ───────── */

  /** Pending in our private store until pushed. Only a fully reviewed document can be pushed. */
  r.post('/patients/:id/documents/:docId/push', requireUser('doctor', 'nurse'), async c => {
    const pid = patientIdParam.safeParse(c.req.param('id'));
    if (!pid.success || !(await open(c, pid.data, 'push-document'))) return c.json(NOT_FOUND, 404);
    const [d] = await db.select().from(documents).where(and(eq(documents.id, c.req.param('docId') ?? ''), eq(documents.patientId, pid.data))).limit(1);
    if (!d) return c.json(NOT_FOUND, 404);
    if (d.syncStatus === 'pushed') return c.json({ error: 'invalid', message: 'This document has already been pushed.' }, 409);
    if (d.status !== 'done') return c.json({ error: 'invalid', message: 'This document has not been read yet.' }, 409);
    const waiting = await db.select({ id: observations.id }).from(observations).where(and(eq(observations.documentId, d.id), eq(observations.status, 'extracted')));
    if (waiting.length) return c.json({ error: 'invalid', message: `Review the ${waiting.length} value${waiting.length === 1 ? '' : 's'} read from this document first. Nothing unreviewed is pushed.` }, 409);
    await db.insert(simCareContexts).values({ id: randomUUID(), patientId: pid.data, hipHfr: HOME_HFR, documentId: d.id, display: `${d.docType}, ${d.fileName}` });
    await db.update(documents).set({ syncStatus: 'pushed' }).where(eq(documents.id, d.id));
    return c.json({ ok: true });
  });

  return r;
}
