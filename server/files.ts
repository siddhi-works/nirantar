import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { fileBlobs } from './db/schema';

/** Where uploaded files are kept. The Postgres store below is the only implementation; an object store replaces it. */
export interface FileStore {
  put(id: string, bytes: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | null>;
}

export const dbFileStore = (db: Db): FileStore => ({
  async put(id, bytes) { await db.insert(fileBlobs).values({ id, data: Buffer.from(bytes).toString('base64') }); },
  async get(id) {
    const [r] = await db.select().from(fileBlobs).where(eq(fileBlobs.id, id)).limit(1);
    return r ? new Uint8Array(Buffer.from(r.data, 'base64')) : null;
  },
});

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // stays under the 4.5 MB request limit of serverless hosts

/** Decide the type from the file's own first bytes, never from its name or the type the browser claims. */
export function sniff(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  const at = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (at(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  if (at(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  return null;
}
