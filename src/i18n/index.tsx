import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { api } from '@/api';
import { HI } from './hi';

export type Lang = 'en' | 'hi';
export const LANGS: { code: Lang; label: string; bcp: string; server: 'hi-IN' | null }[] = [
  { code: 'en', label: 'English', bcp: 'en-IN', server: null },
  { code: 'hi', label: 'हिन्दी', bcp: 'hi-IN', server: 'hi-IN' },
];
export const bcpOf = (l: Lang) => LANGS.find(x => x.code === l)!.bcp;

const KEY = 'nirantar-lang';
const stored = (): Lang => { try { const v = localStorage.getItem(KEY); return v === 'hi' ? 'hi' : 'en'; } catch { return 'en'; } };

const applyLang = (l: Lang) => { try { document.documentElement.lang = l; } catch { /* no document, nothing to set */ } };

interface LangState { lang: Lang; setLang: (l: Lang) => void; tick: number }
export const useLang = create<LangState>(set => ({
  lang: stored(), tick: 0,
  setLang: lang => { try { localStorage.setItem(KEY, lang); } catch { /* a remembered choice is a convenience only */ } applyLang(lang); set({ lang }); },
}));
applyLang(stored());

type Vars = Record<string, string | number>;
const fill = (s: string, vars?: Vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''));

/** Fixed text: the Hindi dictionary, or the English sentence itself when there is no entry. */
export const translate = (s: string, lang: Lang, vars?: Vars) => fill(lang === 'hi' ? HI[s] ?? s : s, vars);

export function useT() {
  const lang = useLang(s => s.lang);
  return (s: string, vars?: Vars) => translate(s, lang, vars);
}

/* ───────── text that comes from the record: translated by the server, cached, English until it arrives ───────── */

const cache = new Map<string, string>();
const pending = new Set<string>();
let unavailableUntil = 0;
let scheduled = false;

function flush(lang: Lang) {
  scheduled = false;
  const target = LANGS.find(l => l.code === lang)?.server;
  const batch = [...pending].slice(0, 20);
  batch.forEach(b => pending.delete(b));
  if (!target || !batch.length || Date.now() < unavailableUntil) return;
  api.translate(batch, target).then(items => {
    if (!items) { unavailableUntil = Date.now() + 10 * 60_000; return; } // no service connected: stay in English
    batch.forEach((b, i) => cache.set(`${lang}|${b}`, items[i]));
    useLang.setState(s => ({ tick: s.tick + 1 }));
  }, () => { unavailableUntil = Date.now() + 60_000; });
  if (pending.size) { scheduled = true; setTimeout(() => flush(lang), 0); }
}

export function useTranslated(text: string): string {
  const lang = useLang(s => s.lang);
  useLang(s => s.tick);
  useEffect(() => {
    if (lang === 'en' || !text || HI[text] || cache.has(`${lang}|${text}`)) return;
    pending.add(text);
    if (!scheduled) { scheduled = true; setTimeout(() => flush(lang), 0); }
  }, [lang, text]);
  if (lang === 'en') return text;
  return HI[text] ?? cache.get(`${lang}|${text}`) ?? text;
}

export function Tx({ text }: { text: string }) { return <>{useTranslated(text)}</>; }

/* ───────── read aloud ───────── */

let audio: HTMLAudioElement | null = null;
let run = 0; // a new run, or a stop, makes any speech still in progress give up
export function stopSpeaking() {
  run++;
  try { audio?.pause(); audio = null; window.speechSynthesis?.cancel(); } catch { /* nothing is playing */ }
}

/** Short pieces, so the first one can start playing while the others are still being made. */
export function speechChunks(text: string, max = 220): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?।])\s+/).map(x => x.trim()).filter(Boolean)) {
    const last = out.length - 1;
    if (last >= 0 && out[last].length < 40 && out[last].length + sentence.length < max) out[last] += ' ' + sentence;
    else out.push(sentence);
  }
  return out.flatMap(c => {
    if (c.length <= max) return [c];
    const parts: string[] = [];
    for (const piece of c.split(/(?<=[,;:])\s+/)) {
      if (parts.length && parts[parts.length - 1].length + piece.length < max) parts[parts.length - 1] += ' ' + piece; else parts.push(piece);
    }
    return parts;
  }).slice(0, 8);
}

type Clip = { audio: string; mime: string } | null;
const clips = new Map<string, Promise<Clip>>(); // the same sentence is only asked for once
const clip = (text: string, bcp: string): Promise<Clip> => {
  const key = `${bcp}|${text}`;
  let p = clips.get(key);
  if (!p) { p = api.speech(text, bcp as 'hi-IN' | 'en-IN').catch(() => null); clips.set(key, p); p.then(v => { if (!v) clips.delete(key); }); }
  return p;
};

const playClip = (c: { audio: string; mime: string }) => new Promise<void>(resolve => {
  audio = new Audio(`data:${c.mime};base64,${c.audio}`);
  audio.onended = () => resolve(); audio.onerror = () => resolve();
  audio.play().catch(() => resolve());
});

const browserVoice = (text: string, bcp: string) => new Promise<void>(resolve => {
  const synth = window.speechSynthesis;
  if (!synth) return resolve();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp;
  u.onend = () => resolve(); u.onerror = () => resolve();
  synth.speak(u);
});

/**
 * Server speech when a service is connected, the browser's own voice otherwise. The text is cut into sentences that
 * are all requested at once; the first one starts playing as soon as it is ready. Resolves when it has finished.
 */
export async function speak(text: string, lang: Lang): Promise<void> {
  stopSpeaking();
  const mine = run;
  const bcp = bcpOf(lang);
  const pieces = speechChunks(text);
  const pending = pieces.map(p => clip(p, bcp));
  for (let i = 0; i < pieces.length; i++) {
    const c = await pending[i];
    if (mine !== run) return;
    if (c) await playClip(c);
    else await browserVoice(pieces.slice(i).join(' '), bcp).then(() => { i = pieces.length; }); // no service: the browser reads the rest
    if (mine !== run) return;
  }
}

/** Hook-friendly flag so a button can show "Stop" while speech plays. */
export function useSpeaking() {
  const [on, setOn] = useState(false);
  return { on, run: async (text: string, lang: Lang) => { setOn(true); try { await speak(text, lang); } finally { setOn(false); } }, stop: () => { stopSpeaking(); setOn(false); } };
}
