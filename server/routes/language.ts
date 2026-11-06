import { logError } from '../log';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { translations } from '../db/schema';
import { GLOBAL, countRequests, record } from '../auth/ratelimit';
import { SUPPORTED } from '../language/provider';
import type { AppCtx, Env } from '../ctx';

const TRANSLATE_LIMIT = 200; // requests per person per 10 minutes
const SPEECH_LIMIT = 120; // a read-aloud is several short requests
const keyOf = (target: string, text: string) => createHash('sha256').update(`${target}\n${text}`).digest('hex');

export function languageRoutes({ db, requireUser, translator, speaker }: AppCtx) {
  const r = new Hono<Env>();
  const lang = z.enum(SUPPORTED as [string, ...string[]]);

  /** Translate text from the record. Cached, rate limited, and a clear "not available" when no service is connected. */
  r.post('/translate', requireUser(), async c => {
    const body = z.object({ texts: z.array(z.string().trim().min(1).max(500)).min(1).max(20), target: lang }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'bad_request' }, 400);
    const { texts, target } = body.data;
    const unique = [...new Set(texts)];
    const keys = unique.map(t => keyOf(target, t));
    const hit = await db.select().from(translations).where(inArray(translations.key, keys));
    const byKey = new Map(hit.map(h => [h.key, h.translated]));
    const missing = unique.filter(t => !byKey.has(keyOf(target, t)));
    if (missing.length) {
      if (!translator) return c.json({ error: 'not_configured' }, 501);
      const limitKey = `tr:${c.get('user').id}:${c.get('user').workspace}`;
      if (await countRequests(db, limitKey) >= TRANSLATE_LIMIT || await countRequests(db, 'tr:*') >= GLOBAL.translate) return c.json({ error: 'too_many_attempts' }, 429);
      await record(db, limitKey, true);
      await record(db, 'tr:*', true);
      let out: string[];
      try { out = await translator.translate(missing, target as 'hi-IN'); } catch (e) { logError('translate failed', e); return c.json({ error: 'unavailable' }, 502); }
      for (let i = 0; i < missing.length; i++) {
        byKey.set(keyOf(target, missing[i]), out[i]);
        await db.insert(translations).values({ key: keyOf(target, missing[i]), target, source: missing[i], translated: out[i] }).onConflictDoNothing();
      }
    }
    return c.json({ items: texts.map(t => byKey.get(keyOf(target, t)) ?? t) });
  });

  /** Read text aloud. The browser falls back to its own voices when this answers 501. */
  r.post('/speech', requireUser(), async c => {
    const body = z.object({ text: z.string().trim().min(1).max(800), lang: z.enum(['hi-IN', 'en-IN']) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'bad_request' }, 400);
    if (!speaker) return c.json({ error: 'not_configured' }, 501);
    const limitKey = `sp:${c.get('user').id}:${c.get('user').workspace}`;
    if (await countRequests(db, limitKey) >= SPEECH_LIMIT || await countRequests(db, 'sp:*') >= GLOBAL.speech) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, limitKey, true);
    await record(db, 'sp:*', true);
    try { return c.json(await speaker.speak(body.data.text, body.data.lang)); } catch (e) { logError('speech failed', e); return c.json({ error: 'unavailable' }, 502); }
  });

  return r;
}
