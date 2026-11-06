import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setup, P1_ABHA, P2_ABHA, type Harness } from './test-utils';
import type { OcrProvider } from './ocr/provider';
import { NEEDS_OCR_MESSAGE } from './documents';

const P2_PDF = new Uint8Array(readFileSync(new URL('./assets/originals/patient-2-followups.pdf', import.meta.url)));
const P1_PDF = new Uint8Array(readFileSync(new URL('./assets/originals/patient-1-followups.pdf', import.meta.url)));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3, 4]);
const TYPE = 'Prescription';

const ocr: OcrProvider = { name: 'stand-in', recognise: async () => ['Date 05/11/2026\nFBS 142 mg/dl  HbA1c 7.1%\nBP 128/82'] };
let h: Harness;
beforeAll(async () => { h = await setup({ ocr }); }, 60_000);
const items = async (cookie: string, pid: string) => (await (await h.get(`/patients/${pid}/observations`, cookie)).json()).items as { id: string; code: string; status: string; current: number | string; page: number; date: string; documentId: string }[];

describe('uploading a document', () => {
  it('reads a PDF\'s own text layer page by page and stores what it finds as unconfirmed', async () => {
    const nurse = await h.nurse();
    const r = await h.upload('P2', P2_PDF, 'visits.pdf', TYPE, nurse);
    expect(r.status).toBe(201);
    const doc = await r.json();
    expect(doc).toMatchObject({ status: 'done', method: 'text-layer', pages: 5, origin: 'staff', syncStatus: 'pending' });
    expect(doc.values).toBeGreaterThan(8);
    expect(doc.waiting).toBe(doc.values);

    const list = await items(nurse, 'P2');
    const fbs1 = list.find(i => i.code === 'fbs' && i.page === 1)!;
    expect(fbs1).toMatchObject({ current: 158, date: '2000-08-04', status: 'extracted' });
    expect(list.find(i => i.code === 'hba1c' && i.page === 3)!.current).toBe(6.8);

    // none of it counts yet
    const recall = await (await h.get('/patients/P2/recall', nurse)).json();
    expect(recall.facts.some((f: { id: string }) => f.id.startsWith('OB-'))).toBe(false);
  });

  it('confirming a value makes it count and ties it to the uploaded file', async () => {
    const nurse = await h.nurse();
    const list = await items(nurse, 'P2');
    const ldl = list.find(i => i.code === 'hba1c' && i.page === 3)!;
    expect((await h.post(`/patients/P2/observations/${ldl.id}/confirm`, {}, nurse)).status).toBe(200);
    const recall = await (await h.get('/patients/P2/recall', nurse)).json();
    const fact = recall.facts.find((f: { code: string; source: string }) => f.code === 'hba1c' && f.source === 'staff-entered');
    expect(fact.citation.source).toMatchObject({ kind: 'upload', documentId: ldl.documentId, status: 'verified' });
    expect(fact.citation.docId).toBe(`UP-${ldl.documentId}`);

    // it appears on the trend as a recorded point, beside the slip readings and never joined to them
    const hb = recall.trends.find((t: { code: string }) => t.code === 'hba1c');
    expect(hb.recorded).toHaveLength(1);
    expect(hb.recorded[0]).toMatchObject({ value: 6.8, date: '2000-11-04', visit: 0 });
    expect(hb.recorded[0].citation.source.kind).toBe('upload');
    expect(hb.points.map((p: { value: number | null }) => p.value)).toEqual([null, null, 6.8, 6.6, 6.5]); // slip readings untouched
    expect(hb.latest.value).toBe(6.5);
  });

  it('skips a value that is already confirmed on the same date, but not one that is only pending', async () => {
    const nurse = await h.nurse();
    const before = (await items(nurse, 'P2')).length;
    const again = await (await h.upload('P2', P2_PDF, 'visits-again.pdf', TYPE, nurse)).json();
    expect(again.status).toBe('done');
    const first = (await (await h.get('/patients/P2/documents', nurse)).json()).items.find((d: { fileName: string }) => d.fileName === 'visits.pdf');
    expect(again.values).toBe(first.values - 1); // only the HbA1c confirmed earlier is left out
    expect((await items(nurse, 'P2')).length).toBe(before + again.values);
  });

  it('serves the stored file only to someone allowed, with a locked-down content policy', async () => {
    const nurse = await h.nurse();
    const doc = (await (await h.get('/patients/P2/documents', nurse)).json()).items[0];
    const r = await h.get(`/documents/${doc.id}/file`, nurse);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-security-policy')).toBeNull(); // a policy on a PDF would block the browser's PDF viewer
    expect(new Uint8Array(await r.arrayBuffer()).length).toBe(P2_PDF.length);
    expect((await h.get(`/documents/${doc.id}/file`)).status).toBe(401);
    expect((await h.get(`/documents/${doc.id}/file`, await h.patient(P1_ABHA))).status).toBe(404);
  });

  it('refuses what is not a PDF, JPG or PNG, whatever the file is called', async () => {
    const nurse = await h.nurse();
    const r = await h.upload('P1', new TextEncoder().encode('MZ not a pdf'), 'report.pdf', TYPE, nurse);
    expect(r.status).toBe(400);
    expect((await r.json()).message).toMatch(/Only PDF/);
    expect((await h.upload('P1', new Uint8Array(), 'empty.pdf', TYPE, nurse)).status).toBe(400);
    expect((await h.upload('P1', P1_PDF, 'x.pdf', 'Not a real type', nurse)).status).toBe(400);
  });

  it('refuses a file over 4 MB', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1); big.set([0x25, 0x50, 0x44, 0x46]);
    expect((await h.upload('P1', big, 'big.pdf', TYPE, await h.nurse())).status).toBe(413);
  });

  it('refuses an upload with no origin, as a cross-site form would send', async () => {
    expect((await h.upload('P1', P1_PDF, 'x.pdf', TYPE, await h.nurse(), {})).status).toBe(403);
    expect((await h.upload('P1', P1_PDF, 'x.pdf', TYPE, await h.nurse(), { origin: 'https://evil.example', host: 'localhost' })).status).toBe(403);
  });

  it('refuses an upload into a patient the person may not open', async () => {
    expect((await h.upload('P2', P2_PDF, 'x.pdf', TYPE, await h.patient(P1_ABHA))).status).toBe(404);
  });
});

