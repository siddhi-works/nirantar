/**
 * The consent artefact: the signed record of what a patient allowed. It follows the structure ABDM describes (purpose code,
 * the record types, the date range of the data, when the receiver must erase its copy, who is asking), and is signed by the
 * sandbox consent manager so the sending hospital can check it has not been altered before it releases anything.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const HI_TYPES = ['OPConsultation', 'Prescription', 'DiagnosticReport'] as const;
export type HiType = (typeof HI_TYPES)[number];
export const HI_LABEL: Record<HiType, string> = { OPConsultation: 'Consultation notes', Prescription: 'Prescriptions', DiagnosticReport: 'Test results' };

export interface Artefact {
  consentId: string;
  createdAt: string;
  status: 'GRANTED';
  purpose: { text: string; code: string; refUri: string };
  patient: { id: string };
  hip: { id: string };
  hiu: { id: string; name: string };
  requester: { name: string; identifier: { type: 'REGNO'; value: string } };
  hiTypes: HiType[];
  permission: { accessMode: 'VIEW'; dateRange: { from: string | null; to: string }; dataEraseAt: string; frequency: { unit: 'HOUR'; value: number; repeats: number } };
  /** When the permission itself ends. After this nothing more can be requested. */
  consentExpiry: string;
}

/** The sandbox consent manager's signing key. Set ABDM_SIM_SIGNING_KEY; without it a key is derived from the database address. */
const key = () => Buffer.from(process.env.ABDM_SIM_SIGNING_KEY ?? createHash('sha256').update(`nirantar-sandbox-cm:${process.env.DATABASE_URL ?? 'local'}`).digest('hex'));

/** The same bytes for the same content, whatever order the fields were written in. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function sign(a: Artefact): { json: string; signature: string } {
  const json = canonical(a);
  return { json, signature: createHmac('sha256', key()).update(json).digest('base64') };
}

/** The artefact if the signature holds, otherwise null. */
export function verify(json: string, signature: string): Artefact | null {
  const expected = createHmac('sha256', key()).update(json).digest();
  const given = Buffer.from(signature, 'base64');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try { return JSON.parse(json) as Artefact; } catch { return null; }
}

/** Why the sending hospital must refuse this request, or null when it may go ahead. */
export function refusal(a: Artefact, who: { hiuHfr: string; hipHfr: string }, now = new Date()): string | null {
  if (a.status !== 'GRANTED') return 'The consent is not granted.';
  if (a.hiu.id !== who.hiuHfr) return 'The consent was given to a different hospital.';
  if (a.hip.id !== who.hipHfr) return 'The consent does not name this hospital as the holder of the record.';
  if (new Date(a.consentExpiry).getTime() <= now.getTime()) return 'The consent has expired.';
  if (!a.hiTypes.length) return 'The consent allows no type of record.';
  return null;
}
