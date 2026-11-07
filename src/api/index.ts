/**
 * The only door between the screens and the server. Every call goes to /api over HTTPS with the
 * session cookie; the browser holds no record data of its own and enforces no access rules.
 */
import type { Complaint } from '@/domain/help';
import type { AshaReferral } from '@/domain/asha';
import type { DocumentView, LookupResult, ObservationItem, OtpCredentials, Counselling, DirectoryEntry, EditRequest, NetworkMessage, OpdMine, OpdQueue, RecordAnswer, RecordSummary, RegisteredPatient, RegistrationDraft, RegistrationInput, SandboxIdentity, SessionUser } from '@/domain/api';
import type { DocumentItem } from '@/domain/documents';
import type { ExchangeConsent, ReceivedRecordView } from '@/domain/exchange';
import type { Recall } from '@/domain/types';

export type { DocumentView };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

type Listener = () => void;
const listeners = new Set<Listener>();
const unauthorized = new Set<Listener>();
let version = 0;
const notify = () => { version += 1; listeners.forEach(l => l()); };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The first request after a quiet spell can meet a database that is still waking up, so a read is tried once more. */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  const read = !init.method || init.method === 'GET';
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (read && attempt === 0 && [502, 503, 504].includes(res.status)) { await sleep(1500); continue; }
      return res;
    } catch (e) {
      if (read && attempt === 0) { await sleep(1500); continue; }
      throw e;
    }
  }
}

async function http<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const res = await fetchRetry(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/otp/verify') unauthorized.forEach(l => l());
    throw new ApiError(res.status, typeof data.message === 'string' ? data.message : res.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : res.status === 404 ? (path.startsWith('/patients') ? 'This record is not available to you, or no longer exists.' : 'The service did not answer as expected. Reload the page and try again.') : res.status >= 500 ? 'The service had a problem. Try again in a moment.' : 'Something went wrong. Try again.');
  }
  return data as T;
}

