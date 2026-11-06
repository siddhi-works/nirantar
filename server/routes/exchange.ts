import { todayIST } from '../time';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ExchangeConsent, ReceivedRecordItem, ReceivedRecordView } from '../../src/domain/exchange';
import { createHash } from 'node:crypto';
import { abdmTransfers, accessLog, documents, exchangeKeys, gatewayMessages, hipConsentCopies, observations, registeredPatients, receivedRecords, recordAnnotations, simCareContexts, simConsents } from '../db/schema';
import { HI_TYPES, refusal, sign, verify, type Artefact, type HiType } from '../abdm/artefact';
import { purgeReceivedCopies } from '../abdm/purge';
import { buildRecall } from '../core/engine';
import { LIMITS, countRequests, record } from '../auth/ratelimit';
import { HOME_HFR } from '../seed';
import { parseRecord } from '../core/parse';
import { generateKeyPair, open as unseal, seal, type KeyMaterial } from '../sim/crypto';
import { buildBundle, buildRegisteredBundle, type FhirBundle } from '../sim/fhir';
import { facilityName } from '../sim/facilities';
import { NOT_FOUND, digits, patientOf, type AppCtx, type Env } from '../ctx';
import { REG_ID, findPatientByAbha, holderOf, registeredPatient } from '../registry';
import { patientIdParam } from './patients';
import { baseOf, scope } from '../seed';

type ConsentRow = typeof simConsents.$inferSelect;

/** A granted consent that has passed its end date reads as expired everywhere. */
const effective = (c: ConsentRow): ExchangeConsent['status'] =>
  c.status === 'granted' && c.expiresAt && c.expiresAt.getTime() <= Date.now() ? 'expired' : (c.status as ExchangeConsent['status']);

const fmtAbha = (d: string) => [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].join('-');

