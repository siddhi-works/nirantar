/**
 * Sarvam translation and speech.
 *
 * Written from Sarvam's published reference (translate: POST /translate; speech: POST /text-to-speech, whose language
 * field is `language_code`). Not yet run with a live key. Everything specific to Sarvam is in
 * CONTRACT. Run `npm run sarvam:check -- translate "text"` or `-- speak "text"` with a real SARVAM_API_KEY to see
 * what the API actually returns, then correct CONTRACT in one place.
 */
import { LanguageUnavailable, type Lang, type Speaker, type Translator } from './provider';

export const CONTRACT = {
  base: 'https://api.sarvam.ai',
  keyHeader: 'api-subscription-key',
  translatePath: '/translate',
  translateBody: (text: string, target: Lang) => ({ input: text, source_language_code: 'en-IN', target_language_code: target, model: 'mayura:v1', mode: 'formal' }),
  translated: (b: Record<string, unknown>) => (typeof b.translated_text === 'string' ? b.translated_text : ''),
  speechPath: '/text-to-speech',
  speechBody: (text: string, lang: Lang) => ({ text, language_code: lang, model: 'bulbul:v3', speaker: 'ritu' }),
  audio: (b: Record<string, unknown>) => (Array.isArray(b.audios) && typeof b.audios[0] === 'string' ? (b.audios[0] as string) : ''),
  speechMime: 'audio/wav',
};

interface Options { key: string; fetchImpl?: typeof fetch }

async function post(o: Options, path: string, body: unknown): Promise<Record<string, unknown>> {
  const f = o.fetchImpl ?? fetch;
  const res = await f(CONTRACT.base + path, { method: 'POST', headers: { 'content-type': 'application/json', [CONTRACT.keyHeader]: o.key }, body: JSON.stringify(body) });
  if (!res.ok) throw new LanguageUnavailable(`The language service answered ${res.status}.`);
  return (await res.json()) as Record<string, unknown>;
}

export class SarvamTranslator implements Translator {
  readonly name = 'sarvam';
  constructor(private o: Options) {}
  async translate(texts: string[], target: Lang): Promise<string[]> {
    return Promise.all(texts.map(async t => {
      const out = CONTRACT.translated(await post(this.o, CONTRACT.translatePath, CONTRACT.translateBody(t, target)));
      if (!out) throw new LanguageUnavailable('The language service returned no translation.');
      return out;
    }));
  }
}

export class SarvamSpeaker implements Speaker {
  readonly name = 'sarvam';
  constructor(private o: Options) {}
  async speak(text: string, lang: Lang) {
    const audio = CONTRACT.audio(await post(this.o, CONTRACT.speechPath, CONTRACT.speechBody(text, lang)));
    if (!audio) throw new LanguageUnavailable('The language service returned no audio.');
    return { audio, mime: CONTRACT.speechMime };
  }
}
