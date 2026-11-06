import { fmtDate } from '../../src/domain/format';

export interface SeriesPoint { date: string; value: number }
export interface SummaryInput {
  name: string;
  age?: number;
  sex?: 'M' | 'F' | 'O';
  /** The diagnosis as written, and when it first appears. Absent means nobody has recorded one. */
  diagnosis?: { text: string; since?: string };
  visits?: number;
  series: Partial<Record<'hba1c' | 'fbs' | 'ppbs', SeriesPoint[]>>;
  medicines: string[];
  complications: string[];
  /** Measures nobody has recorded, by their plain name. */
  missing: string[];
  advice: string[];
}
export interface Summary { text: string; words: number; sources: string[]; complete: boolean }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const plain = (s: string) => s.trim().replace(/[.;\s]+$/, '');
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const num = (v: number, unit: string, d = 0) => `${v.toFixed(d)}${unit === '%' ? '%' : ' ' + unit}`;

/**
 * A short summary written in sentences from what is on the record, and from nothing else. Anything that is absent is said to
 * be absent. It aims for 50 to 80 words and never goes over 100: sentences are added in order of importance while they fit.
 */
export function writeSummary(i: SummaryInput): Summary {
  const sources: string[] = [];
  const has = (c: 'hba1c' | 'fbs' | 'ppbs') => (i.series[c]?.length ?? 0) > 0;
  const noData = !has('hba1c') && !has('fbs') && !has('ppbs') && !i.diagnosis && !i.medicines.length;
  if (noData) {
    const text = `Unavailable: nothing has been recorded for ${i.name} yet. Needs input: record a result, or upload a document and confirm what is read from it.`;
    return { text, words: words(text), sources, complete: false };
  }

  const who = [i.age !== undefined ? `${i.age}-year-old` : null, i.sex === 'F' ? 'woman' : i.sex === 'M' ? 'man' : i.sex === 'O' ? 'person' : null].filter(Boolean).join(' ');
  const s: string[] = [];
  s.push(`${i.name}${who ? ` is a ${who}` : ''}${i.diagnosis ? ` with ${i.diagnosis.text}${i.diagnosis.since ? `, on record since ${fmtDate(i.diagnosis.since)}` : ''}${i.visits ? ` over ${i.visits} visit${i.visits === 1 ? '' : 's'}` : ''}` : ', with no diagnosis recorded (needs input)'}.`);

  const hb = i.series.hba1c ?? [];
  if (hb.length >= 2) s.push(`HbA1c went from ${num(hb[0].value, '%', 1)} (${fmtDate(hb[0].date)}) to ${num(hb.at(-1)!.value, '%', 1)} (${fmtDate(hb.at(-1)!.date)}).`);
  else if (hb.length === 1) s.push(`HbA1c is ${num(hb[0].value, '%', 1)} (${fmtDate(hb[0].date)}).`);
  else s.push('HbA1c is not recorded.');

  const f = i.series.fbs?.at(-1); const p = i.series.ppbs?.at(-1);
  if (f || p) s.push(`Latest ${[f && `fasting sugar ${num(f.value, 'mg/dL')}`, p && `after-meal sugar ${num(p.value, 'mg/dL')}`].filter(Boolean).join(' and ')} (${fmtDate((f ?? p)!.date)}).`);

  s.push(i.medicines.length ? `Medicines on record: ${i.medicines.slice(0, 4).join(', ')}.` : 'No medicines are recorded (needs input).');
  if (i.complications.length) s.push(`Complications noted: ${i.complications.slice(0, 3).join(', ')}.`);
  else s.push('No complications are recorded.');
  if (i.missing.length) s.push(`Not on record: ${i.missing.slice(0, 5).map(lower).join(', ')}.`);
  if (i.advice.length) s.push(`The latest advice written: ${i.advice.slice(0, 2).map(plain).join('; ')}.`);

  // Keep the most important sentences that fit in 80 words; the first sentence is always kept.
  let out = s[0]; let n = words(out);
  for (const sentence of s.slice(1)) { const w = words(sentence); if (n + w <= 80) { out += ' ' + sentence; n += w; } }
  return { text: out, words: n, sources, complete: true };
}
