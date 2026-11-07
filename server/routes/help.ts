import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { COMPLAINT_KINDS } from '../../src/domain/help';
import { complaints } from '../db/schema';
import { countRequests, record } from '../auth/ratelimit';
import type { AppCtx, Env } from '../ctx';

/** Help: report a complaint. It is stored with who sent it; nobody is notified by any system yet. */
export function helpRoutes({ db, requireUser }: AppCtx) {
  const r = new Hono<Env>();

  r.post('/help/complaints', requireUser(), async c => {
    const me = c.get('user');
    const body = z.object({
      kind: z.enum(COMPLAINT_KINDS.map(k => k.id) as [string, ...string[]]),
      message: z.string().trim().min(10).max(1000),
      contact: z.string().trim().max(120).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid', message: 'Choose what it is about and describe it in at least a sentence.' }, 400);
    const key = `complaint:${me.id}:${me.workspace}`;
    if (await countRequests(db, key) >= 5) return c.json({ error: 'too_many_attempts', message: 'You have sent several reports already. Please wait before sending another.' }, 429);
    await record(db, key, true);
    const [row] = await db.insert(complaints).values({ workspace: me.workspace, userId: me.id, role: me.role, category: body.data.kind, message: body.data.message, contact: body.data.contact || null }).returning({ id: complaints.id });
    return c.json({ ok: true, reference: `NC-${String(row.id).padStart(5, '0')}` }, 201);
  });

  r.get('/help/complaints', requireUser(), async c => {
    const me = c.get('user');
    const rows = await db.select().from(complaints).where(and(eq(complaints.workspace, me.workspace), eq(complaints.userId, me.id))).orderBy(desc(complaints.id)).limit(10);
    return c.json({ items: rows.map(x => ({ id: x.id, kind: x.category, message: x.message, at: x.at.toISOString() })) });
  });

  return r;
}
