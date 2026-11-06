import { api } from '@/api';
import { HI } from './hi';
import { LANGS, useLang } from './index';

/**
 * Hindi for the whole page, whatever screen is open. Every piece of English text and every placeholder, title and
 * label on the page is looked up in the Hindi dictionary; anything not there is translated by the server (cached for
 * everyone, English until it arrives). Switching back to English puts every original back.
 *
 * Left alone on purpose: anything marked translate="no", form values, and text with no real words in it (ids,
 * numbers, units, single drug or test names), so a medicine name or a value is never rewritten by a translator.
 */

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP = 'script,style,textarea,input,code,[translate="no"]';
const LETTERS = /[A-Za-z]{3}/;

const cache = new Map<string, string>(); // English -> Hindi, from the server
const asked = new Set<string>();
let off = 0; // translation service not connected or busy: no more requests until this time
let timer: number | undefined;
let observer: MutationObserver | null = null;

const original = new WeakMap<Node, string>();                        // text node -> its English
const shown = new WeakMap<Node, string>();                           // text node -> the Hindi last written
const attrOriginal = new WeakMap<Element, Record<string, string>>(); // element -> English attribute values
const tracked = new Set<WeakRef<Node>>();

const wordy = (s: string) => LETTERS.test(s) && (/\s/.test(s) || s in HI || DATE.test(s));

const MONTHS: Record<string, string> = { Jan: 'जनवरी', Feb: 'फ़रवरी', Mar: 'मार्च', Apr: 'अप्रैल', May: 'मई', Jun: 'जून', Jul: 'जुलाई', Aug: 'अगस्त', Sep: 'सितंबर', Oct: 'अक्टूबर', Nov: 'नवंबर', Dec: 'दिसंबर' };
const DAYS: Record<string, string> = { Mon: 'सोमवार', Tue: 'मंगलवार', Wed: 'बुधवार', Thu: 'गुरुवार', Fri: 'शुक्रवार', Sat: 'शनिवार', Sun: 'रविवार' };
const DATE = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s*)?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})$/;
const DATE_ANYWHERE = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})\b/g;
const PREFIXES: [string, string][] = [['Open source: ', 'स्रोत खोलें: '], ['Searched ', 'खोजा गया ']];

/** A date on its own is turned into Hindi here (the server is not asked about every date on the page). */
function dateInHindi(s: string): string | undefined {
  const m = DATE.exec(s);
  return m ? `${m[1] ? DAYS[m[1]] + ', ' : ''}${m[2]} ${MONTHS[m[3]]} ${m[4]}` : undefined;
}

function lookup(english: string): string | undefined {
  const visit = /^Visit (\d+)(?:, (.+))?$/.exec(english); // "Visit 5, 3 Dec 2027"
  if (visit) { const when = visit[2] ? dateInHindi(visit[2]) : ''; if (when !== undefined) return `विज़िट ${visit[1]}${when ? ', ' + when : ''}`; }
  const known = HI[english] ?? dateInHindi(english) ?? cache.get(english);
  if (known !== undefined) return known;
  const inline = english.replace(DATE_ANYWHERE, (_m, d: string, mo: string, y: string) => `${d} ${MONTHS[mo]} ${y}`); // a Hindi sentence that only has a date left in English
  if (inline !== english && !LETTERS.test(inline)) return inline;
  for (const [en, hi] of PREFIXES) if (english.startsWith(en) && english.length > en.length) { const rest = lookup(english.slice(en.length)); if (rest !== undefined) return hi + rest; }
  return undefined;
}

function want(english: string) {
  if (english.length > 480 || asked.has(english) || cache.has(english)) return;
  asked.add(english);
  clearTimeout(timer);
  timer = window.setTimeout(flush, 120);
}

function flush() {
  if (Date.now() < off) return;
  const batch = [...asked].filter(s => !cache.has(s)).slice(0, 20);
  if (!batch.length) return;
  batch.forEach(s => asked.delete(s));
  api.translate(batch, 'hi-IN').then(items => {
    if (!items) { off = Date.now() + 10 * 60_000; return; }
    batch.forEach((s, i) => cache.set(s, items[i]));
    if (useLang.getState().lang === 'hi') scan(document.body);
    if (asked.size) flush();
  }, () => { off = Date.now() + 60_000; });
}

function fixText(node: Text) {
  const now = node.nodeValue ?? '';
  if (shown.get(node) === now) return; // our own change
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const trimmed = now.trim();
  if (!wordy(trimmed)) return;
  const hi = lookup(trimmed);
  original.set(node, now);
  if (hi === undefined) { want(trimmed); return; }
  const out = now.replace(trimmed, hi);
  shown.set(node, out);
  node.nodeValue = out;
  tracked.add(new WeakRef(node));
}

function fixAttrs(el: Element) {
  if (el.closest('[translate="no"]')) return;
  for (const attr of ATTRS) {
    const v = el.getAttribute(attr);
    if (!v) continue;
    const saved = attrOriginal.get(el);
    if (saved && saved[attr] !== undefined && v === (lookup(saved[attr]) ?? saved[attr])) continue; // already ours
    const t = v.trim();
    if (!wordy(t)) continue;
    const hi = lookup(t);
    attrOriginal.set(el, { ...(saved ?? {}), [attr]: v });
    if (hi === undefined) continue; // attributes only use the dictionary, never the server
    el.setAttribute(attr, hi);
    tracked.add(new WeakRef(el));
  }
}

function scan(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { fixText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const el0 = root as Element;
  fixAttrs(el0);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) fixText(n as Text); else fixAttrs(n as Element);
  }
}

function restore() {
  for (const ref of tracked) {
    const n = ref.deref();
    if (!n) { tracked.delete(ref); continue; }
    if (n.nodeType === Node.TEXT_NODE) { const o = original.get(n); if (o !== undefined && n.nodeValue === shown.get(n)) n.nodeValue = o; shown.delete(n); }
    else { const el = n as Element; const o = attrOriginal.get(el); if (o) for (const [a, v] of Object.entries(o)) el.setAttribute(a, v); attrOriginal.delete(el); }
  }
  tracked.clear();
}

function start() {
  if (observer) return;
  document.documentElement.lang = 'hi';
  scan(document.body);
  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') scan(r.target);
      else if (r.type === 'attributes') fixAttrs(r.target as Element);
      else r.addedNodes.forEach(scan);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

function stop() {
  observer?.disconnect(); observer = null;
  restore();
}

/** Call once at start-up. Follows the language choice from then on. */
export function installPageTranslation() {
  const apply = (lang: string) => { if (lang === LANGS[1].code) start(); else stop(); };
  apply(useLang.getState().lang);
  useLang.subscribe(s => apply(s.lang));
}

export const _test = { lookup, wordy };
