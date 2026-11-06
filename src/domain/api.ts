/** Shapes that cross the API boundary. Both the server and the browser import these. */
import type { Citation, Fact, Recall, SourceDocument } from './types';

export type AppRole = 'doctor' | 'nurse' | 'patient';

export interface SessionUser {
  role: AppRole;
  name: string;
  line: string;
  patientId?: string;
  /** When this person's photo was last set; absent when there is none. */
  photoVersion?: string | null;
  /** The hospital this person works at (staff only). */
  hfrId?: string;
}

/** A patient registered by staff: identity verified by a code, and consent recorded, before the record existed. */
export interface RegisteredPatient {
  id: string;
  name: string;
  age: number;
  sex: 'M' | 'F' | 'O';
  abha: string;
  /** registry: matched against the sandbox ABHA registry. created: a sample number made for a patient with none. */
  abhaSource: 'registry' | 'created';
  phone: string;
  place?: string;
  registeredBy: string;
  registeredAt: string;
  hfrId: string;
  verifiedAt: string;
  verifyMethod: string;
  consentPurposes: string[];
  consentVersion: string;
  consentMode: 'in-person-signed' | 'in-person-verbal';
  consentAt: string;
}

/** A person in the sandbox ABHA registry, for testers to register. */
export interface SandboxIdentity { abha: string; name: string; age: number; sex: 'M' | 'F'; mobile: string; place: string; registered: boolean }

export interface RegistrationDraft { draftId: string; maskedPhone: string; abha: string; abhaSource: 'registry' | 'created'; expiresInMinutes: number; sandboxOtp: string }
export interface RegistrationInput { name: string; age: number; sex: 'M' | 'F' | 'O'; phone: string; place?: string; abha?: string; createAbha?: boolean }

/** A short summary of the record, in sentences. */
export interface RecordSummary { text: string; words: number; complete: boolean }
export interface AdviceItem { text: string; source: 'slip' | 'doctor'; by: string; at: string; topics: string[] }
export interface EducationTopic { id: string; title: string; steps: string[] }
export interface Counselling { advice: AdviceItem[]; topics: EducationTopic[]; education: { topic: string; by: string; at: string }[]; unavailable: string | null }
export interface EditRequest {
  id: string; patientId: string; subject: string; proposed: string; reason: string; status: 'pending' | 'accepted' | 'rejected';
  by: string; at: string; decidedBy?: string; decisionNote?: string; decidedAt?: string;
}

/** A patient known in this space, and what this hospital may do with them. */
export interface DirectoryEntry {
  patientId: string;
  name: string;
  abha: string;
  holderHfr: string;
  holderName: string;
  /** held: this hospital holds the record. none/denied/revoked/expired: no access yet. requested: waiting. granted: a copy can be fetched. */
  access: 'held' | 'none' | 'requested' | 'granted' | 'denied' | 'revoked' | 'expired';
  consentId: string | null;
  receivedId: string | null;
}

/** One place in today's OPD queue. */
export interface OpdVisit {
  id: string;
  token: number;
  name: string;
  patientId: string;
  source: 'scan-and-share' | 'desk';
  priority: 'routine' | 'urgent';
  status: 'waiting' | 'ongoing' | 'done' | 'cancelled';
  abha?: string;
  /** Whether this hospital holds the patient's record. */
  held?: boolean;
  hfrId?: string;
  joinedAt: string;
  calledAt?: string;
  doneAt?: string;
  position?: number;
  /** Null while there is nothing to base a prediction on. */
  startsAt?: string | null;
  waitMinutes?: number | null;
}
export interface OpdQueue {
  day: string;
  hfrId: string;
  items: OpdVisit[];
  counts: { appointments: number; waiting: number; ongoing: number; done: number; cancelled: number };
  /** Null until consultations have been timed or staff have entered a figure. */
  avgMinutes: number | null;
  basis: 'measured' | 'entered' | 'unavailable';
  basedOn: number;
  rush: 'light' | 'moderate' | 'busy';
}
export interface OpdMine { visit: OpdVisit | null; avgMinutes: number | null; basis: OpdQueue['basis']; rush: OpdQueue['rush']; hospital: string; hospitalName?: string }
export interface NetworkMessage { id: number; requestId: string; from: string; to: string; path: string; status: string; summary: string; at: string }

/** An answer to a patient's question about their own record. */
export interface RecordAnswer {
  answer: string;
  sources: { id: string; label: string; date?: string }[];
  via: 'record' | 'model' | 'general' | 'none';
}

export interface ExtractedItem {
  id: string;
  kind: 'fact' | 'finding' | 'diagnosis' | 'plan';
  label: string;
  display: string;
  citation: Citation;
  fact?: Fact;
  viaCopy: boolean;
}

export interface DocumentView {
  doc: SourceDocument | null;
  siblings: SourceDocument[];
  items: ExtractedItem[];
  recall: Recall;
}

export interface OtpCredentials {
  role: AppRole;
  hprId?: string;
  hfrId?: string;
  abha?: string;
  otp?: string;
}

export interface LookupResult {
  patientId: string;
  name: string;
  /** True for a patient registered at this hospital during the visit (not one of the two sample patients). */
  registered?: boolean;
}

export interface ObservationItem {
  id: string;
  code: string;
  label: string;
  unit: string | null;
  status: 'extracted' | 'verified' | 'corrected' | 'rejected';
  origin: 'entry' | 'upload';
  documentId: string | null;
  page?: number | null;
  date: string;
  flagged: string | null;
  sourceText: string | null;
  original: string;
  current: number | string | null;
  by: string;
  at: string;
  history: { value: string; reason: string; by: string; at: string }[];
}

export const GENERIC_AUTH_ERROR = 'These details or the code are not correct.';
