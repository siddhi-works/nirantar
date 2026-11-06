/**
 * Sarvam document reading (Document AI "parse"), written from Sarvam's published reference
 * (docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/how-to/parse). Not yet run with a live key:
 * if a real upload fails, `npm run sarvam:check -- <file>` prints what the API returned, and everything specific
 * to Sarvam is in CONTRACT so one edit fixes it.
 *
 * Flow: POST parse (file, language, output_format) -> job_id; poll GET /{id}/status; GET /{id}/download-url -> a
 * link to a ZIP (no key needed for that link) holding one Markdown file for the whole document.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { OcrUnavailable, type OcrProvider } from './provider';

export const CONTRACT = {
  base: 'https://api.sarvam.ai',
  keyHeader: 'api-subscription-key',
  submit: '/doc-ai/v1/job/parse',
  status: (id: string) => `/doc-ai/v1/job/${id}/status`,
  download: (id: string) => `/doc-ai/v1/job/${id}/download-url`,
  fileField: 'file',
  language: 'en-IN', // slips are written in English; Sarvam asks for the right code for best accuracy
  jobId: (b: Record<string, unknown>) => String(b.job_id ?? ''),
  state: (b: Record<string, unknown>) => String(b.status ?? '').toLowerCase(),
  done: ['completed', 'partially_completed'],
  failed: ['failed', 'rejected'],
  downloadUrl: (b: Record<string, unknown>) => String(b.url ?? ''),
};

const FILE_NAME: Record<string, string> = { 'application/pdf': 'document.pdf', 'image/jpeg': 'document.jpg', 'image/png': 'document.png' };

export interface SarvamOptions { key: string; fetchImpl?: typeof fetch; pollMs?: number; timeoutMs?: number }

export class SarvamOcr implements OcrProvider {
  readonly name = 'sarvam';
  private f: typeof fetch;
  constructor(private o: SarvamOptions) { this.f = o.fetchImpl ?? fetch; }

  private async json(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const res = await this.f(CONTRACT.base + path, { ...init, headers: { [CONTRACT.keyHeader]: this.o.key, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new OcrUnavailable(`The reading service answered ${res.status}.`);
    return (await res.json()) as Record<string, unknown>;
  }

  async recognise(bytes: Uint8Array, mime: string): Promise<string[]> {
    const form = new FormData();
    form.append(CONTRACT.fileField, new Blob([new Uint8Array(bytes)], { type: mime }), FILE_NAME[mime] ?? 'document.pdf');
    form.append('language', CONTRACT.language);
    form.append('output_format', 'md');
    const created = await this.json(CONTRACT.submit, { method: 'POST', body: form });
    const id = CONTRACT.jobId(created);
    if (!id) throw new OcrUnavailable('The reading service did not return a job.');

    const deadline = Date.now() + (this.o.timeoutMs ?? 40_000);
    for (;;) {
      const s = CONTRACT.state(await this.json(CONTRACT.status(id)));
      if (CONTRACT.done.includes(s)) break;
      if (CONTRACT.failed.includes(s)) throw new OcrUnavailable('The reading service could not read this file.');
      if (Date.now() > deadline) throw new OcrUnavailable('The reading service took too long. Try again.');
      await new Promise(r => setTimeout(r, this.o.pollMs ?? 2000));
    }
    const url = CONTRACT.downloadUrl(await this.json(CONTRACT.download(id)));
    if (!url) throw new OcrUnavailable('The reading service returned no result.');
    const zip = await this.f(url);
    if (!zip.ok) throw new OcrUnavailable('The result could not be downloaded.');
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    const pages = Object.keys(files).filter(n => /\.(md|txt|html)$/i.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!pages.length) throw new OcrUnavailable('The result held no text.');
    return pages.map(n => strFromU8(files[n]));
  }
}
