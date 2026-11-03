import { serve } from '@hono/node-server';
import { boot } from './boot';

const port = Number(process.env.PORT ?? 8787);
const app = await boot();
serve({ fetch: app.fetch, port }, () => console.log(`Nirantar API on http://localhost:${port}`));
