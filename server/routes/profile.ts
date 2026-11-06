import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { profilePhotos } from '../db/schema';
import { countRequests, record } from '../auth/ratelimit';
import type { AppCtx, Env } from '../ctx';

const MAX_CHARS = 200_000; // about 150 KB of JPEG once it is base64
const DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;

/** A person's own profile picture. It is checked here, not only in the browser: it must be a real JPEG and small. */
export function profileRoutes({ db, requireUser }: AppCtx) {
  const r = new Hono<Env>();

  r.put('/me/photo', requireUser(), async c => {
    const me = c.get('user');
    const body = z.object({ image: z.string().max(MAX_CHARS + 40) }).safeParse(await c.req.json().catch(() => null));
    const m = body.success ? DATA_URL.exec(body.data.image) : null;
    if (!m || m[1].length > MAX_CHARS) return c.json({ error: 'bad_request', message: 'Send a JPEG picture under 150 KB.' }, 400);
    const bytes = Buffer.from(m[1], 'base64');
    if (bytes.length < 200 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return c.json({ error: 'bad_request', message: 'That file is not a JPEG picture.' }, 400);
    const key = `photo:${me.id}:${me.workspace}`;
    if (await countRequests(db, key) >= 20) return c.json({ error: 'too_many_attempts', message: 'Too many changes. Try again later.' }, 429);
    await record(db, key, true);
    const at = new Date();
    await db.insert(profilePhotos).values({ workspace: me.workspace, userId: me.id, data: m[1], updatedAt: at })
      .onConflictDoUpdate({ target: [profilePhotos.workspace, profilePhotos.userId], set: { data: m[1], updatedAt: at } });
    return c.json({ version: String(at.getTime()) });
  });

  r.get('/me/photo', requireUser(), async c => {
    const me = c.get('user');
    const [row] = await db.select({ data: profilePhotos.data }).from(profilePhotos).where(and(eq(profilePhotos.workspace, me.workspace), eq(profilePhotos.userId, me.id))).limit(1);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return new Response(Buffer.from(row.data, 'base64'), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  });

  r.delete('/me/photo', requireUser(), async c => {
    const me = c.get('user');
    await db.delete(profilePhotos).where(and(eq(profilePhotos.workspace, me.workspace), eq(profilePhotos.userId, me.id)));
    return c.json({ ok: true });
  });

  return r;
}
