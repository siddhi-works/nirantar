# Deploying Nirantar

Neon holds the database, Vercel runs the website and the API. About 20 minutes the first time.

## Before you start
- Make the GitHub repository **private** (Settings, Danger Zone, Change visibility). It holds the synthetic patient workbook and PDFs.
- You need free accounts on Neon (neon.com) and Vercel (vercel.com), signed in with GitHub.

## 1. Create the database (Neon)
1. New project. Name it `nirantar`. For the region, pick the **closest to India that the list offers**. I could not confirm that Neon has a Mumbai region. If it is not listed, use **AWS Asia Pacific 1 (Singapore)**.
   - **This data will not be in India** unless Mumbai is listed. That is fine while everything is synthetic. It is not acceptable for real patient records, which need an Indian region and a security review first.
2. On the project dashboard choose **Connect** and copy the connection string. It looks like `postgresql://user:password@ep-something.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

## 2. Create the tables (once, from your PC)
In Command Prompt, in the project folder. Keep the quotes around the connection string: it contains `&` and `?`, which Command Prompt would otherwise treat as commands.

```
set "DATABASE_URL=paste-the-connection-string-here"
npm install
npm run db:setup
```

Success prints: `Database ready: 5 users, 2 patients, 2 consents.` It is safe to run again. Run it again after any release that adds a database migration, **before** deploying that release.

## 3. Create the website (Vercel)
1. Add New, Project, import the repository. Vercel detects Vite; `vercel.json` sets the build.
2. Before the first deploy, open **Environment Variables** and add these for both Production and Preview:

| Name | Value |
|---|---|
| `DATABASE_URL` | the same Neon connection string |
| `ALLOW_DEV_OTP` | `true` |
| `DEV_OTP` | `482915` |
| `SARVAM_API_KEY` | your Sarvam key (optional; scans, translation and speech need it) |
| `VITE_FEEDBACK_URL` | link to your survey form (optional). It is read when the site is built, so redeploy after changing it |

`ALLOW_DEV_OTP=true` is required: the API refuses to start in production with the fixed sign-in code unless you set it on purpose. Use it only while the data is synthetic.

3. Deploy.

Keep the API next to the database. `vercel.json` sets the function region to `sin1` (Singapore), which matches a Singapore database. If you chose a Mumbai database, change `sin1` to `bom1`. A function in the wrong region adds a round trip to every query, which makes pages several times slower. If Vercel rejects the region for your plan, remove the `regions` lines and pick the region in Project Settings, Functions.

## 4. Keep the site public for judges and testers
Judges and testers open the link on their own and cannot sign in to your Vercel account, so **do not turn on Vercel Authentication, password protection or any other deployment protection for the production domain**.

- **Submit the production address**, which looks like `your-project.vercel.app`. Do not submit an address such as `your-project-abc123-yourteam.vercel.app`: those per-deployment addresses are protected for your team by default and a judge would hit a Vercel sign-in page.
- **Check it the way a judge will.** Open the address in a private window where you are not signed in to Vercel. You should land straight on the Nirantar sign-in page.
- **Why a public site is acceptable here:** all the data is synthetic. The sign-in code is the same for everyone and is shown on the page. Each browser gets its own private sample space, so people testing at the same time never see each other's changes. Limits protect the free services: 8 uploads per patient and 24 MB per tester, per-person and site-wide caps on the language service, and idle sample spaces are cleared after 14 days.
- **Take it down or add protection after the event** if you keep it running.

## Testing with many people
- Each browser has its own sample space. A doctor testing on a phone and a laptop gets two. "Start with fresh sample data" in the top bar moves that browser to a new empty space and affects nobody else.
- The two sample patients and their slips are the same for everyone. What testers add (uploads, corrections, confirmations, consent choices) is theirs alone.
- Put your survey link in `VITE_FEEDBACK_URL` so a "Give feedback" button appears on the sign-in page and in the top bar. The app records no analytics and no answers: the survey lives wherever your form is.
- Testers may not know that a first visit after a quiet spell is slow, because the free database sleeps. The page shows a start-up message and retries once, so tell them to wait a few seconds.
- Watch the Neon dashboard for storage and compute use during the test.

## 5. Check it works
1. Open `https://YOUR-PROJECT.vercel.app/api/health`. You should see `{"ok":true,"auth":"dev","db":"ready"}`.
2. Open the site in a private window. Follow the "two-minute tour" on the sign-in page: look up a patient, open a source, upload the sample prescription, then run the consent flow as the patient and as the other hospital's doctor.

| What you see | Meaning and fix |
|---|---|
| `/api/health` says `"db":"not set up"` (503) | The tables are missing or the URL differs from step 2. Run `npm run db:setup` with the exact `DATABASE_URL` set in Vercel. |
| `/api/health` says `{"error":"server_error"}` | Open Vercel, Logs. A missing `DATABASE_URL` or `ALLOW_DEV_OTP` is the usual cause. |
| `/api/health` is a 404 | The function did not deploy. Check the build log and that `api/[...path].ts` is in the repository. |
| Sign-in works but every action says "forbidden" | The page and the API are on different addresses. Use the Vercel address, not a custom domain you have not added to the project. |
| Scans fail with "reading service" | `SARVAM_API_KEY` is not set, or the adapter needs the live check below. |

## 6. Check the Sarvam adapters (needs your key)
```
set "SARVAM_API_KEY=your-key"
npm run sarvam:check -- server/assets/originals/patient-1-followups.pdf
npm run sarvam:check -- translate "Your blood sugar is under control."
npm run sarvam:check -- speak "Your blood sugar is under control."
```
These adapters were written without access to Sarvam's documentation. If any step prints something unexpected, send me the output.

## What to know about the free plans
- **Vercel Hobby is for non-commercial, personal use only.** A judging demo of a prototype is within that. Anything commercial, or a real organisation serving real users, needs the Pro plan. If unsure, ask Vercel support.
- **Neon's free plan has storage and compute limits** and its database sleeps after about 5 minutes without use, so the first request after a quiet spell is slow. Open the site a few minutes before you present. Check the current limits in the Neon console, because Neon's own pages disagree on them (0.5 or 1 GB; 50 or 100 compute hours).
- **Sarvam:** read its terms and data-retention policy before sending any real record to it. The prototype sends only synthetic text.
- **Synthetic data only.** None of this is a basis for holding real patient data.

## Updating later
Pushing to `main` deploys automatically. If the release adds a migration, run `npm run db:setup` against Neon first.