export const api = {
  /** Resolves to the signed-in user, or null when there is no valid session. */
  me: () => http<{ user: SessionUser }>('/auth/me').then(r => r.user, () => null),
  verifyOtp: (c: OtpCredentials) => http<{ user: SessionUser }>('/auth/otp/verify', { method: 'POST', body: c }).then(r => r.user),
  setPhoto: async (image: string) => (await http<{ version: string }>('/me/photo', { method: 'PUT', body: { image } })).version,
  removePhoto: async () => { await http('/me/photo', { method: 'DELETE', body: {} }); },
  logout: () => http<{ ok: true }>('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined),

  /** Doctor or nurse opens a patient by ABHA. Rejects with a 404 for "no such record" and "no consent" alike. */
  lookup: (abha: string) => http<LookupResult>('/patients/lookup', { method: 'POST', body: { abha } }),
  getRecall: (patientId: string) => http<Recall>(`/patients/${encodeURIComponent(patientId)}/recall`),
  getDocumentView: (patientId: string, docId: string) => http<DocumentView>(`/patients/${encodeURIComponent(patientId)}/documents/${encodeURIComponent(docId)}`),
  verifyFacts: async (patientId: string, factIds: string[]) => {
    const r = await http<{ count: number }>(`/patients/${encodeURIComponent(patientId)}/verify`, { method: 'POST', body: { factIds } });
    notify();
    return r.count;
  },

  /** Values typed in by staff. Rejects with the server's reason when a value is implausible or incomplete. */
  recordValues: async (patientId: string, entries: { code: string; value: string | number }[], date?: string) => {
    await http(`/patients/${encodeURIComponent(patientId)}/observations`, { method: 'POST', body: { entries, date } });
    notify();
  },
  listObservations: (patientId: string) => http<{ items: ObservationItem[] }>(`/patients/${encodeURIComponent(patientId)}/observations`).then(r => r.items),
  confirmObservation: async (patientId: string, id: string) => { await http(`/patients/${encodeURIComponent(patientId)}/observations/${id}/confirm`, { method: 'POST', body: {} }); notify(); },
  correctObservation: async (patientId: string, id: string, value: string | number, reason: string) => { await http(`/patients/${encodeURIComponent(patientId)}/observations/${id}/correct`, { method: 'POST', body: { value, reason } }); notify(); },
  rejectObservation: async (patientId: string, id: string, reason: string) => { await http(`/patients/${encodeURIComponent(patientId)}/observations/${id}/reject`, { method: 'POST', body: { reason } }); notify(); },
  /** Correct a value that was read from a follow-up slip. The slip and the original value stay visible. */
  correctFact: async (patientId: string, factId: string, value: string | number, reason: string) => { await http(`/patients/${encodeURIComponent(patientId)}/facts/${encodeURIComponent(factId)}/correct`, { method: 'POST', body: { value, reason } }); notify(); },

  /** Uploads a file. The server stores it privately and reads it before answering. */
  uploadDocument: async (patientId: string, type: string, file: File): Promise<DocumentItem> => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/documents`, { method: 'POST', credentials: 'same-origin', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) unauthorized.forEach(l => l());
      throw new ApiError(res.status, typeof data.message === 'string' ? data.message : 'The upload did not go through. Try again.');
    }
    notify();
    return data as DocumentItem;
  },
  listDocuments: (patientId: string) => http<{ items: DocumentItem[] }>(`/patients/${encodeURIComponent(patientId)}/documents`).then(r => r.items),
  /** A patient fixing a value read from their own upload. It stays pending until staff confirm it. */
  editObservation: async (patientId: string, id: string, value: string | number) => { await http(`/patients/${encodeURIComponent(patientId)}/observations/${id}/edit`, { method: 'POST', body: { value } }); notify(); },

  /** Translated text for words that come from the record, or null when no language service is connected. */
  translate: async (texts: string[], target: 'hi-IN'): Promise<string[] | null> => {
    const res = await fetch('/api/translate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts, target }) });
    if (res.status === 501) return null;
    if (res.status === 401) unauthorized.forEach(l => l());
    if (!res.ok) throw new ApiError(res.status, 'Translation is not available right now.');
    return ((await res.json()) as { items: string[] }).items;
  },
  /** Audio from the language service, or null when none is connected (the browser then speaks itself). */
  speech: async (text: string, lang: 'hi-IN' | 'en-IN'): Promise<{ audio: string; mime: string } | null> => {
    const res = await fetch('/api/speech', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) });
    return res.ok ? ((await res.json()) as { audio: string; mime: string }) : null;
  },

  /** Upload the sample prescription for this patient, so nobody needs a file of their own. */
  uploadSample: async (patientId: string): Promise<DocumentItem> => {
    const doc = await http<DocumentItem>(`/patients/${encodeURIComponent(patientId)}/documents/sample`, { method: 'POST', body: {} });
    notify();
    return doc;
  },
  /** Move this browser to a new, empty sample space. Other testers are not affected. */
  freshWorkspace: async () => { await http('/workspace/fresh', { method: 'POST', body: {} }); },

  /* ───────── record exchange between hospitals (ABDM simulator) ───────── */
  requestConsent: async (abha: string, purpose: string, validityDays: number, extra: { hiTypes?: string[]; from?: string; keepDays?: number } = {}) => { await http('/exchange/requests', { method: 'POST', body: { abha, purpose, validityDays, ...extra } }); notify(); },
  listRequests: () => http<{ items: ExchangeConsent[] }>('/exchange/requests').then(r => r.items),
  listConsents: () => http<{ items: ExchangeConsent[] }>('/exchange/consents').then(r => r.items),
  decideConsent: async (id: string, decision: 'grant' | 'deny', allow: { hiTypes?: string[]; validityDays?: number; keepDays?: number } = {}) => { await http(`/exchange/consents/${id}/decision`, { method: 'POST', body: { decision, ...allow } }); notify(); },
  revokeConsent: async (id: string) => { await http(`/exchange/consents/${id}/revoke`, { method: 'POST', body: {} }); notify(); },
  fetchRecord: async (id: string) => { const r = await http<{ receivedId: string }>(`/exchange/consents/${id}/fetch`, { method: 'POST', body: {} }); notify(); return r.receivedId; },
  getReceived: (id: string) => http<ReceivedRecordView>(`/exchange/received/${id}`),
  annotate: async (id: string, text: string) => { await http(`/exchange/received/${id}/annotations`, { method: 'POST', body: { text } }); notify(); },
  registrationIdentities: () => http<{ items: SandboxIdentity[] }>('/patients/register/identities').then(r => r.items),
  registrationStart: (input: RegistrationInput) => http<RegistrationDraft>('/patients/register/start', { method: 'POST', body: input }),
  registrationVerify: async (draftId: string, otp: string) => { await http('/patients/register/verify', { method: 'POST', body: { draftId, otp } }); },
  registrationComplete: async (draftId: string, consent: { purposes: string[]; mode: 'in-person-signed' | 'in-person-verbal' }) => {
    const r = await http<{ patient: RegisteredPatient }>('/patients/register/complete', { method: 'POST', body: { draftId, consent } });
    notify();
    return r.patient;
  },
  changeShareConsent: async (patientId: string, action: 'grant' | 'withdraw', mode?: 'in-person-signed' | 'in-person-verbal', reason?: string) => {
    const r = await http<RegisteredPatient>(`/patients/${encodeURIComponent(patientId)}/consent`, { method: 'POST', body: { action, purpose: 'share-abdm', mode, reason } });
    notify();
    return r;
  },
  erasePatient: async (patientId: string, confirmName: string, reason: string) => { await http(`/patients/${encodeURIComponent(patientId)}/erase`, { method: 'POST', body: { confirmName, reason } }); notify(); },
  getSummary: (patientId: string) => http<RecordSummary>(`/patients/${encodeURIComponent(patientId)}/summary`),
  getCounselling: (patientId: string) => http<Counselling>(`/patients/${encodeURIComponent(patientId)}/counselling`),
  addAdvice: async (patientId: string, text: string) => { await http(`/patients/${encodeURIComponent(patientId)}/advice`, { method: 'POST', body: { text } }); notify(); },
  recordEducation: async (patientId: string, topic: string) => { await http(`/patients/${encodeURIComponent(patientId)}/education`, { method: 'POST', body: { topic } }); notify(); },
  raiseEdit: async (patientId: string, input: { subject: string; proposed: string; reason: string }) => { await http(`/patients/${encodeURIComponent(patientId)}/edit-requests`, { method: 'POST', body: input }); notify(); },
  listEdits: (patientId: string) => http<{ items: EditRequest[] }>(`/patients/${encodeURIComponent(patientId)}/edit-requests`).then(r => r.items),
  decideEdit: async (id: string, decision: 'accepted' | 'rejected', note: string) => { await http(`/edit-requests/${id}/decide`, { method: 'POST', body: { decision, note } }); notify(); },
  directory: (o: { q?: string; held?: boolean; limit?: number; offset?: number } = {}) => http<{ items: DirectoryEntry[]; total: number; offset: number; limit: number }>(`/patients/directory?${new URLSearchParams({ ...(o.q ? { q: o.q } : {}), ...(o.held ? { held: '1' } : {}), limit: String(o.limit ?? 25), offset: String(o.offset ?? 0) })}`),
  askGeneral: (question: string, lang: 'en' | 'hi') => http<RecordAnswer>('/glossary/ask', { method: 'POST', body: { question, lang } }),
  opdQueue: () => http<OpdQueue>('/opd/queue'),
  opdDemoDay: async () => { await http('/opd/demo-day', { method: 'POST', body: {} }); notify(); },
  opdWalkIn: async (abha: string, priority?: 'routine' | 'urgent') => { await http('/opd/walk-in', { method: 'POST', body: { abha, priority } }); notify(); },
  opdAct: async (id: string, action: 'call' | 'done' | 'cancel' | 'priority') => { await http(`/opd/${id}/${action}`, { method: 'POST', body: {} }); notify(); },
  opdSetMinutes: async (minutesPerPatient: number) => { await http('/opd/settings', { method: 'POST', body: { minutesPerPatient } }); notify(); },
  attention: () => http<{ items: { kind: 'review' | 'queue' | 'correction'; title: string; patientId?: string; name?: string }[] }>('/attention').then(r => r.items),
  opdMine: () => http<OpdMine>('/opd/me'),
  opdScan: async (hfr: string) => { const r = await http<OpdMine>('/opd/scan-and-share', { method: 'POST', body: { hfr } }); notify(); return r; },
  opdCancelMine: async () => { await http('/opd/me/cancel', { method: 'POST', body: {} }); notify(); },
  networkMessages: () => http<{ items: NetworkMessage[] }>('/network/messages').then(r => r.items),
  listRegistered: (o: { limit?: number; offset?: number } = {}) => http<{ items: RegisteredPatient[]; total: number }>(`/patients/registered?limit=${o.limit ?? 25}&offset=${o.offset ?? 0}`),
  getOwnHome: (patientId: string) => http<{ profile: RegisteredPatient; values: { code: string; label: string; date: string; value: number | null; display: string; status: string; source: { origin: string; documentId: string | null; quote: string | null; by: string } }[] }>(`/patients/${encodeURIComponent(patientId)}/home`),
  getProfile: (patientId: string) => http<RegisteredPatient>(`/patients/${encodeURIComponent(patientId)}/profile`),
  reportComplaint: (body: { kind: string; message: string; contact?: string }) => http<{ ok: true; reference: string }>('/help/complaints', { method: 'POST', body }),
  listComplaints: () => http<{ items: Complaint[] }>('/help/complaints').then(r => r.items),
  listAsha: (patientId: string) => http<{ items: AshaReferral[] }>(`/patients/${encodeURIComponent(patientId)}/asha-referrals`).then(r => r.items),
  referToAsha: async (patientId: string, body: { worker: 'asha' | 'usha'; reason: string; note?: string }) => { await http(`/patients/${encodeURIComponent(patientId)}/asha-referrals`, { method: 'POST', body }); notify(); },
  askRecord: (patientId: string, question: string, lang: 'en' | 'hi') => http<RecordAnswer>(`/patients/${encodeURIComponent(patientId)}/ask`, { method: 'POST', body: { question, lang } }),
  retryDocument: async (docId: string) => { const r = await http<DocumentItem>(`/documents/${docId}/retry`, { method: 'POST', body: {} }); notify(); return r; },
  pushDocument: async (patientId: string, docId: string) => { await http(`/patients/${encodeURIComponent(patientId)}/documents/${docId}/push`, { method: 'POST', body: {} }); notify(); },

  /** Screens refetch when this fires (after a change). */
  subscribe: (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  onUnauthorized: (fn: Listener) => { unauthorized.add(fn); return () => { unauthorized.delete(fn); }; },
  get version() { return version; },
};
