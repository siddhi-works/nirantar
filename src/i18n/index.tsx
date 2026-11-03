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

interface LangState { lang: Lang; setLang: (l: Lang) => void; tick: number }
export const useLang = create<LangState>(set => ({
  lang: stored(), tick: 0,
  setLang: lang => { try { localStorage.setItem(KEY, lang); } catch { /* a remembered choice is a convenience only */ } set({ lang }); },
}));

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
export function stopSpeaking() {
  try { audio?.pause(); audio = null; window.speechSynthesis?.cancel(); } catch { /* nothing is playing */ }
}

/** Server speech when a service is connected, the browser's own voice otherwise. Resolves when it has finished. */
export async function speak(text: string, lang: Lang): Promise<void> {
  stopSpeaking();
  const bcp = bcpOf(lang);
  const served = await api.speech(text, bcp as 'hi-IN' | 'en-IN');
  if (served) {
    await new Promise<void>(resolve => {
      audio = new Audio(`data:${served.mime};base64,${served.audio}`);
      audio.onended = () => resolve(); audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
    return;
  }
  const synth = window.speechSynthesis;
  if (!synth) return;
  await new Promise<void>(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp;
    u.onend = () => resolve(); u.onerror = () => resolve();
    synth.speak(u);
  });
}

/** Hook-friendly flag so a button can show "Stop" while speech plays. */
export function useSpeaking() {
  const [on, setOn] = useState(false);
  return { on, run: async (text: string, lang: Lang) => { setOn(true); try { await speak(text, lang); } finally { setOn(false); } }, stop: () => { stopSpeaking(); setOn(false); } };
}
