/**
 * Create the tables and the starting data on a hosted database. Run once before the first deploy, and again after any
 * release that adds a migration:   DATABASE_URL=... npm run db:setup
 */
import { createDb } from '../server/db/client';
import { seed } from '../server/seed';
import { users, patients, consents } from '../server/db/schema';
import { count } from 'drizzle-orm';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL to your Neon connection string first.'); process.exit(1); }

const db = await createDb({ url, migrate: true });
await seed(db);
const [u] = await db.select({ n: count() }).from(users);
const [p] = await db.select({ n: count() }).from(patients);
const [c] = await db.select({ n: count() }).from(consents);
console.log(`Database ready: ${u.n} users, ${p.n} patients, ${c.n} consents.`);
