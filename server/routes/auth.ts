import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { GENERIC_AUTH_ERROR, type AppRole, type SessionUser } from '../../src/domain/api';
import { accessLog, sessions, users } from '../db/schema';
import { COOKIE, WS_COOKIE, hashToken, newToken } from '../auth/session';
import { WORKSPACE_RE, ensureWorkspace, newWorkspaceId } from '../seed';
import { LIMITS, countFailures, countRequests, record } from '../auth/ratelimit';
import { digits, type AppCtx, type Env } from '../ctx';

const credentialsSchema = z.object({
  role: z.enum(['doctor', 'nurse', 'patient']),
  hprId: z.string().trim().max(40).optional(),
  hfrId: z.string().trim().max(40).optional(),
  abha: z.string().trim().max(40).optional(),
});
const verifySchema = credentialsSchema.extend({ otp: z.string().regex(/^\d{4,8}$/).optional() });

export function authRoutes({ db, config, auth, requireUser }: AppCtx) {
  const r = new Hono<Env>();

  r.post('/auth/otp/request', async c => {
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
    const creds = parsed.data;
    const key = `req:${creds.role}:${(creds.hprId ?? '') + (creds.hfrId ?? '') + digits(creds.abha ?? '')}`;
    if (await countRequests(db, key) >= LIMITS.requestsPerId) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, key, true);
    await auth.requestOtp(creds);
    return c.json({ ok: true }, 202); // same reply whether or not the account exists
  });

  r.post('/auth/otp/verify', async c => {
    const parsed = verifySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
    const { otp, ...creds } = parsed.data;
    const ip = (c.req.header('x-forwarded-for') ?? 'local').split(',')[0].trim();
    const idKey = `id:${creds.role}:${(creds.hprId ?? '') + (creds.hfrId ?? '') + digits(creds.abha ?? '')}`;
    const ipKey = `ip:${ip}`;
    if (await countFailures(db, idKey) >= LIMITS.failuresPerId || await countFailures(db, ipKey) >= LIMITS.failuresPerIp) {
      return c.json({ error: 'too_many_attempts' }, 429);
    }

    // When a code is required it is checked even if the account does not exist, so both failures look and cost the same.
    const codeOk = !config.requireOtp || await auth.verifyOtp(creds, otp ?? '');
    const [user] = creds.role === 'patient'
      ? await db.select().from(users).where(and(eq(users.role, 'patient'), eq(users.abha, digits(creds.abha ?? '')))).limit(1)
      : await db.select().from(users).where(and(eq(users.role, creds.role), eq(users.hprId, creds.hprId ?? ''), eq(users.hfrId, creds.hfrId ?? ''))).limit(1);

    if (!codeOk || !user) {
      await record(db, idKey, false);
      await record(db, ipKey, false);
      return c.json({ error: 'invalid_credentials', message: GENERIC_AUTH_ERROR }, 401);
    }

    if (await countRequests(db, `in:${ip}`) >= LIMITS.signInsPerIp) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, `in:${ip}`, true);
    const kept = getCookie(c, WS_COOKIE);
    const ws = kept && WORKSPACE_RE.test(kept) ? kept : newWorkspaceId();
    await ensureWorkspace(db, ws);

    const token = newToken();
    await db.insert(sessions).values({ id: hashToken(token), userId: user.id, workspace: ws, expiresAt: new Date(Date.now() + config.sessionHours * 3_600_000) });
    setCookie(c, COOKIE, token, { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: config.sessionHours * 3600 });
    setCookie(c, WS_COOKIE, ws, { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: 90 * 86400 }); // after the session cookie, which stays first
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action: 'sign-in', outcome: 'allowed' });
    return c.json({ user: { role: user.role as AppRole, name: user.name, line: user.line, patientId: user.patientId ?? undefined } satisfies SessionUser });
  });

  r.get('/auth/me', requireUser(), c => {
    const u = c.get('user');
    return c.json({ user: { role: u.role, name: u.name, line: u.line, patientId: u.patientId ?? undefined } satisfies SessionUser });
  });

  /** Move this browser to a new, empty sample space. Only this tester's own additions are left behind. */
  r.post('/workspace/fresh', requireUser(), async c => {
    const me = c.get('user');
    const key = `fresh:${me.id}:${c.req.header('x-forwarded-for') ?? 'local'}`;
    if (await countRequests(db, key) >= 5) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, key, true);
    const ws = newWorkspaceId();
    await ensureWorkspace(db, ws);
    await db.update(sessions).set({ workspace: ws }).where(eq(sessions.id, me.sessionId));
    setCookie(c, WS_COOKIE, ws, { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: 90 * 86400 });
    return c.json({ ok: true });
  });

  r.post('/auth/logout', requireUser(), async c => {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, c.get('user').sessionId));
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return r;
}
