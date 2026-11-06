# Nirantar frontend kit

This is the user interface of Nirantar, a diabetes record for doctors, nurses and patients. You can change how it looks and how it is laid out, and test it on your own computer against the live service. You do not get, and do not need, the server code.

## Set up once

1. Install Node.js 20 or newer from nodejs.org.
2. In this folder run:

```bash
npm install
```

## Run it and test your changes

```bash
npm run dev
```

Open http://localhost:5173. The page reloads as you save. The app uses the live Nirantar service, so everything works: sign in, upload a report, request access.

Sample sign-ins on the first screen:
- **Medical practitioner**: choose a name from the list (Dr. Swati Mani, Dr. Pratayaksha at the other hospital, or Sr. Kavita Mishra).
- **Patient**: choose a sample patient, or type `91-2612-3348-1056` or `14-7004-8821-5590`.

Your uploads and changes are private to your browser, so you cannot disturb anyone else's testing. The profile menu (top right) has "Start with fresh sample data".

Before you send anything, run both checks and fix what they report:

```bash
npm run typecheck
npm test
npm run build
```

`npm test` fails if you add visible English text without its Hindi entry in `src/i18n/hi-more.ts`. Add the Hindi, or ask the owner for it.

## What you may change

| Folder | Change it? |
|---|---|
| `src/pages`, `src/ui` | yes: layout, wording, components |
| `src/styles` | yes: colours, spacing, fonts. Design tokens are in `tokens.css`; read `DESIGN-SYSTEM.md` first |
| `src/i18n` | yes: add Hindi for any new text |
| `public/img` | yes: replace pictures, same file names, 4:3, under 150 KB each |
| `src/api`, `src/domain`, `src/session.ts` | **no**: these are the contract with the service. If you need something here, tell the owner what you need and why |
| `vite.config.ts`, `package.json`, `tsconfig.json` | no |

## Rules that keep the product honest

1. **Every number on screen shows where it came from**: a source chip that opens the report, or a plain line saying who entered it. Never show a number without one.
2. **Nothing made up looks real.** Anything invented or unbuilt carries a "Demo only" or "Future scope" note (`src/ui/ScopeNote.tsx`). Do not invent patient values, ever.
3. **Two screens only**: sign-in, and the workspace with its two views. Do not add pages or tabs.
4. Keep it usable: buttons at least 40px tall, visible keyboard focus, text contrast at least 4.5:1, and nothing that only works with a mouse.
5. Do not add new libraries. If you need one, ask.

## Send your work back

```bash
npm run pack
```

This writes `nirantar-frontend-changes-<date>.zip` with your `src` and `public` folders. Send that zip to the owner. They will review and merge it. Do not send `node_modules`.
