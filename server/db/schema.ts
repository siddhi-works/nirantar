import { boolean, doublePrecision, index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** People who can sign in. Doctors and nurses carry HPR + HFR ids, patients carry an ABHA number (digits only). */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  role: text('role').notNull(), // doctor | nurse | patient
  name: text('name').notNull(),
  line: text('line').notNull(),
  hprId: text('hpr_id'),
  hfrId: text('hfr_id'),
  abha: text('abha'),
  patientId: text('patient_id'),
}, t => [
  uniqueIndex('users_hpr_hfr').on(t.hprId, t.hfrId),
  uniqueIndex('users_abha').on(t.abha),
]);

/** Server-side sessions. `id` is the SHA-256 of the cookie token, so a leaked table holds no usable token. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  /** The tester's private sample space. Everything people add is keyed to it, so testers never see each other's changes. */
  workspace: text('workspace').notNull().default('main'),
});

export const patients = pgTable('patients', {
  id: text('id').primaryKey(),
  abha: text('abha').notNull().unique(), // digits only
});

/** Who may open which patient. The dev adapter grants these automatically (source = 'dev-auto'). */
export const consents = pgTable('consents', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  facilityHfr: text('facility_hfr').notNull(),
  purpose: text('purpose').notNull(),
  grantedAt: ts('granted_at').notNull().defaultNow(),
  expiresAt: ts('expires_at'),
  revokedAt: ts('revoked_at'),
  source: text('source').notNull(),
}, t => [index('consents_patient').on(t.patientId)]);

export const accessLog = pgTable('access_log', {
  id: serial('id').primaryKey(),
  at: ts('at').notNull().defaultNow(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  action: text('action').notNull(),
  patientId: text('patient_id'),
  outcome: text('outcome').notNull(), // allowed | denied
}, t => [index('access_log_patient').on(t.patientId)]);

export const factVerifications = pgTable('fact_verifications', {
  patientId: text('patient_id').notNull(),
  factId: text('fact_id').notNull(),
  byUserId: text('by_user_id').notNull(),
  byLabel: text('by_label').notNull(),
  at: ts('at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.patientId, t.factId] })]);

/** Sign-in attempts, for rate limiting. `key` is "id:<role>:<identifier>" or "ip:<address>". */
export const authAttempts = pgTable('auth_attempts', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  at: ts('at').notNull().defaultNow(),
  ok: boolean('ok').notNull(),
  n: integer('n').notNull().default(1),
}, t => [index('auth_attempts_key_at').on(t.key, t.at)]);

/**
 * One recorded value. `origin` says where it came from: typed in by staff (verified at once, they are the source)
 * or read from an uploaded document (starts as `extracted` and counts for nothing until a person confirms it).
 * The value as first read stays here; corrections are appended to observation_versions.
 */
export const observations = pgTable('observations', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  code: text('code').notNull(),
  valueNum: doublePrecision('value_num'),
  valueText: text('value_text'),
  obsDate: text('obs_date').notNull(), // YYYY-MM-DD
  origin: text('origin').notNull(), // entry | upload
  documentId: text('document_id'),
  page: integer('page'),
  sourceText: text('source_text'),
  flagged: text('flagged'),
  status: text('status').notNull(), // extracted | verified | corrected | rejected
  groupId: text('group_id'),
  byUserId: text('by_user_id').notNull(),
  byLabel: text('by_label').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('observations_patient').on(t.patientId), index('observations_document').on(t.documentId)]);

/**
 * Append-only corrections. A row points at either one of our observations or at a value read from a follow-up slip
 * (`fact_id`). The original is never overwritten; the newest version is the current value.
 */
export const observationVersions = pgTable('observation_versions', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  observationId: text('observation_id'),
  factId: text('fact_id'),
  value: text('value').notNull(),
  reason: text('reason').notNull(),
  byUserId: text('by_user_id').notNull(),
  byLabel: text('by_label').notNull(),
  at: ts('at').notNull().defaultNow(),
}, t => [index('versions_patient').on(t.patientId)]);

/** An uploaded file and what happened when it was read. The bytes live in file_blobs. */
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  docType: text('doc_type').notNull(),
  fileName: text('file_name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  origin: text('origin').notNull(), // staff | patient
  status: text('status').notNull(), // queued | running | done | failed
  method: text('method'), // text-layer | ocr
  pages: integer('pages'),
  error: text('error'),
  byUserId: text('by_user_id').notNull(),
  byLabel: text('by_label').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
  /** Staging: our private store holds it until it is pushed to ABDM. */
  syncStatus: text('sync_status').notNull().default('pending'), // pending | pushed
}, t => [index('documents_patient').on(t.patientId)]);

