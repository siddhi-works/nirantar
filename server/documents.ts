import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { documents, observations } from './db/schema';
import type { FileStore } from './files';
import { pdfPages, MIN_TEXT } from './extract/text';
import { extractValues } from './extract/values';
import { OcrUnavailable, type OcrProvider } from './ocr/provider';
import { todayIST } from './time';

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
      method = 'ocr';
      pages = await ocr.recognise(bytes, doc.mime);
    }

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
    const message = e instanceof OcrUnavailable ? e.message : 'This file could not be read.';
    if (!(e instanceof OcrUnavailable)) console.error('document processing failed', docId, e);
    await db.update(documents).set({ status: 'failed', error: message, completedAt: new Date() }).where(and(eq(documents.id, docId)));
  }
}
