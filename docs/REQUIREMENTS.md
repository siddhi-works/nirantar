# Requirements from the workflow notes, and where each stands

Source: the handwritten "Final Workflow of Nirantar" and its typed transcription. Status is what the running system does today.
**Rule followed throughout: nothing is made up.** Where the record has no data, the screen says "unavailable" or "needs input".

| # | Requirement | Status | Where / how |
|---|---|---|---|
| B1 | ABDM stack for storage; keep the patient's record on our private stack until it is pushed | Done (ABDM itself is a stand-in) | Uploaded documents stay "pending, not yet shared" until reviewed and pushed. A push needs every value reviewed and, for a registered patient, their consent to share (`routes/exchange.ts`) |
| B2 | Doctor login by HPR (14-digit number, `username@hpr.abdm`; Aadhaar + council licence) | Partly | The HPR number signs a doctor in. The `@hpr.abdm` address and the Aadhaar and licence onboarding are not modelled. Real HPR login and an OTP are future scope |
| B3 | Patient login by ABHA (Aadhaar onboarding) | Done for sign-in and registration | ABHA number signs a patient in, including patients registered on the site. Registration verifies the patient by a code to their mobile and matches the ABHA profile. Aadhaar itself is not used |
| B4 | OCR / digitisation of past EMR | Partly | Text PDFs and scans/photos (Sarvam) are read for sugar, lipids, kidney, BP, weight and a few more values. Medicines and diagnoses on an upload are **not** read yet |
| B5 | Multi-lingual | Done for English and Hindi | Every screen switches; fixed wording is a dictionary, record text is translated by Sarvam and cached. Needs review by a native speaker |
| B6 | Voice-assisted / talk-back for the specially abled | Partly | "Listen" reads the patient's page, the summary and answers aloud; the pages pass an automated WCAG A/AA scan. Full screen-reader walkthrough still to do |
| B7 | Queue and waiting-time prediction, time slots | Done | OPD queue with tokens. The wait comes from measured consultation times, or from a figure staff enter. With neither, it says "unavailable" |
| D1 | Working OCR scanner | Done | Camera or file upload, read by Sarvam |
| D2 | Summary in sentences, under 100 words (50 to 80 preferred) | Done | Written from the record only; 70 to 78 words for both sample patients; absent facts are stated as absent |
| D3 | Complications below the name, with time since first diagnosed in brackets | Done | Patient header |
| D4 | Citation editable by the doctor or nurse after seeing the original | Done | "Correct value": the original stays on record |
| D5 | Menu bar (≡) for upcoming patients and HIS items | Done | Upcoming patients, registered patients, network activity |
| D6 | Examination logs: foot/ulcer, neuropathy, CKD (KFT), retinopathy | Done | "Checks" card, with the report each value came from |
| D7 | Comorbidities: hypertension, LFT/KFT, OSA/obesity | Done | "Checks" card; each shows "not on record" until entered |
| D8 | Lifestyle advice | Done | Doctor adds advice; it shows on the patient's and nurse's screens |
| P1 | Past prescription and OCR staging; patient can edit a bit; stays pending until pushed | Partly | Upload, staging and review work. The patient cannot yet edit what was read before staff review; they can ask for a correction |
| P2 | Non-editable EMR; the patient can raise an edit request | Done | "Ask for a correction"; staff look at the original and answer with a reason; nothing changes by request alone |
| P3 | Diet and lifestyle counselling as per the doctor's advice | Partly | Built from the doctor's written advice, each with plain general explanation. Not AI-written: it never adds an instruction. Clinicians must review the wording |
| P4 | OPD time and rush management | Done | Token, place in line, expected time, rush level |
| N1 | Number of appointments, ongoing, done | Done | Counters on the queue card |
| N2 | Lifestyle advice emphasis | Done | Counselling card on the nurse's patient page |
| N3 | Patient education by ANM/GNM | Done | Topic checklist: who explained what, and when |

Not covered by the notes but built because a real product needs it: three-step verified registration with consent, patient rights
(export, withdraw sharing, erase), a signed consent artefact with record types and an erase date, ABDM-style encryption, erasure
of the receiving hospital's copy on withdrawal, a message log, and a record-only Q&A for the patient.
