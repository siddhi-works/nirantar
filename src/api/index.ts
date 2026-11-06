/**
 * The only door between the screens and the server. Every call goes to /api over HTTPS with the
 * session cookie; the browser holds no record data of its own and enforces no access rules.
 */
import type { DocumentView, LookupResult, ObservationItem, OtpCredentials, SessionUser } from '@/domain/api';
import type { DocumentItem } from '@/domain/documents';
import type { ExchangeConsent, ReceivedRecordItem, ReceivedRecordView } from '@/domain/exchange';
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

async function http<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
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
  requestConsent: async (abha: string, purpose: string, validityDays: number) => { await http('/exchange/requests', { method: 'POST', body: { abha, purpose, validityDays } }); notify(); },
  listRequests: () => http<{ items: ExchangeConsent[] }>('/exchange/requests').then(r => r.items),
  listConsents: () => http<{ items: ExchangeConsent[] }>('/exchange/consents').then(r => r.items),
  decideConsent: async (id: string, decision: 'grant' | 'deny') => { await http(`/exchange/consents/${id}/decision`, { method: 'POST', body: { decision } }); notify(); },
  revokeConsent: async (id: string) => { await http(`/exchange/consents/${id}/revoke`, { method: 'POST', body: {} }); notify(); },
  fetchRecord: async (id: string) => { const r = await http<{ receivedId: string }>(`/exchange/consents/${id}/fetch`, { method: 'POST', body: {} }); notify(); return r.receivedId; },
  listReceived: () => http<{ items: ReceivedRecordItem[] }>('/exchange/received').then(r => r.items),
  getReceived: (id: string) => http<ReceivedRecordView>(`/exchange/received/${id}`),
  annotate: async (id: string, text: string) => { await http(`/exchange/received/${id}/annotations`, { method: 'POST', body: { text } }); notify(); },
  pushDocument: async (patientId: string, docId: string) => { await http(`/patients/${encodeURIComponent(patientId)}/documents/${docId}/push`, { method: 'POST', body: {} }); notify(); },

  /** Screens refetch when this fires (after a change). */
  subscribe: (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  onUnauthorized: (fn: Listener) => { unauthorized.add(fn); return () => { unauthorized.delete(fn); }; },
  get version() { return version; },
};
