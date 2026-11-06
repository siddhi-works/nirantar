import { logError } from './log';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { documents, observations } from './db/schema';
import type { FileStore } from './files';
import { pdfPages, MIN_TEXT } from './extract/text';
import { extractValues } from './extract/values';
import { OcrUnavailable, type OcrProvider } from './ocr/provider';
import { todayIST } from './time';
import { GLOBAL, countRequests, record } from './auth/ratelimit';
import { identityCheck } from './identity';
import { REG_ID, registeredPatient } from './registry';
import { patients } from './db/schema';
import { patientOf } from './ctx';
import { baseOf } from './seed';

/** A document that is not this patient's. It is turned away with a plain reason, not logged as a failure. */
class DocumentRejected extends Error {}

async function whoOwns(db: Db, scoped: string): Promise<{ name: string; abha: string } | null> {
  const id = baseOf(scoped);
  if (REG_ID.test(id)) { const r = await registeredPatient(db, id); return r ? { name: r.name, abha: r.abha } : null; }
  const [row] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  const p = patientOf(id);
  return row && p ? { name: p.name, abha: row.abha } : null;
}

const today = () => todayIST();

export const NEEDS_OCR_MESSAGE = 'This file is a scan or a photo, and reading it needs the document reading service, which is not connected. A PDF with selectable text can be read without it.';

/**
 * Reads one uploaded document: the PDF's own text layer when it has one, the reading service otherwise.
 * Everything found is stored as `extracted` and counts for nothing until a person confirms it.
 */
export async function processDocument(deps: { db: Db; files: FileStore; ocr?: OcrProvider }, docId: string): Promise<void> {
  const { db, files, ocr } = deps;
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
  if (!doc) return;
  await db.update(documents).set({ status: 'running' }).where(eq(documents.id, docId));
  try {
    const bytes = await files.get(doc.id);
    if (!bytes) throw new Error('The stored file is missing.');

    let pages: string[] = [];
    let method: 'text-layer' | 'ocr' = 'text-layer';
    if (doc.mime === 'application/pdf') {
      try { pages = await pdfPages(bytes); } catch { pages = []; }
    }
    if (!pages.some(p => p.trim().length >= MIN_TEXT)) {
      if (!ocr) throw new OcrUnavailable(NEEDS_OCR_MESSAGE);
      if (await countRequests(db, 'ocr:*') >= GLOBAL.ocr) throw new OcrUnavailable('The reading service is busy. Try again in a few minutes.');
      await record(db, 'ocr:*', true);
      method = 'ocr';
      pages = await ocr.recognise(bytes, doc.mime);
    }

    // Strict acceptance: a document that names another person or another ABHA number is never added to this record.
    const owner = await whoOwns(db, doc.patientId);
    const who = owner ? identityCheck(pages, owner) : ({ ok: true } as const);
    if (!who.ok) throw new DocumentRejected(who.reason);

    const existing = await db.select().from(observations).where(eq(observations.patientId, doc.patientId));
    // Only values that already count suppress a repeat. A pending value from another upload must not hide this one.
    const known = new Set(existing.filter(o => o.status === 'verified' || o.status === 'corrected').map(o => `${o.code}|${o.valueNum ?? o.valueText}|${o.obsDate}`));
    const rows: (typeof observations.$inferInsert)[] = [];
    pages.forEach((text, i) => {
      for (const c of extractValues(text, i + 1)) {
        const date = c.date ?? today();
        const key = `${c.code}|${c.value}|${date}`;
        if (known.has(key)) continue; // the same value on the same date is already on record and confirmed
        known.add(key);
        rows.push({
          id: randomUUID(), patientId: doc.patientId, code: c.code, valueNum: typeof c.value === 'number' ? c.value : null, valueText: typeof c.value === 'string' ? c.value : null,
          obsDate: date, origin: 'upload', documentId: doc.id, page: i + 1, sourceText: c.quote, flagged: c.flagged ?? null,
          status: 'extracted', byUserId: 'system', byLabel: 'Document reader',
        });
      }
    });
    if (rows.length) await db.insert(observations).values(rows.slice(0, 60));
    await db.update(documents).set({ status: 'done', method, pages: pages.length, completedAt: new Date(), error: null }).where(eq(documents.id, docId));
  } catch (e) {
    const known = e instanceof OcrUnavailable || e instanceof DocumentRejected;
    const message = known ? (e as Error).message : 'This file could not be read.';
    if (!known) logError(`document ${docId} processing failed`, e);
    await db.update(documents).set({ status: 'failed', error: message, completedAt: new Date() }).where(and(eq(documents.id, docId)));
  }
}
