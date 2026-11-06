import { Hono } from 'hono';
import { z } from 'zod';
import { buildRecall } from '../core/engine';
import { GLOBAL, countRequests, record } from '../auth/ratelimit';
import { answerFromRecord, answerGeneral } from '../assistant/answer';
import { buildRegisteredSheet } from '../assistant/sheet';
import { observations } from '../db/schema';
import { OBS_BY_CODE } from '../../src/domain/observations';
import { REG_ID } from '../registry';
import { scope } from '../seed';
import { and, eq, inArray } from 'drizzle-orm';
import { NOT_FOUND, type AppCtx, type Env } from '../ctx';

const PER_PERSON = 30; // questions per person per 10 minutes
const idParam = z.string().regex(/^(P\d{1,3}|R[0-9a-f]{8})$/);

/** Questions a patient asks about their own record. Nothing they type is stored, and every answer names the lines it rests on. */
export function assistantRoutes({ db, chat, requireUser, open, opsFor }: AppCtx) {
  const r = new Hono<Env>();
  r.post('/patients/:id/ask', requireUser('patient'), async c => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success || !(await open(c, id.data, 'ask-record'))) return c.json(NOT_FOUND, 404);
    const body = z.object({ question: z.string().trim().min(2).max(300), lang: z.enum(['en', 'hi']) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'bad_request' }, 400);
    const me = c.get('user');
    const key = `ask:${me.id}:${me.workspace}`; // the sample users are shared, so a person's allowance is per user and per space
    if (await countRequests(db, key) >= PER_PERSON) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, key, true);
    // A patient with follow-up slips is answered from the full record; one who was registered here, from their confirmed values.
    const recall = REG_ID.test(id.data) ? null : buildRecall(id.data, await opsFor(id.data, me.workspace));
    const own = REG_ID.test(id.data) ? buildRegisteredSheet(await db.select().from(observations).where(and(eq(observations.patientId, scope(id.data, me.workspace)), inArray(observations.status, ['verified', 'corrected']))), OBS_BY_CODE) : undefined;
    // The model is the costly part: it is only reached when the record itself cannot answer, and everyone shares a cap.
    const useChat = chat && await countRequests(db, 'ask-model:*') < GLOBAL.chat ? chat : undefined;
    const out = await answerFromRecord(body.data.question, body.data.lang, recall, useChat, own);
    if (out.via === 'model') await record(db, 'ask-model:*', true);
    return c.json(out);
  });

  /**
   * What a term means, for anyone, signed in or not: general knowledge only, never a person's own numbers. Limited per address.
   */
  r.post('/glossary/ask', async c => {
    const body = z.object({ question: z.string().trim().min(2).max(200), lang: z.enum(['en', 'hi']) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'bad_request' }, 400);
    const ip = (c.req.header('x-forwarded-for') ?? 'local').split(',')[0].trim();
    const key = `gl:${ip}`;
    if (await countRequests(db, key) >= 60) return c.json({ error: 'too_many_attempts' }, 429);
    await record(db, key, true);
    return c.json(answerGeneral(body.data.question, body.data.lang));
  });

  return r;
}
