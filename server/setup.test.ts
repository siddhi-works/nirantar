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
