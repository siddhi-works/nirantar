import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const candidates = [fileURLToPath(new URL('./assets/originals/', import.meta.url)), join(process.cwd(), 'server/assets/originals') + '/', '/var/task/server/assets/originals/'];
const dir = candidates.find(c => existsSync(c)) ?? candidates[0];

/** Original follow-up PDFs. A private store (S3-compatible) replaces this when uploads arrive. */
export async function originalPdf(patientId: string): Promise<Uint8Array | null> {
  const m = /^P(\d+)$/.exec(patientId);
  if (!m) return null;
  try { return await readFile(`${dir}patient-${m[1]}-followups.pdf`); } catch { return null; }
}
