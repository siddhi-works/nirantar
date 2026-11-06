# Deploying Nirantar

Neon holds the database, Vercel runs the website and the API. About 20 minutes the first time.

## Before you start
- Make the GitHub repository **private** (Settings, Danger Zone, Change visibility). It holds the synthetic patient workbook and PDFs.
- You need free accounts on Neon (neon.com) and Vercel (vercel.com), signed in with GitHub.

## 1. Create the database (Neon)
1. New project. Name it `nirantar`. Region: **AWS Asia Pacific 1 (Mumbai)**, so the data stays in India.
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

`ALLOW_DEV_OTP=true` is required: the API refuses to start in production with the fixed sign-in code unless you set it on purpose. Use it only while the data is synthetic.

3. Deploy.

If Vercel rejects the `bom1` function region for your plan, delete the `regions` line in `vercel.json`, or pick the region in Project Settings, Functions.

## 4. Protect the site
The sign-in code is the same for everyone and is visible in the page, so anyone with the link can sign in. In Project Settings, **Deployment Protection**, turn on **Vercel Authentication** so only people signed in to your Vercel team can open it. If judges need access without a Vercel login, use a password (paid plans) or send them a protection-bypass link instead, and take the site down after the event.

## 5. Check it works
1. Open `https://YOUR-PROJECT.vercel.app/api/health`. You should see `{"ok":true,"auth":"dev","db":"ready"}`.
2. Open the site, sign in as a doctor (details are pre-filled), look up the patient, open a source, upload `server/assets/originals/patient-1-followups.pdf`.
3. Sign in as the other hospital's doctor (link on the sign-in page) and run the consent flow.

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

## Updating later
Pushing to `main` deploys automatically. If the release adds a migration, run `npm run db:setup` against Neon first.
