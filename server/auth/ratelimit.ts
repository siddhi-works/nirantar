import { and, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authAttempts } from '../db/schema';

const WINDOW_MS = 10 * 60 * 1000;
export const LIMITS = { failuresPerId: 5, failuresPerIp: 20, requestsPerId: 5, signInsPerIp: 150 };
/** Everyone together, per 10 minutes: a public link must not be able to spend all the language-service credits. */
export const GLOBAL = { translate: 100, speech: 60, ocr: 20 };

const since = () => new Date(Date.now() - WINDOW_MS);

export async function countFailures(db: Db, key: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(authAttempts)
    .where(and(eq(authAttempts.key, key), eq(authAttempts.ok, false), gt(authAttempts.at, since())));
  return r?.n ?? 0;
}

export async function countRequests(db: Db, key: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(authAttempts)
    .where(and(eq(authAttempts.key, key), gt(authAttempts.at, since())));
  return r?.n ?? 0;
}

export async function record(db: Db, key: string, ok: boolean): Promise<void> {
  await db.insert(authAttempts).values({ key, ok });
}