export function exchangeRoutes(ctx: AppCtx) {
  const { db, requireUser, open, opsFor } = ctx;
  const r = new Hono<Env>();

  /** One message between two of the parties, written so it can be inspected. Never carries health data. */
  const msg = (ws: string, rid: string, from: string, to: string, path: string, summary: string, status: 'ok' | 'rejected' | 'error' = 'ok') =>
    db.insert(gatewayMessages).values({ workspace: ws, requestId: rid, from, to, path, status, summary });

  const toConsent = (c: ConsentRow, fetched: Set<string>, received: Map<string, string>): ExchangeConsent => ({
    id: c.id, abha: fmtAbha(c.abha), hiuName: c.hiuName, hiuHfr: c.hiuHfr, purpose: c.purpose, validityDays: c.validityDays, status: effective(c),
    requestedAt: c.createdAt.toISOString(), decidedAt: c.decidedAt?.toISOString() ?? null, expiresAt: c.expiresAt?.toISOString() ?? null,
    fetched: fetched.has(c.id), receivedId: received.get(c.id) ?? null,
    purposeCode: c.purposeCode, hiTypes: c.hiTypes.split(',').filter(Boolean) as HiType[], dateFrom: c.dateFrom?.toISOString().slice(0, 10) ?? null,
    keepDays: c.keepDays, dataEraseAt: c.dataEraseAt?.toISOString() ?? null, requesterName: c.requesterName,
  });

  async function receivedIndex(ids: string[]) {
    if (!ids.length) return { fetched: new Set<string>(), received: new Map<string, string>() };
    const rows = await db.select({ id: receivedRecords.id, consentId: receivedRecords.consentId }).from(receivedRecords).where(inArray(receivedRecords.consentId, ids)).orderBy(asc(receivedRecords.receivedAt));
    return { fetched: new Set(rows.map(x => x.consentId)), received: new Map(rows.map(x => [x.consentId, x.id])) };
  }

  /* ───────── a hospital asks the patient for consent ───────── */

  r.post('/exchange/requests', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const body = z.object({
      abha: z.string().max(40), purpose: z.enum(['Treatment', 'Follow-up care', 'Second opinion']), validityDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
      hiTypes: z.array(z.enum(HI_TYPES)).min(1).max(3).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), keepDays: z.number().int().min(1).max(365).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success || digits(body.data.abha).length !== 14) return c.json({ error: 'invalid', message: 'Enter the 14-digit ABHA number, a purpose, the kinds of record you need and how long the access should last.' }, 400);
    const key = `xreq:${user.id}:${user.workspace}`;
    if (await countRequests(db, key) >= LIMITS.requestsPerId * 2) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, key, true);

    const abha = digits(body.data.abha);
    const p = await findPatientByAbha(db, user.workspace, abha); // a sample patient or one registered in this space, at either hospital
    const hfr = user.hfrId ?? '';
    const dup = (await db.select().from(simConsents).where(and(eq(simConsents.abha, abha), eq(simConsents.hiuHfr, hfr), eq(simConsents.workspace, user.workspace))))
      .some(x => x.status === 'requested' || effective(x) === 'granted');
    // A request for a number nobody has is stored too, so the hospital's list looks the same either way.
    if (!dup && p?.holder !== hfr) { // a hospital asking for a record it already holds is ignored
      const id = randomUUID();
      const types = body.data.hiTypes ?? [...HI_TYPES];
      await db.insert(simConsents).values({
        id, patientId: p ? scope(p.id, user.workspace) : null, abha, hiuHfr: hfr, hiuUserId: user.id, hiuName: facilityName(hfr), workspace: user.workspace, purpose: body.data.purpose, validityDays: body.data.validityDays, status: 'requested',
        purposeCode: 'CAREMGT', hiTypes: types.join(','), dateFrom: body.data.from ? new Date(body.data.from) : null, keepDays: body.data.keepDays ?? body.data.validityDays, requesterName: user.name, requesterReg: user.hprId ?? '',
      });
      await msg(user.workspace, id, 'hiu', 'gateway', '/v3/consent-requests/init', `Consent requested for ${types.length} kind${types.length === 1 ? '' : 's'} of record`);
      await msg(user.workspace, id, 'gateway', 'phr-app', '/v3/consent-requests/notify', 'The patient was told a hospital is asking');
    }
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action: 'exchange-request', patientId: p?.id ?? null, outcome: 'allowed' });
    return c.json({ ok: true }, 202);
  });

  /** The requesting hospital's own list. Never names the patient before they have agreed. */
  r.get('/exchange/requests', requireUser('doctor', 'nurse'), async c => {
    const me = c.get('user'); const hfr = me.hfrId ?? '';
    const rows = await db.select().from(simConsents).where(and(eq(simConsents.hiuHfr, hfr), eq(simConsents.workspace, me.workspace))).orderBy(desc(simConsents.createdAt));
    const { fetched, received } = await receivedIndex(rows.map(x => x.id));
    return c.json({ items: rows.map(x => toConsent(x, fetched, received)) });
  });

  /**
   * Every patient known in this tester's space, at either hospital, and what this hospital may do with each: open the record it
   * holds, ask for access, wait for the patient, or fetch a copy once they have allowed it. In real ABDM a hospital can only ask
   * for a patient whose ABHA it already knows; the sandbox lists them all so the exchange can be tried.
   */
  r.get('/patients/directory', requireUser('doctor', 'nurse'), async c => {
    const me = c.get('user'); const hfr = me.hfrId ?? '';
    const q = z.object({ q: z.string().trim().max(60).optional(), held: z.enum(['1']).optional(), limit: z.coerce.number().int().min(1).max(50).default(25), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }).safeParse(c.req.query());
    if (!q.success) return c.json({ error: 'bad_request' }, 400);
    const { q: term = '', held, limit, offset } = q.data;
    const needle = term.toLowerCase(); const digitsOnly = digits(term);
    // The two sample patients are filtered here; registered patients are filtered, counted and paged by the database.
    const samples = parseRecord().patients.map(p => ({ id: p.id, name: p.name, abha: digits(p.abhaId), holder: HOME_HFR }))
      .filter(p => (!held || p.holder === hfr) && (!needle || p.name.toLowerCase().includes(needle) || (digitsOnly.length >= 3 && p.abha.startsWith(digitsOnly))));
    const like_ = needle.replace(/[\\%_]/g, m => '\\' + m); // a typed % or _ is a letter, not a wildcard
    const where = and(eq(registeredPatients.workspace, me.workspace), held ? eq(registeredPatients.hfrId, hfr) : undefined,
      needle ? or(like(sql`lower(${registeredPatients.name})`, `%${like_}%`), digitsOnly.length >= 3 ? like(registeredPatients.abha, `${digitsOnly}%`) : undefined) : undefined);
    const [{ n: registeredTotal }] = await db.select({ n: count() }).from(registeredPatients).where(where);
    const total = samples.length + registeredTotal;
    // samples come first, so a page is a slice of samples followed by a slice of the registered rows
    const fromSamples = samples.slice(offset, offset + limit);
    const need = limit - fromSamples.length;
    const rows = need > 0 ? await db.select().from(registeredPatients).where(where).orderBy(asc(registeredPatients.name), asc(registeredPatients.id)).limit(need).offset(Math.max(0, offset - samples.length)) : [];
    const known = [...fromSamples, ...rows.map(p => ({ id: p.id, name: p.name, abha: p.abha, holder: p.hfrId }))];
    const abhas = known.map(k => k.abha);
    const asks = abhas.length ? await db.select().from(simConsents).where(and(eq(simConsents.hiuHfr, hfr), eq(simConsents.workspace, me.workspace), inArray(simConsents.abha, abhas))) : [];
    const { received } = await receivedIndex(asks.map(a => a.id));
    return c.json({
      total, offset, limit,
      items: known.map(k => {
        const mine = asks.filter(a => a.abha === k.abha).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const access = k.holder === hfr ? 'held' : mine ? effective(mine) : 'none';
        return { patientId: k.id, name: k.name, abha: fmtAbha(k.abha), holderHfr: k.holder, holderName: facilityName(k.holder), access, consentId: mine?.id ?? null, receivedId: mine ? received.get(mine.id) ?? null : null };
      }),
    });
  });

  /* ───────── the patient decides ───────── */

  r.get('/exchange/consents', requireUser('patient'), async c => {
    const me = c.get('user');
    const rows = await db.select().from(simConsents).where(eq(simConsents.patientId, scope(me.patientId ?? '-', me.workspace))).orderBy(desc(simConsents.createdAt));
    const { fetched, received } = await receivedIndex(rows.map(x => x.id));
    return c.json({ items: rows.map(x => toConsent(x, fetched, received)) });
  });

  async function mine(c: Parameters<typeof open>[0]) {
    const user = c.get('user');
    const [row] = await db.select().from(simConsents).where(and(eq(simConsents.id, c.req.param('id') ?? ''), eq(simConsents.patientId, scope(user.patientId ?? '-', user.workspace)))).limit(1);
    return row;
  }

  /**
   * The patient may allow less than was asked: fewer kinds of record, a shorter access period, an earlier erase date. The signed
   * artefact says exactly what was allowed, and the sending hospital keeps its own copy.
   */
  r.post('/exchange/consents/:id/decision', requireUser('patient'), async c => {
    const row = await mine(c);
    const body = z.object({ decision: z.enum(['grant', 'deny']), hiTypes: z.array(z.enum(HI_TYPES)).max(3).optional(), validityDays: z.number().int().min(1).max(365).optional(), keepDays: z.number().int().min(1).max(365).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!row) return c.json(NOT_FOUND, 404);
    if (!body.success) return c.json({ error: 'bad_request' }, 400);
    if (row.status !== 'requested') return c.json({ error: 'invalid', message: 'This request has already been answered.' }, 409);
    const grant = body.data.decision === 'grant';
    const asked = (row.hiTypes ? row.hiTypes.split(',').filter(Boolean) : [...HI_TYPES]) as HiType[]; // a request from before types were asked for allows all three
    const types = body.data.hiTypes ?? asked;
    const validity = Math.min(body.data.validityDays ?? row.validityDays, row.validityDays);
    const keep = Math.min(body.data.keepDays ?? row.keepDays ?? row.validityDays, row.keepDays ?? row.validityDays);
    if (grant && (!types.length || types.some(t => !asked.includes(t)))) return c.json({ error: 'invalid', message: 'Choose at least one of the kinds of record that were asked for. You cannot allow more than was asked.' }, 400);

    const now = new Date();
    const ws = row.workspace;
    if (!grant) {
      await db.update(simConsents).set({ status: 'denied', decidedAt: now }).where(eq(simConsents.id, row.id));
      await msg(ws, row.id, 'phr-app', 'gateway', '/v3/consent-requests/deny', 'The patient declined');
      await msg(ws, row.id, 'gateway', 'hiu', '/v3/hiu/consent/on-notify', 'The receiving hospital was told the request was declined');
    } else {
      const expiresAt = new Date(now.getTime() + validity * 86_400_000);
      const eraseAt = new Date(now.getTime() + keep * 86_400_000);
      // The sample patients' slips are dated after today, so the range ends at the later of now and the record's own last date.
      const holder = (row.patientId && await holderOf(db, baseOf(row.patientId))) || HOME_HFR;
      const lastRecord = row.patientId ? patientOf(baseOf(row.patientId))?.asOf : undefined;
      // Record dates are Indian calendar days. The range must reach the end of today in India, or a value written after midnight there is left out until the UTC date catches up.
      const endOfIndianDay = new Date(`${todayIST(now)}T23:59:59+05:30`);
      const rangeEnd = [now, endOfIndianDay, ...(lastRecord ? [new Date(lastRecord)] : [])].reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
      const art: Artefact = {
        consentId: row.id, createdAt: now.toISOString(), status: 'GRANTED', purpose: { text: 'care management', code: row.purposeCode, refUri: 'http://terminology.hl7.org/ValueSet/v3-PurposeOfUse' },
        patient: { id: row.abha }, hip: { id: holder }, hiu: { id: row.hiuHfr, name: row.hiuName }, requester: { name: row.requesterName, identifier: { type: 'REGNO', value: row.requesterReg } },
        hiTypes: types, permission: { accessMode: 'VIEW', dateRange: { from: row.dateFrom?.toISOString() ?? null, to: rangeEnd.toISOString() }, dataEraseAt: eraseAt.toISOString(), frequency: { unit: 'HOUR', value: 1, repeats: 0 } },
        consentExpiry: expiresAt.toISOString(),
      };
      const { json, signature } = sign(art);
      await db.update(simConsents).set({ status: 'granted', decidedAt: now, expiresAt, validityDays: validity, keepDays: keep, dataEraseAt: eraseAt, dateTo: rangeEnd, hiTypes: types.join(','), artefact: json, signature }).where(eq(simConsents.id, row.id));
      await msg(ws, row.id, 'phr-app', 'gateway', '/v3/consent-requests/approve', `The patient allowed ${types.length} of ${asked.length} kinds of record`);
      await db.insert(hipConsentCopies).values({ consentId: row.id, hipHfr: holder, workspace: ws, artefact: json, signature, status: 'GRANTED' }).onConflictDoNothing();
      await msg(ws, row.id, 'gateway', 'hip', '/v3/consent/hip/notify', 'The sending hospital saved its own copy of the signed consent');
      await msg(ws, row.id, 'gateway', 'hiu', '/v3/hiu/consent/on-notify', 'The receiving hospital was given the signed consent');
    }
    await db.insert(accessLog).values({ userId: c.get('user').id, role: 'patient', action: grant ? 'consent-granted' : 'consent-denied', patientId: row.patientId, outcome: 'allowed' });
    return c.json({ ok: true });
  });

  r.post('/exchange/consents/:id/revoke', requireUser('patient'), async c => {
    const row = await mine(c);
    if (!row) return c.json(NOT_FOUND, 404);
    if (effective(row) !== 'granted') return c.json({ error: 'invalid', message: 'Only an active permission can be withdrawn.' }, 409);
    await db.update(simConsents).set({ status: 'revoked', decidedAt: new Date() }).where(eq(simConsents.id, row.id));
    await db.update(hipConsentCopies).set({ status: 'REVOKED', revokedAt: new Date() }).where(eq(hipConsentCopies.consentId, row.id));
    await msg(row.workspace, row.id, 'phr-app', 'gateway', '/v3/consent/revoke', 'The patient withdrew the consent');
    await msg(row.workspace, row.id, 'gateway', 'hip', '/v3/consent/hip/notify', 'The sending hospital marked its copy as withdrawn');
    await msg(row.workspace, row.id, 'gateway', 'hiu', '/v3/hiu/consent/on-notify', 'The receiving hospital was told to erase its copy');
    await purgeReceivedCopies(db, { consentId: row.id });
    await db.insert(accessLog).values({ userId: c.get('user').id, role: 'patient', action: 'consent-revoked', patientId: row.patientId, outcome: 'allowed' });
    return c.json({ ok: true });
  });

  /* ───────── the transfer: receiver (HIU) asks, gateway checks, sender (HIP) checks again and pushes ───────── */

  r.post('/exchange/consents/:id/fetch', requireUser('doctor', 'nurse'), async c => {
    const user = c.get('user');
    const [consent] = await db.select().from(simConsents).where(eq(simConsents.id, c.req.param('id') ?? '')).limit(1);
    const allowed = !!consent && consent.workspace === user.workspace && consent.hiuHfr === user.hfrId && effective(consent) === 'granted' && !!consent.patientId && !!(await holderOf(db, baseOf(consent.patientId)));
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action: 'exchange-fetch', patientId: consent?.patientId ?? null, outcome: allowed ? 'allowed' : 'denied' });
    if (!allowed || !consent?.patientId || !consent.artefact || !consent.signature) return c.json(NOT_FOUND, 404);
    const ws = consent.workspace; const transferId = randomUUID();
    const holder = (await holderOf(db, baseOf(consent.patientId)))!;

    // 1. Receiver: a fresh key pair and nonce for this transfer; the private key stays on this side.
    const hiu = generateKeyPair();
    await db.insert(exchangeKeys).values({ id: transferId, hiuHfr: consent.hiuHfr, privateKey: hiu.privateKey, publicKey: hiu.material.dhPublicKey.keyValue, nonce: hiu.material.nonce });
    await msg(ws, transferId, 'hiu', 'gateway', '/v3/health-information/cm/request', 'The receiving hospital asked for the record, with its public key and nonce');

    // 2. Gateway: checks the signed consent before passing the request on.
    const art = verify(consent.artefact, consent.signature);
    const why = art ? refusal(art, { hiuHfr: consent.hiuHfr, hipHfr: holder }) : 'The signed consent could not be verified.';
    if (why) { await msg(ws, transferId, 'gateway', 'hiu', '/v3/health-information/cm/on-request', why, 'rejected'); return c.json({ error: 'invalid', message: 'The consent could not be verified, so nothing was sent.' }, 403); }
    await msg(ws, transferId, 'gateway', 'hip', '/v3/health-information/hip/request', 'The consent checked out and the request was passed to the sending hospital');

    // 3. Sender: checks its own saved copy (it may have been withdrawn since), keeps to what was allowed, encrypts and pushes.
    const [copy] = await db.select().from(hipConsentCopies).where(eq(hipConsentCopies.consentId, consent.id)).limit(1);
    const own = copy && copy.status === 'GRANTED' ? verify(copy.artefact, copy.signature) : null;
    const why2 = own ? refusal(own, { hiuHfr: consent.hiuHfr, hipHfr: holder }) : 'The sending hospital has no valid copy of this consent.';
    if (why2) { await msg(ws, transferId, 'hip', 'gateway', '/v3/health-information/notify', why2, 'rejected'); return c.json({ error: 'invalid', message: 'The sending hospital refused: the consent is no longer valid.' }, 403); }
    const scopeOf = { hiTypes: own!.hiTypes, from: own!.permission.dateRange.from, to: own!.permission.dateRange.to };
    const base = baseOf(consent.patientId);
    let bundle: FhirBundle;
    if (REG_ID.test(base)) { // held here only: built from the values staff recorded or confirmed
      const reg = (await registeredPatient(db, base))!;
      const rows = await db.select().from(observations).where(eq(observations.patientId, consent.patientId));
      bundle = buildRegisteredBundle({ name: reg.name, sex: reg.sex, abha: reg.abha }, rows, { hfr: holder, name: facilityName(holder) }, new Date(), scopeOf);
    } else {
      bundle = buildBundle(buildRecall(base, await opsFor(base, consent.workspace)), { hfr: holder, name: facilityName(holder) }, new Date(), scopeOf);
    }
    const sealed = seal(JSON.stringify(bundle), hiu.material);
    const checksum = createHash('sha256').update(sealed.encryptedData).digest('hex');
    await db.insert(abdmTransfers).values({ id: transferId, consentId: consent.id, hipHfr: holder, encryptedData: sealed.encryptedData, hipKeyMaterial: JSON.stringify(sealed.keyMaterial), checksum, status: 'TRANSFERRED' });
    await msg(ws, transferId, 'hip', 'hiu', '/v3/hiu/health-information/transfer', 'The sending hospital pushed the encrypted record straight to the receiving hospital, with its public key and a checksum');

    // 4. Receiver: checks the checksum, decrypts with its own private key. A changed bundle fails here and nothing is stored.
    const [t] = await db.select().from(abdmTransfers).where(eq(abdmTransfers.id, transferId));
    const [k] = await db.select().from(exchangeKeys).where(eq(exchangeKeys.id, transferId));
    let plain: string;
    try {
      if (createHash('sha256').update(t.encryptedData).digest('hex') !== t.checksum) throw new Error('checksum');
      plain = unseal({ encryptedData: t.encryptedData, keyMaterial: JSON.parse(t.hipKeyMaterial) as KeyMaterial }, k.privateKey, k.nonce);
    } catch { await msg(ws, transferId, 'hiu', 'gateway', '/v3/health-information/notify', 'The record failed its checks and was not stored', 'error'); return c.json({ error: 'invalid', message: 'The record could not be verified and was not stored.' }, 422); }
    const receivedId = randomUUID();
    await db.insert(receivedRecords).values({ id: receivedId, patientId: consent.patientId, consentId: consent.id, hiuHfr: consent.hiuHfr, workspace: consent.workspace, fromHfr: t.hipHfr, bundle: plain });

    // 5. Sender tells the gateway it is done; the gateway tells the receiver.
    await msg(ws, transferId, 'hip', 'gateway', '/v3/health-information/notify', 'The sending hospital reported the transfer as complete');
    await msg(ws, transferId, 'gateway', 'hiu', '/v3/hiu/health-information/on-notify', 'The receiving hospital was told the transfer completed');
    return c.json({ receivedId }, 201);
  });

  /* ───────── the receiving hospital reads it, read-only ───────── */

  const summary = (b: FhirBundle) => {
    const pat = b.entry.find(e => e.resource.resourceType === 'Patient')?.resource as { name?: { text: string }[] } | undefined;
    return { patientName: pat?.name?.[0]?.text ?? '', observations: b.entry.filter(e => e.resource.resourceType === 'Observation').length };
  };

  r.get('/exchange/received', requireUser('doctor', 'nurse'), async c => {
    const me = c.get('user'); const hfr = me.hfrId ?? '';
    await purgeReceivedCopies(db, { workspace: me.workspace, hiuHfr: hfr });
    const rows = await db.select().from(receivedRecords).where(and(eq(receivedRecords.hiuHfr, hfr), eq(receivedRecords.workspace, me.workspace))).orderBy(desc(receivedRecords.receivedAt));
    const notes = rows.length ? await db.select().from(recordAnnotations).where(inArray(recordAnnotations.receivedId, rows.map(x => x.id))) : [];
    return c.json({
      items: rows.map(x => ({ id: x.id, fromName: facilityName(x.fromHfr), receivedAt: x.receivedAt.toISOString(), annotations: notes.filter(n => n.receivedId === x.id).length, ...summary(JSON.parse(x.bundle) as FhirBundle) } satisfies ReceivedRecordItem)),
    });
  });

  async function receivedFor(c: Parameters<typeof open>[0], action: string) {
    const user = c.get('user');
    await purgeReceivedCopies(db, { workspace: user.workspace, hiuHfr: user.hfrId ?? '-' });
    const [row] = await db.select().from(receivedRecords).where(eq(receivedRecords.id, c.req.param('id') ?? '')).limit(1);
    const ok = !!row && row.hiuHfr === user.hfrId && row.workspace === user.workspace;
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
      allowed: { hiTypes: consent?.hiTypes.split(',').filter(Boolean) ?? [], dateFrom: consent?.dateFrom?.toISOString().slice(0, 10) ?? null, dateTo: consent?.dateTo?.toISOString().slice(0, 10) ?? null, purposeCode: consent?.purposeCode ?? '', dataEraseAt: consent?.dataEraseAt?.toISOString() ?? null },
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
    if (REG_ID.test(pid.data) && !(await registeredPatient(db, pid.data))?.consentPurposes.split(',').includes('share-abdm')) {
      return c.json({ error: 'invalid', message: 'This patient has not agreed to share their records through ABDM, so nothing can be pushed.' }, 409);
    }
    const [d] = await db.select().from(documents).where(and(eq(documents.id, c.req.param('docId') ?? ''), eq(documents.patientId, scope(pid.data, c.get('user').workspace)))).limit(1);
    if (!d) return c.json(NOT_FOUND, 404);
    if (d.syncStatus === 'pushed') return c.json({ error: 'invalid', message: 'This document has already been pushed.' }, 409);
    if (d.status !== 'done') return c.json({ error: 'invalid', message: 'This document has not been read yet.' }, 409);
    const waiting = await db.select({ id: observations.id }).from(observations).where(and(eq(observations.documentId, d.id), eq(observations.status, 'extracted')));
    if (waiting.length) return c.json({ error: 'invalid', message: `Review the ${waiting.length} value${waiting.length === 1 ? '' : 's'} read from this document first. Nothing unreviewed is pushed.` }, 409);
    await db.insert(simCareContexts).values({ id: randomUUID(), patientId: scope(pid.data, c.get('user').workspace), hipHfr: HOME_HFR, documentId: d.id, display: `${d.docType}, ${d.fileName}` });
    await db.update(documents).set({ syncStatus: 'pushed' }).where(eq(documents.id, d.id));
    return c.json({ ok: true });
  });

  return r;
}
