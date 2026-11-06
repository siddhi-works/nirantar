# Nirantar: architecture, connections and compliance

This describes what the product does today, which parts are real and which stand in for ABDM, and what a real hospital
deployment still needs. It is an engineering document, **not legal advice**. Laws and ABDM policies change: have counsel
and the ABDM sandbox team confirm each point before any real patient data is handled. This site holds **synthetic data only**.

## 1. The parties and the connections

| Connection | Today | How it works in a real deployment |
|---|---|---|
| Browser ↔ our API | Real. HTTPS, HttpOnly + Secure + SameSite cookies, server-side sessions (hashed), CSRF check (origin + JSON), rate limits | Same, plus a real identity provider (ABDM login / hospital SSO) |
| API ↔ database | Real. Postgres on Neon over HTTPS, Drizzle migrations, parameterised queries | Same. Use a region and contract that satisfy the data-location rules that apply to you |
| API ↔ Sarvam (reading scans, Hindi, voice, Q&A) | Real. Sarvam's published REST API, key held only in server environment variables | Same. Review what is sent: a scanned slip leaves our system when it is read by an outside service |
| Staff identity (HPR / HFR) | Stand-in. The sandbox knows the sample doctors and nurses; no code is asked | ABDM's HPR/HFR registries, and a login for each person |
| Patient identity (ABHA) | Stand-in registry in `server/sim/abha.ts`, with the same rules a hospital uses against ABDM: a code to the mobile held on the ABHA profile, fuzzy name, age within 2 years, exact sex | ABDM's ABHA verification APIs (mobile / Aadhaar OTP) |
| Consent (who may see a record) | Stand-in consent manager. The request names the kinds of record, a start date and how long the receiver will keep its copy; the patient may allow less; the grant is a signed artefact (purpose code, record types, date range, erase-by date, expiry). The sending hospital saves its own copy and checks it before releasing anything | ABDM's consent manager issues the same kind of artefact, signed by the gateway |
| Record transfer between hospitals | Real cryptography, stand-in network: FHIR R4 bundle limited to what was allowed, Curve25519 key agreement with each side's nonce, salt and IV derived from the nonces, HKDF-SHA256, AES-256-GCM, a checksum, read-only copy at the receiver, erased when consent is withdrawn or the erase date passes. Every hop is written to a message log. Written from ABDM's published guidelines; not yet tested against ABDM's reference tool | The same bundle and encryption, moved over HTTPS through the ABDM gateway to the receiver's data-push URL, with callbacks between the parties |
| OTP to a mobile | Shown on screen in the sandbox, clearly labelled | An SMS through a registered gateway |

Everything marked "stand-in" is in one place (`server/sim/`, `server/routes/exchange.ts`, `server/routes/registration.ts`)
so that it can be replaced by the real ABDM call without changing the screens.

## 2. Controls that exist in the code

| Need | Control | Where |
|---|---|---|
| Consent before data is collected | A patient cannot be registered until they agree to a record being made and linked to their ABHA. Sharing through ABDM is a separate, optional consent. The wording version, how it was taken and when are stored | `routes/registration.ts` |
| Consent can be withdrawn | Sharing consent can be withdrawn at any time and the push is blocked at once. Every grant and withdrawal is kept in an append-only history | `routes/registration.ts`, `consent_events` |
| Right to a copy | One-click export of everything held about a patient | `GET /patients/:id/export` |
| Right to erasure | Erases the patient, values, documents and file contents. Only a tombstone with no personal details stays in the access log | `POST /patients/:id/erase` |
| Identity before records | Code sent to the patient's mobile (hashed, 15 minutes, 3 tries), then consent, then the record. Nothing is saved earlier | `routes/registration.ts` |
| No wrong-person records | A document naming another person or another ABHA number is never added; values from uploads count only after a person confirms them, and every correction keeps the original | `identity.ts`, `documents.ts`, `observations.ts` |
| Who saw what | Every open, upload, push, export and erasure is written to the access log before the answer is sent; if the log cannot be written the request fails closed | `ctx.ts` (`open`) |
| Least privilege | Doctors and nurses see only patients at their own hospital; a patient sees only their own record; another hospital sees a record only after the patient allows it, and gets a read-only copy | `ctx.ts`, `routes/exchange.ts` |
| Data minimisation in logs | Errors are logged by kind only; patient values and questions are never written to logs | `log.ts` |
| Retention | Idle sample spaces and expired codes are deleted daily | `routes/maintenance.ts` |
| Assistant safety | The patient Q&A answers only from the patient's own record, names its sources, refuses advice, and every model reply is checked against the record before it is shown | `assistant/` |

