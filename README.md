# Nirantar

One evidence-linked diabetes record for the doctor, the nurse and the patient. Every value points at the slip or document it came from, and what is not on record is shown as missing.

All names, ABHA numbers and values in the repository are synthetic.

## For judges and testers

- **Live site:** paste the production address here (the `your-project.vercel.app` form) before you submit.
- **Start with the tour.** The sign-in page has a two-minute tour: look up a patient, see where a value came from, upload the sample prescription, then run the consent flow between two hospitals. The sign-in details are filled in already.
- **Your changes are private.** Each browser gets its own sample space, so people testing at the same time never see each other's uploads or corrections. "Start with fresh sample data" in the top bar clears yours. Idle spaces are removed after 14 days.
- **What is real and what is simulated** is listed below. The ABDM network is simulated and labelled as such on every screen.
- **The code** is this repository, and `DEPLOY.md` explains how it was deployed.

## Run it

```bash
npm install
npm run dev        # web on http://localhost:5173, API on http://localhost:8787
npm run test       # 130 tests
npm run typecheck
```

Local development needs no database and no keys: it uses an embedded Postgres (a folder, `.data/`) and a fixed sign-in code. Sign-in details are pre-filled on the login screen. Hospital B (Patna Medical College & Hospital, Patna) is the "Sign in as a doctor at another hospital" link.

## What it does

| Area | Behaviour |
|---|---|
| Sign-in | Doctor and nurse (HPR + HFR + code), patient (ABHA + code). Server-side sessions, revocable, rate limited. |
| Access | Role and consent are checked on every request. A missing patient and a missing consent look identical. Every read is written to an access log. |
| Record | Trends, medicines, visit history, a checks list (what is on record and what is not), examination and comorbidity logs, complications line. |
| Recording | Nurses and doctors type in vitals and results; they count at once and show who entered them. |
| Corrections | A value read from a slip can be corrected with a reason. The slip and the first value stay visible. |
| Upload | PDF, JPG or PNG up to 4 MB, stored privately. A PDF's own text is read for free; scans and photos go to the document reader. |
| Review | Everything read from a document starts as pending. It counts only after a doctor or nurse confirms it, corrects it or rejects it. |
| Patients | Can upload old documents and fix what was misread. Their values stay pending until staff confirm them. |
| Record exchange | Simulated ABDM: a second hospital asks the patient, the patient allows or declines, the record travels as an encrypted FHIR bundle and arrives read-only. |
| Charts | Slip readings form the line. Values recorded in the app, or confirmed from an uploaded document, appear beside it as diamonds with their source. |
| Accessibility | Dialogs trap focus and close on Esc; an automated scan (axe) finds no serious issues on the main screens; no page overflows on a phone. |
| Security headers | `vercel.json` sets a content security policy (no outside scripts, no framing), checked against a production build with `vite preview`. |
| Languages | English and Hindi on the patient screens and sign-in. Record text is translated by the language service when connected. Read-aloud uses the service, or the browser's own voice. |

## What is real and what is simulated

- **Real:** sessions, roles, consent checks, the access log, storage, corrections, review, the encryption (X25519, HKDF, AES-256-GCM), the FHIR bundle.
- **Simulated:** the ABDM gateway and consent manager, the one-time code (a fixed code), and ABHA/HPR verification. Every screen carries a "not connected to the live ABDM network" label.
- **Written against the public description, not the live API:** the Sarvam adapters (`server/ocr/sarvam.ts`, `server/language/sarvam.ts`). Run the live check with your key and fix `CONTRACT` in those files if anything differs:

```bash
SARVAM_API_KEY=... npm run sarvam:check -- path/to/scan.pdf
SARVAM_API_KEY=... npm run sarvam:check -- translate "Your blood sugar is under control."
SARVAM_API_KEY=... npm run sarvam:check -- speak "Your blood sugar is under control."
```

## Deploying

See `DEPLOY.md` for the Neon and Vercel steps.

## Configuration

See `.env.example`. Sign-in needs no one-time code by default (sample data only). Set `REQUIRE_OTP=true` (plus `ALLOW_DEV_OTP=true` in production) to ask for the fixed code again.

## Layout

```
src/            React app (screens, i18n, shared types and plausibility ranges in src/domain)
server/         API: routes, auth, database schema and migrations, extraction, OCR and language adapters, ABDM simulator
server/core/    The record engine (trends, checks, summary) and the source data for the two patients
api/index.ts    Vercel function entry
```

## Known limits

- The two patients' record content comes from `server/core/data/his.json`; values recorded in the app are in the database next to it. The trend line uses the follow-up slips; recorded values are drawn beside it, not joined to it.
- Files are stored in Postgres as base64 and capped at 4 MB. Move to object storage behind `FileStore` for larger files.
- The one-time code is fixed and consent for hospital staff is granted automatically in the dev setup.
- Hindi text has not been reviewed by a native speaker or a medical translator.
- FHIR bundles follow the usual shape but have not been validated against the NHA profiles.
- Real ABDM access (sandbox registration, milestone tests, security audit) is not part of this code.

## Architecture and compliance

See [docs/ARCHITECTURE-AND-COMPLIANCE.md](docs/ARCHITECTURE-AND-COMPLIANCE.md): which connections are real and which stand in for ABDM, the controls in the code, and what a real deployment still needs.
