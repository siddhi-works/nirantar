/** Small facts about a patient derived from the record, used under the name and in the vitals line. */
import { OBS_BY_CODE, bmi, valueText } from './observations';
import type { Citation, Fact, Recall } from './types';

/** The newest value recorded in this system (typed in, or read from a document and confirmed) for a code. */
export const latestRecorded = (r: Recall, code: string): Fact | undefined =>
  r.facts.filter(f => f.source === 'staff-entered' && f.code === code)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];

export const shownValue = (f: Fact) => {
  const def = OBS_BY_CODE[f.code];
  if (!def) return f.display;
  if (def.kind === 'choice') return def.options!.find(o => o.value === f.value)?.label ?? String(f.value);
  return `${f.value} ${def.unit === '%' ? '%' : def.unit}`;
};

export interface VitalsNote { by: string; date: string; bp?: string; weight?: string; height?: string; pulse?: string; bmi?: number }

export function vitalsNote(r: Recall): VitalsNote | null {
  const sbp = latestRecorded(r, 'sbp'); const dbp = latestRecorded(r, 'dbp');
  const w = latestRecorded(r, 'weight'); const h = latestRecorded(r, 'height'); const p = latestRecorded(r, 'pulse');
  const any = sbp ?? w ?? h ?? p;
  if (!any) return null;
  const kg = w ? Number(w.value) : undefined; const cm = h ? Number(h.value) : undefined;
  return {
    by: any.verifiedBy ?? 'staff', date: any.date,
    bp: sbp && dbp ? `${sbp.value}/${dbp.value} mmHg` : undefined,
    weight: w ? `${w.value} kg` : undefined, height: h ? `${h.value} cm` : undefined, pulse: p ? `${p.value} /min` : undefined,
    bmi: kg && cm ? bmi(kg, cm) : undefined,
  };
}

export function monthsLabel(months: number): string {
  if (months < 1) return 'under a month';
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12); const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}

const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return Math.max(0, (yb - ya) * 12 + (mb - ma));
};

export interface Complication { label: string; since: string; months: number; citation?: Citation }

/**
 * Complications that a slip or a confirmed result states. Duration is counted from the first date the record
 * documents it, up to the latest follow-up: the record holds no diagnosis dates, so none are claimed.
 */
export function complications(r: Recall): Complication[] {
  const end = r.patient.asOf;
  const out: Complication[] = [];
  const add = (label: string, since: string, citation?: Citation) => { if (!out.some(o => o.label === label)) out.push({ label, since, months: monthsBetween(since, end), citation }); };
  const renal = r.findings.filter(f => f.group === 'renal' && f.state === 'present').sort((a, b) => a.date.localeCompare(b.date))[0];
  if (renal) add('Urine protein positive', renal.date, renal.citation);
  const first = (code: string, test: (f: Fact) => boolean) => r.facts.filter(f => f.source === 'staff-entered' && f.code === code && test(f)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const ret = first('retina', f => /proliferative/.test(String(f.value)) && !/^no /.test(String(f.value)));
  if (ret) add(valueText(OBS_BY_CODE.retina, ret.value as string).replace('Retinal exam: ', ''), ret.date, ret.citation);
  const foot = first('foot', f => f.value === 'abnormal'); if (foot) add('Abnormal foot exam', foot.date, foot.citation);
  const neu = first('neuropathy', f => f.value === 'present'); if (neu) add('Neuropathy found', neu.date, neu.citation);
  const prot = first('urine-protein', f => f.value === 'positive'); if (prot) add('Urine protein positive', prot.date, prot.citation);
  return out;
}

export const onRecordSince = (r: Recall) => {
  const first = r.changes[0]?.date;
  return first ? { since: first, months: monthsBetween(first, r.patient.asOf) } : null;
};
