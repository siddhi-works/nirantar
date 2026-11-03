/**
 * Live check of the Sarvam adapters. Usage, with SARVAM_API_KEY set:
 *   npm run sarvam:check -- path/to/scan.pdf        document reading
 *   npm run sarvam:check -- translate "Hello"       translation to Hindi
 *   npm run sarvam:check -- speak "Hello"           speech (prints the size of the audio)
 * Prints what the API returned so CONTRACT in server/ocr/sarvam.ts and server/language/sarvam.ts can be corrected in one place.
 */
import { readFileSync } from 'node:fs';
import { CONTRACT, SarvamOcr } from '../server/ocr/sarvam';
import { sniff } from '../server/files';
import { CONTRACT as LANG, SarvamSpeaker, SarvamTranslator } from '../server/language/sarvam';

const key = process.env.SARVAM_API_KEY;
const file = process.argv[2];
if (!key || !file) { console.error('Set SARVAM_API_KEY and pass a PDF or image path, or: translate "text" / speak "text".'); process.exit(1); }

if (file === 'translate' || file === 'speak') {
  const text = process.argv[3] ?? 'Your blood sugar is under control.';
  const traced = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, init);
    const copy = res.clone();
    console.log(`${init?.method ?? 'GET'} ${String(input).replace(LANG.base, '')} -> ${res.status} ${(await copy.text()).slice(0, 300)}`);
    return res;
  };
  const run = file === 'translate'
    ? new SarvamTranslator({ key, fetchImpl: traced as typeof fetch }).translate([text], 'hi-IN').then(o => console.log('\nOK:', o[0]))
    : new SarvamSpeaker({ key, fetchImpl: traced as typeof fetch }).speak(text, 'hi-IN').then(o => console.log(`\nOK: ${o.audio.length} base64 characters of ${o.mime}`));
  run.catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
} else {
const bytes = new Uint8Array(readFileSync(file));
const mime = sniff(bytes);
if (!mime) { console.error('The file is not a PDF, JPEG or PNG.'); process.exit(1); }

const traced: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const copy = res.clone();
  const ct = copy.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? JSON.stringify(await copy.json()).slice(0, 300) : `${ct} (${(await copy.arrayBuffer()).byteLength} bytes)`;
  console.log(`${init?.method ?? 'GET'} ${String(input).replace(CONTRACT.base, '')} -> ${res.status} ${body}`);
  return res;
};
new SarvamOcr({ key, fetchImpl: traced }).recognise(bytes, mime).then(
  pages => { console.log(`\nOK: ${pages.length} page(s). First 300 characters:\n${pages[0].slice(0, 300)}`); },
  e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); },
);
}
