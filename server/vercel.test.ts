import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { setup, OTP, P1_ABHA } from './test-utils';
import { realUrl, vercelHandler } from './vercel';
import { DEV_DOCTOR, FACILITY_HFR } from './seed';

const PDF = new Uint8Array(readFileSync(new URL('./assets/originals/patient-1-followups.pdf', import.meta.url)));
const login = { otp: OTP, role: 'doctor', hprId: DEV_DOCTOR.hprId, hfrId: FACILITY_HFR };

let handler: ReturnType<typeof vercelHandler>;
const servers: Server[] = [];

/** A real HTTP server that calls the handler the way a host does. `pre` mimics a host that has already read the body. */
async function serve(pre: 'none' | 'parsed'): Promise<string> {
  const srv = createServer(async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
    if (pre === 'parsed' && req.method !== 'GET') {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks);
      req.body = String(req.headers['content-type']).includes('application/json') ? JSON.parse(raw.toString() || 'null') : raw;
    }
    await handler(req, res);
  });
  await new Promise<void>(r => srv.listen(0, r));
  servers.push(srv);
  return `http://localhost:${(srv.address() as AddressInfo).port}`;
}

beforeAll(async () => { const { app } = await setup(); handler = vercelHandler(async () => app); }, 60_000);
afterAll(() => { servers.forEach(s => s.close()); });

describe('called with a web Request', () => {
  it('answers with a Response', async () => {
    const res = (await handler(new Request('http://x.example/api/health'))) as Response;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: 'ready' });
  });
});

for (const mode of ['none', 'parsed'] as const) {
  describe(`called with Node's request and response (body ${mode === 'none' ? 'unread' : 'already read by the host'})`, () => {
    let base = '';
    beforeAll(async () => { base = await serve(mode); });
    const browserHeaders = (extra: Record<string, string> = {}) => ({ origin: base, 'content-type': 'application/json', ...extra });

    it('signs in with a browser Origin, sets the session cookie, and keeps it working', async () => {
      const r = await fetch(`${base}/api/auth/otp/verify`, { method: 'POST', headers: browserHeaders(), body: JSON.stringify(login) });
      expect(r.status).toBe(200);
      const cookie = r.headers.get('set-cookie')!;
      expect(cookie).toMatch(/HttpOnly/i);
      const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: cookie.split(';')[0] } });
      expect(me.status).toBe(200);
      expect((await me.json()).user.name).toBe('Dr. Swati Mani');
    });

    it('still refuses a cross-site browser write', async () => {
      const r = await fetch(`${base}/api/auth/otp/verify`, { method: 'POST', headers: browserHeaders({ origin: 'https://evil.example' }), body: JSON.stringify(login) });
      expect(r.status).toBe(403);
    });

    it('uploads a file and returns a PDF byte for byte', async () => {
      const cookie = (await fetch(`${base}/api/auth/otp/verify`, { method: 'POST', headers: browserHeaders(), body: JSON.stringify(login) })).headers.get('set-cookie')!.split(';')[0];
      const form = new FormData(); form.append('type', 'Prescription'); form.append('file', new File([new Uint8Array(PDF)], 'visits.pdf'));
      const up = await fetch(`${base}/api/patients/P1/documents`, { method: 'POST', headers: { cookie, origin: base }, body: form });
      expect(up.status).toBe(201);
      expect(await up.json()).toMatchObject({ status: 'done', method: 'text-layer' });
      const pdf = await fetch(`${base}/api/patients/P1/original`, { headers: { cookie } });
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      expect(new Uint8Array(await pdf.arrayBuffer())).toEqual(PDF);
    });

    it('gives a patient their own record and nothing else', async () => {
      const r = await fetch(`${base}/api/auth/otp/verify`, { method: 'POST', headers: browserHeaders(), body: JSON.stringify({ otp: OTP, role: 'patient', abha: P1_ABHA }) });
      const cookie = r.headers.get('set-cookie')!.split(';')[0];
      expect((await fetch(`${base}/api/patients/P1/recall`, { headers: { cookie } })).status).toBe(200);
      expect((await fetch(`${base}/api/patients/P2/recall`, { headers: { cookie } })).status).toBe(404);
    });
  });
}

describe('starting up', () => {
  it('retries after a failed start instead of caching the failure', async () => {
    const { app } = await setup();
    let calls = 0;
    const h = vercelHandler(async () => { calls++; if (calls === 1) throw new Error('database not reachable yet'); return app; });
    const first = (await h(new Request('http://x.example/api/health'))) as Response;
    expect(first.status).toBe(500);
    expect(JSON.stringify(await first.json())).not.toContain('database not reachable');
    expect(((await h(new Request('http://x.example/api/health'))) as Response).status).toBe(200);
  });
});

describe('when the host names the route instead of the real path', () => {
  it('rebuilds the real path from the route name and its query', () => {
    expect(realUrl('/api/[...path]?path=auth%2Fotp%2Fverify')).toBe('/api/auth/otp/verify');
    expect(realUrl('https://x.example/api/[...path]?path=patients%2FP1%2Frecall&a=1')).toBe('https://x.example/api/patients/P1/recall?a=1');
    expect(realUrl('/api/[...path]')).toBe('/api/');
  });
  it('adds the /api prefix when the host removed it, and leaves a normal path alone', () => {
    expect(realUrl('/auth/me')).toBe('/api/auth/me');
    expect(realUrl('/health')).toBe('/api/health');
    expect(realUrl('/api/auth/me')).toBe('/api/auth/me');
    expect(realUrl('https://x.example/api/health?x=1')).toBe('https://x.example/api/health?x=1');
  });

  it('still answers sign-in and a signed-in request in all three presentations (web Request, Node request)', async () => {
    const asWeb = async (url: string, init?: RequestInit) => (await handler(new Request(url, init))) as Response;
    const w = await asWeb('https://x.example/api/[...path]?path=health');
    expect(w.status).toBe(200);
    const r = await asWeb('https://x.example/api/[...path]?path=auth%2Fotp%2Fverify', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://x.example', host: 'x.example' }, body: JSON.stringify(login) });
    expect(r.status).toBe(200);
    const cookie = r.headers.getSetCookie()[0].split(';')[0];
    expect((await asWeb('https://x.example/api/[...path]?path=auth%2Fme', { headers: { cookie } })).status).toBe(200);
    // and as Node's request with the route name as its url
    const base = await serve('none');
    const viaNode = await fetch(`${base}/api/[...path]?path=health`);
    expect(viaNode.status).toBe(200);
  });
});

describe('realUrl with the rewrite in vercel.json', () => {
  it('rebuilds the real path from the __p marker, keeping other query values', async () => {
    const { realUrl } = await import('./vercel');
    expect(realUrl('/api/index?__p=auth%2Fotp%2Fverify')).toBe('/api/auth/otp/verify');
    expect(realUrl('/api/index?__p=patients%2FP1%2Frecall&x=1')).toBe('/api/patients/P1/recall?x=1');
    expect(realUrl('/api/index?__p=')).toBe('/api/');
  });
});
