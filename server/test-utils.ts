import { expect } from 'vitest';
import { createDb, type Db } from './db/client';
import { createApp } from './app';
import { DevAuthProvider } from './auth/provider';
import { loadConfig } from './config';
import { DEV_DOCTOR, DEV_DOCTOR_B, DEV_NURSE, FACILITY_HFR, OTHER_HFR, seed } from './seed';
import type { OcrProvider } from './ocr/provider';
import type { Speaker, Translator } from './language/provider';

export const OTP = '482915';
export const P1_ABHA = '91-2612-3348-1056';
export const P2_ABHA = '14-7004-8821-5590';

export async function setup(opts: { ocr?: OcrProvider; translator?: Translator; speaker?: Speaker } = {}) {
  const db: Db = await createDb();
  await seed(db);
  const app = createApp({ db, config: loadConfig({ DEV_OTP: OTP }), auth: new DevAuthProvider(OTP), ocr: opts.ocr, translator: opts.translator, speaker: opts.speaker });
  const req = (method: string, path: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) =>
    app.request(`/api${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const get = (path: string, cookie?: string) => req('GET', path, undefined, cookie);
  const post = (path: string, body: unknown, cookie?: string, extra?: Record<string, string>) => req('POST', path, body, cookie, extra);
  async function signIn(body: Record<string, string>): Promise<string> {
    const r = await post('/auth/otp/verify', { otp: OTP, ...body });
    expect(r.status).toBe(200);
    return r.headers.get('set-cookie')!.split(';')[0];
  }
  const upload = (patientId: string, bytes: Uint8Array, name: string, type: string, cookie: string, headers: Record<string, string> = { origin: 'http://localhost', host: 'localhost' }) => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', new File([new Uint8Array(bytes)], name));
    return app.request(`/api/patients/${patientId}/documents`, { method: 'POST', headers: { cookie, ...headers }, body: form });
  };
  return {
    db, app, upload, get, post, req, signIn,
    doctor: () => signIn({ role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR }),
    doctorB: () => signIn({ role: 'doctor', hprId: DEV_DOCTOR_B.hprId, hfrId: OTHER_HFR }),
    nurse: () => signIn({ role: 'nurse', hprId: DEV_NURSE.hprId, hfrId: FACILITY_HFR }),
    patient: (abha: string) => signIn({ role: 'patient', abha }),
  };
}
export type Harness = Awaited<ReturnType<typeof setup>>;
