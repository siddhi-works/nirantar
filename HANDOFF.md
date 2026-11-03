# Nirantar — handoff for a new session

## What this is
Frontend-only demo of **Nirantar**, an evidence-linked diabetes record. It is shown in a demo video, so it only has to look and behave right on screen. No backend is built yet.

Folder: `D:\diabetes project`. Run: `npm install` once, then `npm run dev`, open http://localhost:5173. Build: `npm run build`. Tests: `npm run test` (48 tests). Typecheck: `npx tsc --noEmit -p .`

## What the user asked for (final direction — follow this, not the earlier broad design)
- Login with three roles: **Doctor** and **Nurse** (HPR ID + HFR facility ID + OTP), **Patient** (14-digit ABHA + OTP). All details prefilled.
- Doctor/nurse home is simple: schedule, notifications, and ONE "Open a patient's record" panel (name + ABHA). The patient's data is fetched only when their ABHA is entered; no patient is listed anywhere on the dashboard. "Exit to dashboard" returns.
- Doctor view: trends (HbA1c/FBS/PPBS), medicines, visit history, a Checks list (what is on record and what is not, each with its source report), View original document, Upload document.
- Nurse view: vitals form (BP, weight, height, pulse), Checks list, last-visit summary, View original document, Upload document.
- Patient view: plain-language page for their own record.
- **No diagnostic solutions or advice.** Only trends, sources/reports, checks, and what is missing vs present.
- **No unnecessary features** (no audit trail, protocols, queues, organ map, command palette). Keep it minimal and operational.
- Schedules have **no status labels** (no waiting/upcoming/in consultation). Doctor day: ward round, huddle, OPD, check-ups, lunch, tele-consults, CME conference, teaching round.
- Indian mock names, not "Dummy". Upload document types are diabetes-care only.
- When writing tables or summaries for the user, **do not use the words "mock" or "demo"** (the user was irritated by this). The code still contains them in names.

## The two patients (from `data/source/ABHA_Two_Patient_HIS.xlsx`)
| UI name | Sheet name | Age, place | ABHA (dummy, written into the sheet) |
|---|---|---|---|
| Mr. Rajesh Kumar Singh | Mr. Dummy 1 | 50/M, Patna | 91-2612-3348-1056 |
| Mrs. Savitri Devi Pandey | Mrs. Dummy 2 | 70/F, Gorakhpur | 14-7004-8821-5590 |

Doctors: Dr. Arvind Sinha (P1), Dr. Meenakshi Srivastava (P2, also the logged-in doctor). Names are swapped at load time by a string map in `src/server-mock/parse.ts`. The original PDFs (`public/docs/patient-1-followups.pdf`, `patient-2-followups.pdf`, one page per visit) still show "Dummy" names — they are untouched originals.

Key facts in the data (do not invent beyond these): P1 HbA1c 6.5→5.9, FBS 124→106, PPBS 178→142, metformin only. P2 HbA1c first written at visit 3 (6.8→6.5), FBS 158→116, PPBS 205→158, metformin + insulin glargine 10 U, urine protein positive at visit 3 with repeat asked at visits 3, 4, 5 and never recorded. Not on record for either: BP, lipids, eGFR/uACR, eye, foot, liver, next review date.

## Code map
- `src/App.tsx` — switches screens from state (no router).
- `src/session.ts` — Zustand: login user, open patient, vitals, uploads (all lost on refresh).
- `src/pages/` — `Login`, `Homes` (doctor/nurse home), `DoctorPatient`, `NursePatient`, `PatientHome`, `Checks` (on/not on record list), `Chrome` (top bar, lookup, schedule, notifications), `UploadDocument` (dialog).
- `src/data/demo.ts` — schedules, notifications, login details (made-up content).
- `src/api/` — the one interface screens call. Backend swap point.
- `src/server-mock/` — parse (workbook text → cited values), engine (trends, changes, checks), service, db. Real data comes from `his.json` produced by `scripts/extract_his.py`.
- `src/ui/` — charts (hand-built SVG), slip viewer, source panel (`CitationPanel`), primitives.
- `src/domain/` — shared types, formatting, `originals.ts` (PDF links).
- `vercel.json`, `.gitignore` — Vercel-ready static deploy. Not yet deployed or verified live.
- `tech-stack.png` / `tech-stack.py` — the tech-stack table image.

## Backend plan (agreed in principle, not started)
Node + TypeScript API, Postgres, S3-compatible storage, OTP login with roles, a queue for document reading, ABDM later. Step 1: make the API serve the two existing patients and point `src/api/index.ts` at it. The user has not yet said to start.

## Known problems — be honest about these
1. **Patient data and both PDFs ship in the public build.** On Vercel anyone with the link can read them and fetch `/docs/*.pdf`. Fine for synthetic data, not for real data.
2. **The login is fake.** Doctor/nurse fields are never validated; any button press logs in. Patient login only checks the ABHA exists, and a wrong ABHA reveals whether a record exists.
3. **State is lost on refresh** (vitals, uploads, login). Uploads are only names in a list; files are not stored.
4. **Dead code.** The old broad design left unused code: `react-router-dom` dependency, task/audit/AI-acceptance logic in `server-mock/service.ts` and `db.ts`, `features.css` classes, and tests that cover removed behaviour. `src/server-mock/db.ts` also persists to localStorage under `nirantar-mock-v1`.
5. **Dates look odd.** Patient records are dated 2000–2001 and 2026–2027 while the dashboard shows today's date.
6. **Source panel still has a "Confirm value" button** and verification chips, and a footer line "Rule evaluation is deterministic — Doctor view" — leftovers from the earlier design, possibly out of scope.
7. **Target bands and severity** still exist in the engine/charts. The user said no diagnostic solutions; the bands are reference lines only, but ask whether to remove them.
8. **UI names differ from PDF names** (UI shows Indian names, PDFs show "Dummy"). Could confuse a viewer opening the original.
9. Never run `tsc`/build without checking — TypeScript here is v7 (native); `baseUrl` is not allowed, aliases use `paths` with `./src/*`.

## Open questions for the user
- Start the backend (step 1), or polish the demo first?
- Remove the target bands and the "Confirm value" flow to match "no diagnostic solutions"?
- Rename `server-mock` / `demo.ts` in the code? (A rename was attempted and rejected; nothing was changed.)
- Push to which GitHub repo; make it private (it contains the workbook and PDFs)?

## Tool notes
- Dev server preview worked via `.claude/launch.json` (name `nirantar`, port 5173). Browser screenshots crop on the right when a custom viewport is set; verify layout with JS (`getBoundingClientRect`) rather than trusting the crop.
- Long Python patch scripts failed inside bash heredocs; write them to a file and run that instead.
