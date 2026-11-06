import { GLOBAL } from './auth/ratelimit';
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, P1_ABHA, type Harness } from './test-utils';
import { CONTRACT, SarvamSpeaker, SarvamTranslator } from './language/sarvam';
import type { Speaker, Translator } from './language/provider';

let calls = 0;
const translator: Translator = { name: 'stand-in', translate: async (t, target) => { calls += t.length; return t.map(x => `[${target}] ${x}`); } };
const speaker: Speaker = { name: 'stand-in', speak: async (text, lang) => ({ audio: Buffer.from(`${lang}:${text}`).toString('base64'), mime: 'audio/wav' }) };

let h: Harness; let bare: Harness;
beforeAll(async () => { h = await setup({ translator, speaker }); bare = await setup(); }, 60_000);

describe('translation', () => {
  it('needs a session', async () => { expect((await h.post('/translate', { texts: ['hello'], target: 'hi-IN' })).status).toBe(401); });

  it('translates once and answers repeats from the cache', async () => {
    const p = await h.patient(P1_ABHA);
    const a = await (await h.post('/translate', { texts: ['No polyuria.', 'Clinically stable.'], target: 'hi-IN' }, p)).json();
    expect(a.items).toEqual(['[hi-IN] No polyuria.', '[hi-IN] Clinically stable.']);
    const before = calls;
    const b = await (await h.post('/translate', { texts: ['Clinically stable.', 'No polyuria.', 'Clinically stable.'], target: 'hi-IN' }, p)).json();
    expect(b.items).toEqual(['[hi-IN] Clinically stable.', '[hi-IN] No polyuria.', '[hi-IN] Clinically stable.']);
    expect(calls).toBe(before); // nothing was sent again
  });

  it('says plainly when no language service is connected, unless the answer is already cached', async () => {
    const p = await bare.patient(P1_ABHA);
    const r = await bare.post('/translate', { texts: ['hello'], target: 'hi-IN' }, p);
    expect(r.status).toBe(501);
    expect((await r.json()).error).toBe('not_configured');
  });

  it('refuses oversized, empty or unsupported requests', async () => {
    const p = await h.patient(P1_ABHA);
    expect((await h.post('/translate', { texts: ['x'.repeat(501)], target: 'hi-IN' }, p)).status).toBe(400);
    expect((await h.post('/translate', { texts: [], target: 'hi-IN' }, p)).status).toBe(400);
    expect((await h.post('/translate', { texts: Array(21).fill('a'), target: 'hi-IN' }, p)).status).toBe(400);
    expect((await h.post('/translate', { texts: ['a'], target: 'fr-FR' }, p)).status).toBe(400);
  });

  it('does not leak a service failure', async () => {
    const broken = await setup({ translator: { name: 'x', translate: async () => { throw new Error('secret key abc123 rejected'); } } });
    const r = await broken.post('/translate', { texts: ['hello'], target: 'hi-IN' }, await broken.patient(P1_ABHA));
    expect(r.status).toBe(502);
    expect(JSON.stringify(await r.json())).not.toContain('abc123');
  });

  it('limits how much one person can send', async () => {
    const lim = await setup({ translator });
    const p = await lim.patient(P1_ABHA);
    let last = 0;
    for (let i = 0; i < 205; i++) last = (await lim.post('/translate', { texts: [`line ${i}`], target: 'hi-IN' }, p)).status;
    expect(last).toBe(429);
  });
});

describe('limits for everyone together', () => {
  it('stop all visitors combined from spending the translation credits', async () => {
    const lone = await setup({ translator });
    const people = [await lone.doctor('abababababab'), await lone.nurse('bcbcbcbcbcbc'), await lone.doctor('cdcdcdcdcdcd'), await lone.nurse('dededededede')];
    let last = 0; let served = 0;
    for (let i = 0; i < GLOBAL.translate + 10 && last !== 429; i++) {
      last = (await lone.post('/translate', { texts: [`unique line ${i}`], target: 'hi-IN' }, people[i % people.length])).status;
      if (last === 200) served++;
    }
    expect(last).toBe(429);
    expect(served).toBe(GLOBAL.translate);
  }, 120_000);
});

describe('speech', () => {
  it('returns audio, and tells the browser to use its own voice when no service is connected', async () => {
    const p = await h.patient(P1_ABHA);
    const ok = await (await h.post('/speech', { text: 'Namaste', lang: 'hi-IN' }, p)).json();
    expect(Buffer.from(ok.audio, 'base64').toString()).toBe('hi-IN:Namaste');
    expect((await bare.post('/speech', { text: 'Namaste', lang: 'hi-IN' }, await bare.patient(P1_ABHA))).status).toBe(501);
    expect((await h.post('/speech', { text: 'x'.repeat(801), lang: 'hi-IN' }, p)).status).toBe(400);
    expect((await h.post('/speech', { text: 'hi' , lang: 'fr-FR' }, p)).status).toBe(400);
    expect((await h.post('/speech', { text: 'hi', lang: 'hi-IN' })).status).toBe(401);
  });
});

describe('Sarvam adapters (against a stand-in, not the live service)', () => {
  const f = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  it('translate: sends the key and the text, returns the translation', async () => {
    let seen: { headers: Headers; body: Record<string, unknown> } | null = null;
    const spy = (async (_u: RequestInfo | URL, init?: RequestInit) => { seen = { headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) }; return new Response(JSON.stringify({ translated_text: 'नमस्ते' })); }) as typeof fetch;
    expect(await new SarvamTranslator({ key: 'k', fetchImpl: spy }).translate(['Hello'], 'hi-IN')).toEqual(['नमस्ते']);
    expect(seen!.headers.get(CONTRACT.keyHeader)).toBe('k');
    expect(seen!.body).toMatchObject({ input: 'Hello', target_language_code: 'hi-IN' });
  });
  it('reports an error status or an empty answer as a plain failure', async () => {
    await expect(new SarvamTranslator({ key: 'k', fetchImpl: f({}, 500) }).translate(['x'], 'hi-IN')).rejects.toThrow(/answered 500/);
    await expect(new SarvamTranslator({ key: 'k', fetchImpl: f({}) }).translate(['x'], 'hi-IN')).rejects.toThrow(/no translation/);
    await expect(new SarvamSpeaker({ key: 'k', fetchImpl: f({}) }).speak('x', 'hi-IN')).rejects.toThrow(/no audio/);
    expect(await new SarvamSpeaker({ key: 'k', fetchImpl: f({ audios: ['QUJD'] }) }).speak('x', 'hi-IN')).toEqual({ audio: 'QUJD', mime: 'audio/wav' });
  });
});
