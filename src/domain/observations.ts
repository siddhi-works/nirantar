/**
 * What can be recorded about a patient besides the follow-up slips, and what counts as a plausible value.
 * Shared by the server (validation) and the screens (forms), so they cannot disagree.
 */

export type ObsStatus = 'extracted' | 'verified' | 'corrected' | 'rejected';
export type ObsOrigin = 'entry' | 'upload';

export type ObsGroup = 'glycaemic' | 'vitals' | 'kidney' | 'lipid' | 'liver' | 'exam' | 'screening';

export interface ObsDef {
  code: string;
  label: string;
  group: ObsGroup;
  kind: 'number' | 'choice';
  unit?: string;
  min?: number;
  max?: number;
  decimals?: number;
  options?: { value: string; label: string }[];
}

const n = (code: string, label: string, group: ObsGroup, unit: string, min: number, max: number, decimals = 0): ObsDef =>
  ({ code, label, group, kind: 'number', unit, min, max, decimals });
const c = (code: string, label: string, group: ObsGroup, options: [string, string][]): ObsDef =>
  ({ code, label, group, kind: 'choice', options: options.map(([value, label]) => ({ value, label })) });

export const OBS_DEFS: ObsDef[] = [
  n('hba1c', 'HbA1c', 'glycaemic', '%', 3, 20, 1),
  n('fbs', 'Fasting glucose (FBS)', 'glycaemic', 'mg/dL', 30, 600),
  n('ppbs', 'Post-meal glucose (PPBS)', 'glycaemic', 'mg/dL', 30, 800),
  n('sbp', 'Systolic BP', 'vitals', 'mmHg', 60, 260),
  n('dbp', 'Diastolic BP', 'vitals', 'mmHg', 30, 160),
  n('pulse', 'Pulse', 'vitals', '/min', 30, 220),
  n('weight', 'Weight', 'vitals', 'kg', 20, 300, 1),
  n('height', 'Height', 'vitals', 'cm', 80, 230),
  n('egfr', 'eGFR', 'kidney', 'mL/min/1.73 m²', 5, 150),
  n('uacr', 'uACR', 'kidney', 'mg/g', 0, 5000, 1),
  c('urine-protein', 'Urine protein', 'kidney', [['negative', 'Negative'], ['trace', 'Trace'], ['positive', 'Positive']]),
  n('ldl', 'LDL cholesterol', 'lipid', 'mg/dL', 10, 500),
  n('hdl', 'HDL cholesterol', 'lipid', 'mg/dL', 5, 200),
  n('tg', 'Triglycerides', 'lipid', 'mg/dL', 20, 2000),
  n('alt', 'ALT', 'liver', 'U/L', 1, 1500),
  c('retina', 'Retinal exam', 'exam', [['no retinopathy', 'No retinopathy'], ['non-proliferative retinopathy', 'Non-proliferative retinopathy'], ['proliferative retinopathy', 'Proliferative retinopathy'], ['not gradable', 'Not gradable, repeat needed']]),
  c('foot', 'Foot exam', 'exam', [['normal', 'Normal, sensation intact'], ['abnormal', 'Abnormal']]),
  c('neuropathy', 'Neuropathy exam', 'exam', [['absent', 'No neuropathy found'], ['present', 'Neuropathy found']]),
  c('osa-screen', 'Sleep apnoea screening', 'screening', [['negative', 'Screen negative'], ['positive', 'Screen positive']]),
];

export const OBS_BY_CODE: Record<string, ObsDef> = Object.fromEntries(OBS_DEFS.map(d => [d.code, d]));

export type Checked = { ok: true; value: number | string } | { ok: false; error: string };

/** One place that decides whether a typed or extracted value is acceptable for a code. */
export function checkValue(code: string, raw: unknown): Checked {
  const def = OBS_BY_CODE[code];
  if (!def) return { ok: false, error: 'This measure is not recognised.' };
  if (def.kind === 'choice') {
    const v = String(raw ?? '').trim();
    return def.options!.some(o => o.value === v) ? { ok: true, value: v } : { ok: false, error: `${def.label}: choose one of the listed results.` };
  }
  const s = String(raw ?? '').trim();
  const v = Number(s);
  if (s === '' || !Number.isFinite(v)) return { ok: false, error: `${def.label} must be a number.` };
  if (v < def.min! || v > def.max!) return { ok: false, error: `${def.label} ${s} looks implausible (expected ${def.min}–${def.max} ${def.unit}). Check the report and enter it again.` };
  return { ok: true, value: v };
}

export const bmi = (kg: number, cm: number) => Math.round((kg / ((cm / 100) ** 2)) * 10) / 10;

export const valueText = (def: ObsDef, v: number | string) =>
  def.kind === 'number' ? `${def.label} ${v}${def.unit ? (def.unit === '%' ? '%' : ' ' + def.unit) : ''}` : `${def.label}: ${def.options?.find(o => o.value === v)?.label ?? v}`;
