import { Hono } from 'hono';
import { lt } from 'drizzle-orm';
import { accessLog, authAttempts, registrationDrafts, sessions } from '../db/schema';
import { clearIdleWorkspaces } from '../seed';
import { purgeReceivedCopies } from '../abdm/purge';
import type { AppCtx, Env } from '../ctx';

const DAY = 86_400_000;

/**
 * Housekeeping, run once a day by the host's scheduler (vercel.json) and safe to run any time: it only removes what is
 * already expired or idle, so a free database does not slowly fill up. If CRON_SECRET is set, the caller must present it.
 */
export function maintenanceRoutes({ db }: AppCtx) {
  const r = new Hono<Env>();
  r.get('/maintenance', async c => {
    const secret = process.env.CRON_SECRET;
    if (secret && c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'forbidden' }, 403);
    const now = Date.now();
    const workspaces = await clearIdleWorkspaces(db);
    const erased = await purgeReceivedCopies(db); // the receiving hospital's duty: copies past their erase date, or whose consent was withdrawn
    await db.delete(authAttempts).where(lt(authAttempts.at, new Date(now - DAY)));
    await db.delete(registrationDrafts).where(lt(registrationDrafts.expiresAt, new Date(now - DAY)));
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date(now - DAY)));
    await db.delete(accessLog).where(lt(accessLog.at, new Date(now - 30 * DAY)));
    return c.json({ ok: true, workspacesCleared: workspaces, receivedCopiesErased: erased });
  });
  return r;
}