/** File bytes as base64 text. Portable to any Postgres; swap for object storage behind FileStore when files grow. */
export const fileBlobs = pgTable('file_blobs', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
});

/* ───────── ABDM simulator ─────────
 * Stands in for the ABDM gateway so the whole consent-and-exchange flow can be shown before real sandbox access.
 * Tables prefixed sim_ belong to the gateway; the rest of the exchange tables belong to a hospital.
 */

/** A record a hospital (HIP) has made available for linking to a patient's ABHA. */
export const simCareContexts = pgTable('sim_care_contexts', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  hipHfr: text('hip_hfr').notNull(),
  documentId: text('document_id').notNull(),
  display: text('display').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('sim_care_contexts_doc').on(t.documentId)]);

export const simConsents = pgTable('sim_consents', {
  id: text('id').primaryKey(),
  /** Null when no patient has this ABHA. The request is still stored, so a hospital cannot tell the difference. */
  patientId: text('patient_id'),
  abha: text('abha').notNull(),
  hiuHfr: text('hiu_hfr').notNull(),
  hiuUserId: text('hiu_user_id').notNull(),
  hiuName: text('hiu_name').notNull(),
  workspace: text('workspace').notNull().default('main'),
  purpose: text('purpose').notNull(),
  validityDays: integer('validity_days').notNull(),
  status: text('status').notNull(), // requested | granted | denied | revoked
  createdAt: ts('created_at').notNull().defaultNow(),
  decidedAt: ts('decided_at'),
  expiresAt: ts('expires_at'),
  /** The consent artefact, as ABDM describes it: what may be asked for, for which period, and until when the receiver may keep it. */
  purposeCode: text('purpose_code').notNull().default('CAREMGT'),
  hiTypes: text('hi_types').notNull().default(''), // comma separated: OPConsultation, Prescription, DiagnosticReport
  dateFrom: ts('date_from'),
  dateTo: ts('date_to'),
  keepDays: integer('keep_days'),
  dataEraseAt: ts('data_erase_at'),
  requesterName: text('requester_name').notNull().default(''),
  requesterReg: text('requester_reg').notNull().default(''),
  /** The signed artefact, set when the patient grants. The receiver and the sender each keep a copy. */
  artefact: text('artefact'),
  signature: text('signature'),
}, t => [index('sim_consents_patient').on(t.patientId), index('sim_consents_hiu').on(t.hiuHfr), index('sim_consents_hiu_abha').on(t.workspace, t.hiuHfr, t.abha)]);

