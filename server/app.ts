import { Hono } from 'hono';
import { makeCtx, type Deps, type Env } from './ctx';
import { users } from './db/schema';
import { authRoutes } from './routes/auth';
import { patientRoutes } from './routes/patients';
import { observationRoutes } from './routes/observations';
import { documentRoutes } from './routes/documents';
import { exchangeRoutes } from './routes/exchange';
import { languageRoutes } from './routes/language';

export type { Deps };

export function createApp(deps: Deps) {
  const ctx = makeCtx(deps);
  const app = new Hono<Env>().basePath('/api');

  /* ───────── hardening ───────── */
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
  });

  // Cookies are SameSite=Lax; on top of that, writes must be JSON (file uploads: multipart) and must come from this site.
  app.use('*', async (c, next) => {
    const write = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    if (write) {
      const type = c.req.header('content-type') ?? '';
      const upload = type.includes('multipart/form-data') && /\/documents$/.test(c.req.path);
      if (!type.includes('application/json') && !upload) return c.json({ error: 'bad_request' }, 400);
      const origin = c.req.header('origin');
      if (upload && !origin) return c.json({ error: 'forbidden' }, 403); // a browser always names the origin on an upload
      if (origin) {
        let host = '';
        try { host = new URL(origin).host; } catch { /* malformed origin is rejected below */ }
        if (host !== c.req.header('host')) return c.json({ error: 'forbidden' }, 403);
      }
    }
    await next();
  });

  app.get('/health', async c => {
    // Says plainly whether the database has been set up, so a first deploy can be checked in one request.
    let db: 'ready' | 'not set up' = 'ready';
    try { await deps.db.select({ id: users.id }).from(users).limit(1); } catch { db = 'not set up'; }
    return c.json({ ok: db === 'ready', auth: deps.auth.name, db }, db === 'ready' ? 200 : 503);
  });
  app.route('/', authRoutes(ctx));
  app.route('/', patientRoutes(ctx));
  app.route('/', observationRoutes(ctx));
  app.route('/', documentRoutes(ctx));
  app.route('/', exchangeRoutes(ctx));
  app.route('/', languageRoutes(ctx));

  app.notFound(c => c.json({ error: 'not_found', path: c.req.path }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'server_error' }, 500);
  });

  return app;
}
