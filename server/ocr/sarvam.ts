/**
 * Sarvam document reading.
 *
 * UNVERIFIED AGAINST THE LIVE API. Sarvam's document API is job based (submit, wait, download). The path names,
 * field names and response keys below are my best reading of its public description and could not be checked from
 * the environment this was written in. Everything specific to Sarvam is in CONTRACT so one edit fixes it.
 * Run `npm run sarvam:check -- <file>` with a real SARVAM_API_KEY to see what the API actually returns.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { OcrUnavailable, type OcrProvider } from './provider';

export const CONTRACT = {
  base: 'https://api.sarvam.ai',
  keyHeader: 'api-subscription-key',
  submit: '/doc-ai/v1/job/digitise',
  status: (id: string) => `/doc-ai/v1/job/${id}`,
  download: (id: string) => `/doc-ai/v1/job/${id}/download`,
  fileField: 'file',
  jobId: (b: Record<string, unknown>) => String(b.job_id ?? b.id ?? ''),
  state: (b: Record<string, unknown>) => String(b.job_state ?? b.status ?? b.state ?? '').toLowerCase(),
  done: ['completed', 'complete', 'succeeded', 'success', 'done'],
  failed: ['failed', 'error', 'cancelled'],
  downloadUrl: (b: Record<string, unknown>) => String(b.download_url ?? b.url ?? ''),
};

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
    form.append(CONTRACT.fileField, new Blob([new Uint8Array(bytes)], { type: mime }), mime === 'application/pdf' ? 'document.pdf' : 'document');
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
      await new Promise(r => setTimeout(r, this.o.pollMs ?? 1500));
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