/** The sending hospital's own copy of a consent artefact, saved when the consent manager notifies it. */
export const hipConsentCopies = pgTable('hip_consent_copies', {
  consentId: text('consent_id').primaryKey(),
  hipHfr: text('hip_hfr').notNull(),
  workspace: text('workspace').notNull(),
  artefact: text('artefact').notNull(),
  signature: text('signature').notNull(),
  status: text('status').notNull(), // GRANTED | REVOKED | EXPIRED
  storedAt: ts('stored_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
});

/** What the gateway holds in transit for the current scheme: ciphertext, the sender's public key material and a checksum. */
export const abdmTransfers = pgTable('abdm_transfers', {
  id: text('id').primaryKey(),
  consentId: text('consent_id').notNull(),
  hipHfr: text('hip_hfr').notNull(),
  encryptedData: text('encrypted_data').notNull(),
  hipKeyMaterial: text('hip_key_material').notNull(), // JSON: public key and nonce only
  checksum: text('checksum').notNull(),
  status: text('status').notNull(), // TRANSFERRED | FAILED
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** What the gateway holds in transit. Ciphertext and public values only: it can never read the record. */
export const simTransfers = pgTable('sim_transfers', {
  id: text('id').primaryKey(),
  consentId: text('consent_id').notNull(),
  hipHfr: text('hip_hfr').notNull(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  salt: text('salt').notNull(),
  hipPublicKey: text('hip_public_key').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** The receiving hospital's own private key for one transfer. It never reaches the gateway tables. */
export const exchangeKeys = pgTable('exchange_keys', {
  id: text('id').primaryKey(), // same id as the transfer
  nonce: text('nonce').notNull().default(''),
  hiuHfr: text('hiu_hfr').notNull(),
  privateKey: text('private_key').notNull(),
  publicKey: text('public_key').notNull(),
});

/** A record the hospital received from another one. Read-only: only annotations can be added next to it. */
export const receivedRecords = pgTable('received_records', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  consentId: text('consent_id').notNull(),
  hiuHfr: text('hiu_hfr').notNull(),
  fromHfr: text('from_hfr').notNull(),
  workspace: text('workspace').notNull().default('main'),
  bundle: text('bundle').notNull(), // FHIR JSON, decrypted on the receiving side
  receivedAt: ts('received_at').notNull().defaultNow(),
}, t => [index('received_hiu').on(t.hiuHfr)]);

export const recordAnnotations = pgTable('record_annotations', {
  id: serial('id').primaryKey(),
  receivedId: text('received_id').notNull(),
  text: text('text').notNull(),
  byUserId: text('by_user_id').notNull(),
  byLabel: text('by_label').notNull(),
  at: ts('at').notNull().defaultNow(),
});

/** Translations already paid for. Keyed by the hash of language + text, so the same sentence is never sent twice. */
export const translations = pgTable('translations', {
  key: text('key').primaryKey(),
  target: text('target').notNull(),
  source: text('source').notNull(),
  translated: text('translated').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** One row per private sample space, so old ones can be cleared out. */
/**
 * Patients registered by staff during a visit to the site. Each belongs to one tester's workspace and to the hospital the
 * staff member works at, so another tester (or another hospital) never sees them.
 */
export const registeredPatients = pgTable('registered_patients', {
  id: text('id').primaryKey(), // R + 8 hex characters
  workspace: text('workspace').notNull(),
  hfrId: text('hfr_id').notNull(),
  abha: text('abha').notNull(), // digits only
  /** registry: the number was found in the sandbox ABHA registry and its profile matched. created: made by the sandbox for a patient with none. */
  abhaSource: text('abha_source').notNull(),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  sex: text('sex').notNull(), // M | F | O
  phone: text('phone').notNull(),
  place: text('place'),
  /** How and when the person was proven to be who they say. Nothing is saved before this exists. */
  verifiedAt: ts('verified_at').notNull(),
  verifyMethod: text('verify_method').notNull(), // mobile-otp
  /** What the patient agreed to, which version of the wording, and how it was captured. */
  consentPurposes: text('consent_purposes').notNull(), // comma separated: create-record, abha-link, share-abdm
  consentVersion: text('consent_version').notNull(),
  consentMode: text('consent_mode').notNull(), // in-person-signed | in-person-verbal
  consentAt: ts('consent_at').notNull(),
  byUserId: text('by_user_id').notNull(),
  byLabel: text('by_label').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('registered_workspace_abha').on(t.workspace, t.abha),
  index('registered_workspace_hfr').on(t.workspace, t.hfrId, t.createdAt), // a hospital's own list, newest first
  index('registered_workspace_name').on(t.workspace, t.name), // the alphabetical page of the directory
]);

/** Every time a patient gave or withdrew a consent. Append only: the current state is on the patient, this is the history. */
export const consentEvents = pgTable('consent_events', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull(), // the registered patient's id
  workspace: text('workspace').notNull(),
  action: text('action').notNull(), // granted | withdrawn
  purposes: text('purposes').notNull(), // comma separated
  mode: text('mode'),
  reason: text('reason'),
  byLabel: text('by_label').notNull(),
  at: ts('at').notNull().defaultNow(),
}, t => [index('consent_events_patient').on(t.patientId)]);

/** A registration that has been started but not finished. It becomes a patient only after identity and consent are both done. */
export const registrationDrafts = pgTable('registration_drafts', {
  id: text('id').primaryKey(),
  workspace: text('workspace').notNull(),
  hfrId: text('hfr_id').notNull(),
  userId: text('user_id').notNull(),
  details: text('details').notNull(), // the checked details, as JSON
  abha: text('abha').notNull(),
  abhaSource: text('abha_source').notNull(),
  otpHash: text('otp_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  verifiedAt: ts('verified_at'),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('registration_drafts_ws').on(t.workspace)]);

/**
 * The OPD queue of one hospital on one day, in one tester's space. A patient joins by sharing their profile (Scan & Share) or
 * is added at the desk. Waiting time is predicted from how long recent consultations took.
 */
export const opdVisits = pgTable('opd_visits', {
  id: text('id').primaryKey(),
  workspace: text('workspace').notNull(),
  hfrId: text('hfr_id').notNull(),
  day: text('day').notNull(), // YYYY-MM-DD, Indian date
  token: integer('token').notNull(),
  patientId: text('patient_id').notNull(),
  name: text('name').notNull(),
  abha: text('abha'),
  source: text('source').notNull(), // scan-and-share | desk
  priority: text('priority').notNull().default('routine'), // routine | urgent
  status: text('status').notNull(), // waiting | ongoing | done | cancelled
  byLabel: text('by_label').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  calledAt: ts('called_at'),
  doneAt: ts('done_at'),
}, t => [index('opd_visits_day').on(t.workspace, t.hfrId, t.day), uniqueIndex('opd_visits_token').on(t.workspace, t.hfrId, t.day, t.token)]);

/** What staff say one consultation takes here, used for the waiting time until enough real ones have been timed. Nothing is assumed. */
export const opdSettings = pgTable('opd_settings', {
  workspace: text('workspace').notNull(),
  hfrId: text('hfr_id').notNull(),
  minutesPerPatient: integer('minutes_per_patient').notNull(),
  byLabel: text('by_label').notNull(),
  at: ts('at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspace, t.hfrId] })]);

/** A patient's request to correct something in their record. Nobody edits a record for them: staff look at the original and decide. */
export const editRequests = pgTable('edit_requests', {
  id: text('id').primaryKey(),
  workspace: text('workspace').notNull(),
  patientId: text('patient_id').notNull(),
  subject: text('subject').notNull(), // what the patient points at, in words, e.g. "HbA1c 5.9% on 3 Dec 2027"
  subjectRef: text('subject_ref'), // the fact or value id when there is one
  proposed: text('proposed').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(), // pending | accepted | rejected
  byLabel: text('by_label').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  decidedBy: text('decided_by'),
  decisionNote: text('decision_note'),
  decidedAt: ts('decided_at'),
}, t => [index('edit_requests_patient').on(t.workspace, t.patientId)]);

/** Advice a doctor writes for a patient outside a follow-up slip, such as for a patient registered today. */
export const patientAdvice = pgTable('patient_advice', {
  id: serial('id').primaryKey(),
  workspace: text('workspace').notNull(),
  patientId: text('patient_id').notNull(),
  text: text('text').notNull(),
  byLabel: text('by_label').notNull(),
  at: ts('at').notNull().defaultNow(),
}, t => [index('patient_advice_patient').on(t.workspace, t.patientId)]);

/** Counselling and education given to a patient, and by whom. */
export const educationLog = pgTable('education_log', {
  id: serial('id').primaryKey(),
  workspace: text('workspace').notNull(),
  patientId: text('patient_id').notNull(),
  topic: text('topic').notNull(),
  byLabel: text('by_label').notNull(),
  at: ts('at').notNull().defaultNow(),
}, t => [index('education_log_patient').on(t.workspace, t.patientId)]);

/** Every message that passed between the hospital systems and the sandbox gateway, so what happened can be inspected. */
export const gatewayMessages = pgTable('gateway_messages', {
  id: serial('id').primaryKey(),
  workspace: text('workspace').notNull(),
  requestId: text('request_id').notNull(),
  from: text('from_party').notNull(),
  to: text('to_party').notNull(),
  path: text('path').notNull(),
  status: text('status').notNull(), // ok | rejected | error
  summary: text('summary').notNull(), // what it was about, never the health data itself
  at: ts('at').notNull().defaultNow(),
}, t => [index('gateway_messages_ws').on(t.workspace)]);

/** A small profile picture, kept per tester space so the shared sample sign-ins do not share a photo. A square JPEG of at most 150 KB. */
export const profilePhotos = pgTable('profile_photos', {
  workspace: text('workspace').notNull(),
  userId: text('user_id').notNull(),
  data: text('data').notNull(), // base64 JPEG
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspace, t.userId] })]);

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  createdAt: ts('created_at').notNull().defaultNow(),
  seenAt: ts('seen_at').notNull().defaultNow(),
});
