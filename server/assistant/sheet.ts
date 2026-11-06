import type { Recall } from '../../src/domain/types';
import { fmtDate } from '../../src/domain/format';

/** One thing the record says. The assistant may only ever repeat these, and every answer points back to them. */
export interface SheetLine {
  id: string;            // F1, F2 …
  kind: 'obs' | 'med' | 'dx' | 'visit' | 'missing';
  code?: string;         // measure code for observations
  label: string;
  text: string;          // English, as given to the model
  date?: string;
  value?: number | string;
  unit?: string;
}

/** The patient's whole record as numbered lines: confirmed values, medicines, the latest diagnosis, visits and what is missing. */
export function buildSheet(r: Recall): SheetLine[] {
  const lines: Omit<SheetLine, 'id'>[] = [];
  const obs = r.facts.filter(f => f.kind === 'observation' && f.value !== undefined && f.value !== null).sort((a, b) => a.date.localeCompare(b.date));
  for (const f of obs) {
    lines.push({ kind: 'obs', code: f.code, label: f.label, value: f.value, unit: f.unit, date: f.date,
      text: `${f.label} ${f.value}${f.unit ? ' ' + f.unit : ''} on ${fmtDate(f.date)}${f.visit ? ` (visit ${f.visit})` : ''}` });
  }
  for (const m of r.medications) {
    lines.push({ kind: 'med', label: m.drug, text: `Medicine: ${m.drug}${m.strength ? ' ' + m.strength : ''}, ${m.regimen}${m.route ? ', ' + m.route : ''}; first written at visit ${m.firstMentionVisit}` });
  }
  const dx = r.diagnoses.at(-1);
  if (dx) lines.push({ kind: 'dx', label: 'Diagnosis', date: dx.date, text: `Diagnosis on the latest slip (${fmtDate(dx.date)}): ${dx.text}` });
  for (const d of r.documents.filter(x => x.kind === 'prescription').sort((a, b) => a.visit - b.visit)) {
    lines.push({ kind: 'visit', label: `Visit ${d.visit}`, date: d.date, text: `Visit ${d.visit} on ${fmtDate(d.date)}: ${d.complaint} Advice written: ${d.advice.join('; ')}` });
  }
  for (const m of r.missingMeasures.filter(x => !(x.readings?.length))) {
    lines.push({ kind: 'missing', code: m.code, label: m.label, text: `No ${m.label} result is on record.` });
  }
  return lines.map((l, i) => ({ ...l, id: `F${i + 1}` }));
}

export const sheetText = (lines: SheetLine[]) => lines.map(l => `${l.id}: ${l.text}`).join('\n');

/** The sheet for a patient with no follow-up slips: only the values a person has recorded or confirmed, and what is missing. */
export function buildRegisteredSheet(rows: { code: string; valueNum: number | null; valueText: string | null; obsDate: string; status: string }[], labels: Record<string, { label: string; unit?: string }>): SheetLine[] {
  const ok = rows.filter(r => (r.status === 'verified' || r.status === 'corrected') && r.valueNum !== null).sort((a, b) => a.obsDate.localeCompare(b.obsDate));
  const lines: Omit<SheetLine, 'id'>[] = ok.map(r => {
    const d = labels[r.code]; const label = d?.label ?? r.code;
    return { kind: 'obs', code: r.code, label, value: r.valueNum!, unit: d?.unit, date: r.obsDate, text: `${label} ${r.valueNum}${d?.unit ? ' ' + d.unit : ''} on ${fmtDate(r.obsDate)}` };
  });
  const have = (...c: string[]) => ok.some(r => c.includes(r.code));
  for (const [code, label, present] of [['bp', 'Blood pressure', have('sbp')], ['egfr', 'eGFR', have('egfr')], ['uacr', 'uACR', have('uacr')], ['ldl', 'LDL cholesterol', have('ldl')]] as const) {
    if (!present) lines.push({ kind: 'missing', code, label, text: `No ${label} result is on record.` });
  }
  return lines.map((l, i) => ({ ...l, id: `F${i + 1}` }));
}