describe('scans and photos', () => {
  it('are served back under a strict sandbox policy', async () => {
    const nurse = await h.nurse();
    const doc = await (await h.upload('P1', PNG, 'shown-back.png', TYPE, nurse)).json();
    const r = await h.get(`/documents/${doc.id}/file`, nurse);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('content-security-policy')).toMatch(/sandbox/);
  });

  it('are read by the reading service when it is connected', async () => {
    const doc = await (await h.upload('P1', PNG, 'photo.png', TYPE, await h.nurse())).json();
    expect(doc).toMatchObject({ status: 'done', method: 'ocr' });
    const list = await items(await h.nurse(), 'P1');
    expect(list.find(i => i.code === 'fbs' && i.current === 142)).toMatchObject({ date: '2026-11-05', status: 'extracted' });
  });

  it('fail with a plain message when it is not, and leave no values', async () => {
    const bare = await setup(); // no reading service
    const doc = await (await bare.upload('P1', PNG, 'photo.png', TYPE, await bare.nurse())).json();
    expect(doc).toMatchObject({ status: 'failed', error: NEEDS_OCR_MESSAGE, values: 0 });
  });
});

describe('a patient\'s own upload', () => {
  it('can be edited by the patient but never counts until staff confirm the edited value', async () => {
    const patient = await h.patient(P2_ABHA);
    const doc = await (await h.upload('P2', PNG, 'my-old-slip.png', TYPE, patient)).json();
    expect(doc).toMatchObject({ origin: 'patient', status: 'done' });

    const mine = (await items(patient, 'P2')).filter(i => i.documentId === doc.id);
    expect(mine.length).toBeGreaterThan(0);
    const hb = mine.find(i => i.code === 'hba1c')!;
    expect((await h.post(`/patients/P2/observations/${hb.id}/edit`, { value: 7.0 }, patient)).status).toBe(200);
    expect((await h.post(`/patients/P2/observations/${hb.id}/edit`, { value: 700 }, patient)).status).toBe(400);
    expect((await h.post(`/patients/P2/observations/${hb.id}/confirm`, {}, patient)).status).toBe(403);

    const nurse = await h.nurse();
    const recall1 = await (await h.get('/patients/P2/recall', nurse)).json();
    expect(JSON.stringify(recall1.facts)).not.toContain(hb.id);

    expect((await h.post(`/patients/P2/observations/${hb.id}/confirm`, {}, nurse)).status).toBe(200);
    const recall2 = await (await h.get('/patients/P2/recall', nurse)).json();
    const fact = recall2.facts.find((f: { citation: { source?: { observationId: string } } }) => f.citation.source?.observationId === hb.id);
    expect(fact.value).toBe(7); // the patient's edited value, not the first reading
    expect((await h.post(`/patients/P2/observations/${hb.id}/edit`, { value: 8 }, patient)).status).toBe(409);
  });

  it('is invisible to other patients and not editable by them', async () => {
    const other = await h.patient(P1_ABHA);
    expect((await h.get('/patients/P2/observations', other)).status).toBe(404);
    const pat2 = await h.patient(P2_ABHA);
    expect((await h.get('/patients/P2/documents', pat2)).status).toBe(200);
  });
});

describe('trying a failed read again', () => {
  it('re-reads the stored file without a second upload, and only when the first read failed', async () => {
    const { OcrUnavailable } = await import('./ocr/provider');
    let calls = 0;
    const flaky: OcrProvider = { name: 'flaky', recognise: async () => { if (calls++ === 0) throw new OcrUnavailable('The reading service answered 404.'); return ['FBS 142 mg/dl  HbA1c 7.1%']; } };
    const f = await setup({ ocr: flaky });
    const nurse = await f.nurse();
    const first = await (await f.upload('P1', PNG, 'scan.png', TYPE, nurse)).json();
    expect(first).toMatchObject({ status: 'failed', error: 'The reading service answered 404.' });

    const again = await f.post(`/documents/${first.id}/retry`, {}, nurse);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ id: first.id, status: 'done', method: 'ocr' });

    // a document that was read fine cannot be "retried", and a stranger's retry finds nothing
    expect((await f.post(`/documents/${first.id}/retry`, {}, nurse)).status).toBe(409);
    expect((await f.post(`/documents/${first.id}/retry`, {}, await f.nurse('abababababab'))).status).toBe(404);
  }, 60_000);
});
