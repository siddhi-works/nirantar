import { and, asc, eq, max } from 'drizzle-orm';
import type { Db } from './db/client';
import { opdSettings, opdVisits } from './db/schema';
import { todayIST } from './time';

export type Visit = typeof opdVisits.$inferSelect;

const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;
const roundUp5 = (d: Date) => new Date(Math.ceil(d.getTime() / 300_000) * 300_000);

export type Rush = 'light' | 'moderate' | 'busy';
export interface Prediction {
  /**
   * Minutes one consultation takes. It is measured from the last consultations that finished here. Until two have finished it
   * is what staff entered. If neither exists it is null and no waiting time is shown: nothing is assumed.
   */
  avgMinutes: number | null;
  basis: 'measured' | 'entered' | 'unavailable';
  basedOn: number;
  rush: Rush;
  /** For each waiting visit: its place in line, and when it is expected to start (null while the average is unavailable). */
  waiting: Record<string, { position: number; startsAt: string | null; waitMinutes: number | null }>;
}

/**
 * An urgent visit goes ahead of routine ones. A suggested arrival time is the start time rounded up to the next five minutes,
 * so people can come when it is nearly their turn instead of all at once.
 */
export function predict(visits: Visit[], entered: number | null, now = new Date()): Prediction {
  const done = visits.filter(v => v.status === 'done' && v.calledAt && v.doneAt).sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime()).slice(0, 8);
  const lengths = done.map(v => minutesBetween(v.calledAt!, v.doneAt!)).filter(m => m > 0.5 && m < 60);
  let avg: number | null = null; let basis: Prediction['basis'] = 'unavailable';
  if (lengths.length >= 2) { avg = Math.min(25, Math.max(3, lengths.reduce((a, b) => a + b, 0) / lengths.length)); basis = 'measured'; }
  else if (entered) { avg = entered; basis = 'entered'; }
  const queue = visits.filter(v => v.status === 'waiting').sort((a, b) => (a.priority === b.priority ? a.token - b.token : a.priority === 'urgent' ? -1 : 1));
  const waiting: Prediction['waiting'] = {};
  const ongoing = visits.find(v => v.status === 'ongoing');
  queue.forEach((v, i) => {
    if (avg === null) { waiting[v.id] = { position: i + 1, startsAt: null, waitMinutes: null }; return; }
    const free = ongoing ? new Date(now.getTime() + Math.max(1, avg - minutesBetween(ongoing.calledAt ?? now, now)) * 60_000) : now;
    const start = roundUp5(new Date(free.getTime() + i * avg * 60_000));
    waiting[v.id] = { position: i + 1, startsAt: start.toISOString(), waitMinutes: Math.max(0, Math.round(minutesBetween(now, start))) };
  });
  const rush: Rush = queue.length > 8 ? 'busy' : queue.length > 3 ? 'moderate' : 'light';
  return { avgMinutes: avg === null ? null : Math.round(avg * 10) / 10, basis, basedOn: lengths.length, rush, waiting };
}

export async function visitsOn(db: Db, workspace: string, hfrId: string, day: string): Promise<Visit[]> {
  return db.select().from(opdVisits).where(and(eq(opdVisits.workspace, workspace), eq(opdVisits.hfrId, hfrId), eq(opdVisits.day, day))).orderBy(asc(opdVisits.token));
}

export async function enteredMinutes(db: Db, workspace: string, hfrId: string): Promise<number | null> {
  const [row] = await db.select().from(opdSettings).where(and(eq(opdSettings.workspace, workspace), eq(opdSettings.hfrId, hfrId))).limit(1);
  return row?.minutesPerPatient ?? null;
}

/** Next token of the day. Two desks adding at once cannot both get it: the unique index makes one try again. */
export async function addVisit(db: Db, v: Omit<typeof opdVisits.$inferInsert, 'token' | 'day'>, now = new Date()): Promise<Visit> {
  const day = todayIST(now);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [top] = await db.select({ n: max(opdVisits.token) }).from(opdVisits).where(and(eq(opdVisits.workspace, v.workspace), eq(opdVisits.hfrId, v.hfrId), eq(opdVisits.day, day)));
    try {
      const [row] = await db.insert(opdVisits).values({ ...v, day, token: (top?.n ?? 0) + 1 }).returning();
      return row;
    } catch { /* another token was taken at the same moment: try the next one */ }
  }
  throw new Error('Could not issue a token.');
}
