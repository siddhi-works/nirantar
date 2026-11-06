/** Shapes that cross the API boundary. Both the server and the browser import these. */
import type { Citation, Fact, Recall, SourceDocument } from './types';

export type AppRole = 'doctor' | 'nurse' | 'patient';

export interface SessionUser {
  role: AppRole;
  name: string;
  line: string;
  patientId?: string;
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
