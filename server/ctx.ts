import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { AppRole } from '../src/domain/api';
import type { Patient } from '../src/domain/types';
import type { Config } from './config';
import type { Db } from './db/client';
import { accessLog, consents, factVerifications, observations, observationVersions, sessions, users } from './db/schema';
import type { AuthProvider } from './auth/provider';
import { dbFileStore, type FileStore } from './files';
import type { OcrProvider } from './ocr/provider';
import type { Speaker, Translator } from './language/provider';
import { COOKIE, hashToken } from './auth/session';
import type { Ops } from './core/engine';
import { observationFact } from './core/observations';
import { parseRecord } from './core/parse';
import { scope } from './seed';

export interface AuthedUser { id: string; role: AppRole; name: string; line: string; hfrId: string | null; patientId: string | null; sessionId: string; workspace: string }
export type Env = { Variables: { user: AuthedUser } };
export type Ctx = Context<Env>;

export interface Deps { db: Db; config: Config; auth: AuthProvider; ocr?: OcrProvider; files?: FileStore; translator?: Translator; speaker?: Speaker }

export const NOT_FOUND = { error: 'not_found' } as const;
export const digits = (s: string) => s.replace(/\D/g, '');
export const patientOf = (id: string): Patient | undefined => parseRecord().patients.find(p => p.id === id);

export function makeCtx({ db, config, auth, ocr, files: fileStore, translator, speaker }: Deps) {
  const files = fileStore ?? dbFileStore(db);
  const requireUser = (...roles: AppRole[]): MiddlewareHandler<Env> => async (c, next) => {
    const token = getCookie(c, COOKIE);
    if (!token) return c.json({ error: 'unauthenticated' }, 401);
    const [row] = await db.select({
      sessionId: sessions.id, workspace: sessions.workspace, id: users.id, role: users.role, name: users.name, line: users.line, hfrId: users.hfrId, patientId: users.patientId,
    }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).limit(1);
    if (!row) return c.json({ error: 'unauthenticated' }, 401);
    if (roles.length && !roles.includes(row.role as AppRole)) return c.json({ error: 'forbidden' }, 403);
    c.set('user', { ...row, role: row.role as AppRole });
    await next();
  };

  async function canOpen(user: AuthedUser, patientId: string): Promise<boolean> {
    if (user.role === 'patient') return user.patientId === patientId;
    return !!user.hfrId && activeConsent(patientId, user.hfrId);
  }

  async function activeConsent(patientId: string, hfr: string): Promise<boolean> {
    const rows = await db.select({ expiresAt: consents.expiresAt }).from(consents)
      .where(and(eq(consents.patientId, patientId), eq(consents.facilityHfr, hfr), isNull(consents.revokedAt)));
    const now = Date.now();
    return rows.some(r => !r.expiresAt || r.expiresAt.getTime() > now);
  }

  /** Decide, then write the access log, then answer. If the log cannot be written the request fails closed. */
  async function open(c: Ctx, patientId: string, action: string): Promise<boolean> {
    const user = c.get('user');
    const allowed = patientOf(patientId) !== undefined && await canOpen(user, patientId);
    await db.insert(accessLog).values({ userId: user.id, role: user.role, action, patientId, outcome: allowed ? 'allowed' : 'denied' });
    return allowed;
  }

  /** Everything the engine needs besides the follow-up slips: confirmations, corrections and confirmed recorded values. */
  async function opsFor(patientId: string, ws: string): Promise<Ops> {
    const patient = patientOf(patientId)!;
    const key = scope(patientId, ws); // this tester's own additions to the record
    const ver = await db.select().from(factVerifications).where(eq(factVerifications.patientId, key));
    const versions = await db.select().from(observationVersions).where(eq(observationVersions.patientId, key)).orderBy(asc(observationVersions.id));
    const obs = await db.select().from(observations).where(and(eq(observations.patientId, key), inArray(observations.status, ['verified', 'corrected'])));
    const corrections: NonNullable<Ops['corrections']> = {};
    for (const v of versions) if (v.factId) corrections[v.factId] = { value: Number.isNaN(Number(v.value)) ? v.value : Number(v.value), by: v.byLabel, at: v.at.toISOString(), reason: v.reason };
    return {
      tasks: [], aiAccepted: {}, corrections,
      verifications: Object.fromEntries(ver.map(r => [r.factId, { by: r.byLabel, at: r.at.toISOString() }])),
      observations: obs.map(o => observationFact(o, versions, patient)).filter((f): f is NonNullable<typeof f> => f !== null),
    };
  }

  return { db, config, auth, ocr, files, translator, speaker, requireUser, open, opsFor };
}
export type AppCtx = ReturnType<typeof makeCtx>;
