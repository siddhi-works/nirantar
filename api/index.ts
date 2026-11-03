import { handle } from 'hono/vercel';
import { boot } from '../server/boot';

// One app per warm function instance; migrations and seed run on a cold start.
const ready = boot();

export const config = { runtime: 'nodejs' };
export default async function handler(req: Request): Promise<Response> {
  return handle(await ready)(req);
}
