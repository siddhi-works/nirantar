import type { IncomingMessage, ServerResponse } from 'node:http';

type App = { fetch: (req: Request) => Response | Promise<Response> };

const BODYLESS = new Set(['GET', 'HEAD']);

/**
 * The real path of a request. A host can hand a catch-all function its internal route name with the matched part in
 * a query string (/api/[...path]?path=auth%2Fme), or a path without the /api prefix. Rebuild /api/auth/me from either.
 */
export function realUrl(raw: string): string {
  const u = new URL(raw, 'http://host.invalid');
  const rewritten = u.searchParams.get('__p'); // set by the rewrite in vercel.json: the part of the path after /api/
  if (rewritten !== null) {
    u.pathname = `/api/${rewritten.replace(/^\/+/, '')}`;
    u.searchParams.delete('__p');
    return raw.startsWith('http') ? u.toString() : `${u.pathname}${u.search}`;
  }
  const matched = u.searchParams.get('path');
  if (/^\/api\/\[\.\.\.\w+\]$/.test(u.pathname) || (matched !== null && u.pathname.startsWith('/api/['))) {
    u.pathname = `/api/${(matched ?? '').replace(/^\/+/, '')}`;
    u.searchParams.delete('path');
  } else if (u.pathname !== '/api' && !u.pathname.startsWith('/api/')) {
    u.pathname = `/api${u.pathname === '/' ? '' : u.pathname}`;
  }
  return raw.startsWith('http') ? u.toString() : `${u.pathname}${u.search}`;
}

function withRealUrl(request: Request): Request {
  const fixed = realUrl(request.url);
  if (fixed === request.url) return request;
  return new Request(fixed, { method: request.method, headers: request.headers, body: BODYLESS.has(request.method) ? undefined : request.body, duplex: 'half' } as RequestInit);
}
const DROP = new Set(['content-length', 'transfer-encoding', 'connection']);

async function readAll(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Node's request, as a web Request. Vercel may already have read and parsed the body, so use that when it is there. */
async function toRequest(req: IncomingMessage & { body?: unknown }): Promise<Request> {
  const method = (req.method ?? 'GET').toUpperCase();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !DROP.has(k)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
  headers.set('host', host); // the app compares a browser's Origin with this
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0];
  let body: BodyInit | undefined;
  if (!BODYLESS.has(method)) {
    const parsed = req.body;
    if (parsed === undefined || parsed === null) body = new Uint8Array(await readAll(req));
    else if (Buffer.isBuffer(parsed)) body = new Uint8Array(parsed);
    else if (typeof parsed === 'string') body = parsed;
    else body = JSON.stringify(parsed);
  }
  return new Request(`${proto}://${host}${realUrl(req.url ?? '/')}`, { method, headers, body });
}

async function send(res: ServerResponse, out: Response): Promise<void> {
  res.statusCode = out.status;
  out.headers.forEach((value, key) => { if (key !== 'set-cookie') res.setHeader(key, value); });
  const cookies = out.headers.getSetCookie?.() ?? [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await out.arrayBuffer()));
}

/**
 * One handler that works however the host calls it: with a web Request (returns a Response), or with Node's
 * request and response objects (writes the answer). The app is built once per warm instance.
 */
export function vercelHandler(boot: () => Promise<App>) {
  let ready: Promise<App> | null = null;
  const app = () => (ready ??= boot().catch(e => { ready = null; throw e; })); // a failed start is retried, not cached
  return async function handler(a: Request | IncomingMessage, b?: ServerResponse): Promise<Response | void> {
    try {
      const instance = await app();
      if (b === undefined && typeof (a as Request).arrayBuffer === 'function') return await instance.fetch(withRealUrl(a as Request));
      await send(b!, await instance.fetch(await toRequest(a as IncomingMessage)));
    } catch (e) {
      console.error('request failed', e);
      const body = JSON.stringify({ error: 'server_error' });
      if (b) { b.statusCode = 500; b.setHeader('content-type', 'application/json'); b.end(body); return; }
      return new Response(body, { status: 500, headers: { 'content-type': 'application/json' } });
    }
  };
}
