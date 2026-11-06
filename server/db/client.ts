import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { neon } from '@neondatabase/serverless';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The migrations are read from disk at run time. Try where this file sits, then where a host runs it from. */
function findMigrations(): string {
  const candidates = [fileURLToPath(new URL('./migrations', import.meta.url)), join(process.cwd(), 'server/db/migrations'), '/var/task/server/db/migrations'];
  const found = candidates.find(c => existsSync(join(c, 'meta/_journal.json')));
  if (!found) throw new Error(`Database migrations not found. Looked in: ${candidates.join(', ')}`);
  return found;
}

/**
 * DATABASE_URL set  → Neon Postgres (production, preview).
 * DATABASE_URL unset → embedded Postgres (PGlite): in memory for tests, or a folder on disk for local development.
 * Neon's HTTP driver has no multi-statement transactions, so no code here relies on them.
 */
export async function createDb(opts: { url?: string; dataDir?: string; migrate?: boolean } = {}): Promise<Db> {
  const migrate = opts.migrate ?? true;
  if (opts.url) {
    const db = drizzleNeon(neon(opts.url), { schema });
    if (migrate) await migrateNeon(db, { migrationsFolder: findMigrations() });
    return db as unknown as Db;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  if (opts.dataDir) mkdirSync(dirname(opts.dataDir), { recursive: true }); // PGlite creates the folder but not its parent
  const db = drizzlePglite(new PGlite(opts.dataDir), { schema });
  if (migrate) await migratePglite(db, { migrationsFolder: findMigrations() });
  return db as unknown as Db;
}

export { schema };
