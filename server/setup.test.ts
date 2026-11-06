import { describe, expect, it } from 'vitest';
import { createDb } from './db/client';
import { createApp } from './app';
import { DevAuthProvider } from './auth/provider';
import { loadConfig } from './config';
import { seed } from './seed';

describe('database setup', () => {
  it('health says plainly when the tables have not been created, and passes once they have', async () => {
    const db = await createDb({ migrate: false }); // an empty database, as a new hosted one is
    const app = createApp({ db, config: loadConfig({}), auth: new DevAuthProvider('482915') });
    const before = await app.request('/api/health');
    expect(before.status).toBe(503);
    expect(await before.json()).toMatchObject({ ok: false, db: 'not set up' });

    const ready = await createDb();
    await seed(ready);
    const after = await createApp({ db: ready, config: loadConfig({}), auth: new DevAuthProvider('482915') }).request('/api/health');
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ ok: true, db: 'ready' });
  });

  it('sets up on start locally, but on a hosted database only when asked', () => {
    expect(loadConfig({}).setupOnStart).toBe(true);
    expect(loadConfig({ DATABASE_URL: 'postgres://x', NODE_ENV: 'production', ALLOW_DEV_OTP: 'true' }).setupOnStart).toBe(false);
    expect(loadConfig({ DATABASE_URL: 'postgres://x', NODE_ENV: 'production', ALLOW_DEV_OTP: 'true', SETUP_ON_START: 'true' }).setupOnStart).toBe(true);
  });

  it('signs a known person in without a code by default, and still refuses an unknown one', async () => {
    const db = await createDb();
    await seed(db);
    const app = createApp({ db, config: loadConfig({}), auth: new DevAuthProvider('482915') });
    const post = (body: unknown) => app.request('/api/auth/otp/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ role: 'doctor', hprId: '71-3304-9082-1176', hfrId: 'IN2900011882' })).status).toBe(200);
    expect((await post({ role: 'doctor', hprId: '00-0000-0000-0000', hfrId: 'IN2900011882' })).status).toBe(401);
  });
});

describe('housekeeping and hardening', () => {
  it('creates the space once, and nothing in it, even when three sign-ins reach a new workspace at the same moment', async () => {
    const { ensureWorkspace } = await import('./seed');
    const { simConsents, workspaces } = await import('./db/schema');
    const { eq } = await import('drizzle-orm');
    const db = await createDb();
    await seed(db);
    await Promise.all([ensureWorkspace(db, 'abababababab'), ensureWorkspace(db, 'abababababab'), ensureWorkspace(db, 'abababababab')]);
    expect((await db.select().from(workspaces).where(eq(workspaces.id, 'abababababab'))).length).toBe(1);
    expect((await db.select().from(simConsents).where(eq(simConsents.workspace, 'abababababab'))).length).toBe(0); // no request is made up
  });

  it('logs the kind of failure without the data inside it', async () => {
    const { logError } = await import('./log');
    const lines: string[] = [];
    const orig = console.error; console.error = (m: string) => { lines.push(String(m)); };
    try {
      logError('POST /x', Object.assign(new Error('Failed query: insert into observations values ($1)\nparams: Rajesh Kumar Singh,91-2612'), { name: 'DrizzleQueryError' }));
    } finally { console.error = orig; }
    expect(lines[0]).toContain('DrizzleQueryError');
    expect(lines[0]).not.toContain('Rajesh');
    expect(lines[0]).not.toContain('91-2612');
  });

  it('the daily clean-up runs, and refuses a caller without the secret when one is set', async () => {
    const db = await createDb();
    await seed(db);
    const app = createApp({ db, config: loadConfig({}), auth: new DevAuthProvider('482915') });
    const ok = await app.request('/api/maintenance');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
    process.env.CRON_SECRET = 's3cret';
    try {
      expect((await app.request('/api/maintenance')).status).toBe(403);
      expect((await app.request('/api/maintenance', { headers: { authorization: 'Bearer s3cret' } })).status).toBe(200);
    } finally { delete process.env.CRON_SECRET; }
  });
});

describe('who is signed in', () => {
  it('tells the screens which hospital a staff member works at, so they can show the right home screen', async () => {
    const { setup } = await import('./test-utils');
    const h = await setup();
    const me = async (cookie: string) => (await (await h.get('/auth/me', cookie)).json()).user;
    expect((await me(await h.doctor())).hfrId).toBe('IN2900011882');
    expect((await me(await h.doctorB())).hfrId).toBe('IN0900022991');
    expect((await me(await h.patient('91-2612-3348-1056'))).hfrId).toBeUndefined();
  }, 60_000);
});
