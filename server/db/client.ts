import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { neon } from '@neondatabase/serverless';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * DATABASE_URL set  → Neon Postgres (production, preview).
 * DATABASE_URL unset → embedded Postgres (PGlite): in memory for tests, or a folder on disk for local development.
 * Neon's HTTP driver has no multi-statement transactions, so no code here relies on them.
 */
export async function createDb(opts: { url?: string; dataDir?: string } = {}): Promise<Db> {
  if (opts.url) {
    const db = drizzleNeon(neon(opts.url), { schema });
    await migrateNeon(db, { migrationsFolder });
    return db as unknown as Db;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  if (opts.dataDir) mkdirSync(dirname(opts.dataDir), { recursive: true }); // PGlite creates the folder but not its parent
  const db = drizzlePglite(new PGlite(opts.dataDir), { schema });
  await migratePglite(db, { migrationsFolder });
  return db as unknown as Db;
}

export { schema };
