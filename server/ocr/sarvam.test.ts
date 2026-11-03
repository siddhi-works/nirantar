import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { CONTRACT, SarvamOcr } from './sarvam';
import { OcrUnavailable } from './provider';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const zip = () => new Response(zipSync({ 'page-2.md': strToU8('FBS 150'), 'page-10.md': strToU8('HbA1c 7.0'), 'page-1.md': strToU8('BP 120/80'), 'readme.bin': strToU8('x') }));

function fake(states: string[]): { f: typeof fetch; calls: string[]; keys: (string | null)[] } {
  const calls: string[] = []; const keys: (string | null)[] = []; let i = 0;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? 'GET'} ${url.replace(CONTRACT.base, '')}`);
    keys.push(new Headers(init?.headers).get(CONTRACT.keyHeader));
    if (url.endsWith(CONTRACT.submit)) return json({ job_id: 'J1' });
    if (url.endsWith(CONTRACT.status('J1'))) return json({ job_state: states[Math.min(i++, states.length - 1)] });
    if (url.endsWith(CONTRACT.download('J1'))) return json({ download_url: 'https://files.example/out.zip' });
    if (url === 'https://files.example/out.zip') return zip();
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls, keys };
}

describe('Sarvam adapter (against a stand-in for the API, not the live service)', () => {
  it('submits, waits for completion, downloads and returns pages in natural order', async () => {
    const { f, calls, keys } = fake(['Running', 'Running', 'Completed']);
    const pages = await new SarvamOcr({ key: 'k', fetchImpl: f, pollMs: 1 }).recognise(new Uint8Array([1, 2, 3]), 'application/pdf');
    expect(pages).toEqual(['BP 120/80', 'FBS 150', 'HbA1c 7.0']);
    expect(calls.filter(c => c.endsWith(CONTRACT.status('J1'))).length).toBe(3);
    expect(keys[0]).toBe('k');
  });

  it('reports a failed job as a plain message', async () => {
    const { f } = fake(['Failed']);
    await expect(new SarvamOcr({ key: 'k', fetchImpl: f, pollMs: 1 }).recognise(new Uint8Array([1]), 'image/png')).rejects.toThrow(/could not read/);
  });

  it('gives up after the time limit', async () => {
    const { f } = fake(['Running']);
    await expect(new SarvamOcr({ key: 'k', fetchImpl: f, pollMs: 5, timeoutMs: 30 }).recognise(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(OcrUnavailable);
  });

  it('does not leak the service\'s error body', async () => {
    const f = (async () => new Response('secret internal detail', { status: 500 })) as typeof fetch;
    const err = await new SarvamOcr({ key: 'k', fetchImpl: f }).recognise(new Uint8Array([1]), 'image/png').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('The reading service answered 500.');
  });
});