## 3. What a real deployment still needs

These are not things code alone can provide.

1. **ABDM onboarding.** Register the facility on the HFR, get sandbox credentials, build and certify the milestones for ABHA
   verification (M1), linking and sharing records as a provider (M2) and requesting them as a user (M3), then go through ABDM's
   certification before production.
2. **A real OTP channel** (a registered SMS provider) and real staff login (HPR-backed), in place of the sandbox shortcuts.
3. **Data location and processors.** Decide where health data may be stored and which outside services may see it (database,
   file store, Sarvam). Sign the processor agreements. Prefer an India region for real records.
4. **Encryption and keys.** Provider encryption at rest is not enough for health records: add application-level encryption of
   files and sensitive fields, with managed keys and rotation.
5. **The organisation's duties under the data-protection law** (privacy notice in plain language, a named grievance contact,
   a process for breach reporting within the legal time, handling a child's or guardian's consent, retention schedules).
   Note that medical-records retention rules can conflict with erasure: the retention period for clinical records must be
   settled with counsel, and the erase function adjusted to it.
6. **Security assurance.** Independent penetration test, dependency and secret scanning in the build, backups and a tested
   recovery plan, administrator roles with separate review, tamper-evident (append-only, off-site) audit logs.
7. **Clinical safety.** Clinical review of every message the patient sees, of the Hindi wording, and of the limits of the
   Q&A assistant, by qualified clinicians. Nothing here replaces a doctor.

## 4. How to use this site honestly

Say it is a sandbox that follows the same steps as ABDM, with stand-ins where ABDM is not available to us, and synthetic data.
Do not describe it as ABDM-certified or compliant with any law: it has the technical controls above, and the organisational
and legal parts in section 3 are still to do.

## Scale: one lakh (100,000) and more registered patients

What was done and measured, and what was not.

**Measured.** `server/scale.test.ts` inserts 100,000 registered patients into one hospital space and calls the real routes. On the in-memory test database (single process, no network) it took: first page of the directory 50 ms, a page at offset 99,000 209 ms, name search 179 ms, ABHA search 167 ms, the hospital's own list 85 ms. These prove the queries are paged and counted by the database. They are not production latency numbers. Re-run the test against a Neon branch with the same rows before quoting speeds.

**Changes for scale.**
- The patient directory and the hospital's registered list are searched, counted and paged in SQL (`limit`/`offset`, at most 50 and 100 per page). Nothing loads every patient into the server or the browser.
- Indexes: `registered_workspace_hfr` (workspace, hospital, created), `registered_workspace_name` (workspace, name), `sim_consents_hiu_abha` (workspace, requester, ABHA), with the existing unique (workspace, ABHA). Migration `0010_directory_indexes`.
- Consent lookups are now limited to the ABHA numbers on the page instead of every request the hospital ever made.
- The cap of 25 registered patients per sandbox space is a sandbox setting. A hospital deployment sets `MAX_REGISTERED_PER_SPACE` to a high number, or `0` for no cap.

**Not done, and where it will hurt first.**
- Name search uses `lower(name) LIKE '%…%'`. That scans one hospital's rows. It is fine at 100,000 rows and slow at several million; the fix is a trigram index or a search service.
- Uploaded files are stored as rows in Postgres (`file_blobs`). At scale they belong in object storage with the database keeping only the reference.
- The access log and the gateway message log grow without bound in a hospital space. They need partitioning by month and a retention job. The daily clean-up only trims the sandbox's own tables.
- A patient's own record (values, documents, visits) is loaded whole when opened. A patient with thousands of values needs paging there too.
- Neon's free tier, the serverless function limits and the per-IP rate limits are sandbox settings, not capacity planning. No load test has been run through the deployed site.
