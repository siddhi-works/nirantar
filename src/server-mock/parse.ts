/**
 * "Extraction" tier: HIS workbook text → documents and cited facts.
 * Pure and deterministic. Every fact carries a Citation pointing at the exact character span
 * it was read from, so the UI can highlight the source region.
 */
import raw from './data/his.json';
import { fieldText, headerLine } from '@/domain/slip';
import type {
  Citation, DiagnosisEntry, Extractor, Fact, Finding, FindingState, ISODate, MedicationMention,
  Patient, PlanCategory, SlipField, SourceDocument,
} from '@/domain/types';

/* ───────────── helpers ───────────── */

export const EXTRACTOR_VERSION = '0.1.0';
const ex = (rule: string): Extractor => ({ name: 'his-text-parser', version: EXTRACTOR_VERSION, rule });

export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, day));
  return dt.toISOString().slice(0, 10);
}
export function addDays(d: ISODate, n: number): ISODate {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export const docIdOf = (pid: string, kind: 'prescription' | 'diagnostic', visit: number) =>
  `${pid}-${kind === 'prescription' ? 'RX' : 'DX'}-V${visit}`;

export { headerLine, fieldText };

function cite(
  doc: SourceDocument, field: SlipField, sub: string | RegExp | null,
  opts: { adviceIndex?: number; alsoIn?: string[] } = {},
): Citation {
  const text = fieldText(doc, field, opts.adviceIndex);
  let span: [number, number] | undefined;
  let quote = text;
  if (sub) {
    if (typeof sub === 'string') {
      const i = text.indexOf(sub);
      if (i >= 0) { span = [i, i + sub.length]; quote = sub; }
    } else {
      const m = sub.exec(text);
      if (m) { span = [m.index, m.index + m[0].length]; quote = m[0]; }
    }
  } else {
    span = [0, text.length];
  }
  const id = `cit:${doc.id}:${field}${opts.adviceIndex !== undefined ? `#${opts.adviceIndex}` : ''}:${span ? span[0] : 'all'}-${span ? span[1] : 'all'}`;
  return { id, docId: doc.id, field, adviceIndex: opts.adviceIndex, span, quote, alsoIn: opts.alsoIn };
}

/* ───────────── patients & documents ───────────── */

type RawRow = { row: number; sheet: string; visit: number; date: string; co: string; investigations: string; diagnosis: string; advice: string };
type RawPatient = { patient_id: string; name: string; age: number; sex: 'M' | 'F'; weight_kg: number; address: string; abha_id: string; abha_note: string; doctor: string; reg_no: string; visits: number };

/** Mock Indian names replace the workbook's placeholder names everywhere (slip headers, summaries, doctors). */
const NAME_MAP: [string, string][] = [
  ['Mrs. Dummy 2', 'Mrs. Savitri Devi Pandey'], ['Mr. Dummy 1', 'Mr. Rajesh Kumar Singh'],
  ['Dr. ABC', 'Dr. Meenakshi Srivastava'], ['Dr. XYZ', 'Dr. Arvind Sinha'],
];
const localised = NAME_MAP.reduce((acc, [a, b]) => acc.split(a).join(b), JSON.stringify(raw));

const data = JSON.parse(localised) as {
  patients: RawPatient[];
  prescriptions: Record<string, RawRow[]>;
  diagnostics: Record<string, RawRow[]>;
  trends: Record<string, { visit: number; date: string; fbs: number | null; ppbs: number | null; hba1c: number | null }[]>;
  medVsTrend: Record<string, { visit: number; date: string; medicine: string; reading: string }[]>;
  aiSummary: Record<string, { sheet: string; headline: string; body: string; watch: string | null }>;
  notes: { banner: string; dataCaveat: string };
};

export const HIS_NOTES = data.notes;
export const HIS_TRENDS = data.trends;
export const HIS_MED_VS_TREND = data.medVsTrend;
export const HIS_AI = data.aiSummary;

const splitAdvice = (s: string) => s.split('\n').map(l => l.replace(/^\s*\d+\)\s*/, '').trim()).filter(Boolean);

export function parseDocuments(): SourceDocument[] {
  const docs: SourceDocument[] = [];
  for (const p of data.patients) {
    const pid = p.patient_id;
    const place = p.address;
    for (const kind of ['prescription', 'diagnostic'] as const) {
      const rows = (kind === 'prescription' ? data.prescriptions : data.diagnostics)[pid];
      for (const r of rows) {
        const other = docIdOf(pid, kind === 'prescription' ? 'diagnostic' : 'prescription', r.visit);
        docs.push({
          id: docIdOf(pid, kind, r.visit),
          patientId: pid, visit: r.visit, kind,
          title: kind === 'prescription' ? 'Prescription slip' : 'Diagnostic report',
          date: r.date, sheet: r.sheet, sheetRow: r.row,
          header: { abha: p.abha_id, name: p.name, age: p.age, sex: p.sex, weightKg: p.weight_kg, place },
          complaint: r.co.trim(), investigations: r.investigations.trim(), diagnosis: r.diagnosis.trim(),
          advice: splitAdvice(r.advice),
          doctor: p.doctor, regNo: p.reg_no,
          copyOf: kind === 'diagnostic' ? other : undefined,
        });
      }
    }
  }
  return docs;
}

export function parsePatients(docs: SourceDocument[]): Patient[] {
  return data.patients.map(p => {
    const dates = docs.filter(d => d.patientId === p.patient_id && d.kind === 'prescription').map(d => d.date).sort();
    const [city] = p.address.split(',').map(s => s.trim());
    return {
      id: p.patient_id, name: p.name, age: p.age, sex: p.sex, weightKg: p.weight_kg,
      place: p.address, city, abhaId: p.abha_id, abhaNote: p.abha_note,
      doctor: p.doctor, doctorRegNo: p.reg_no, visitCount: p.visits,
      firstVisitDate: dates[0], lastVisitDate: dates[dates.length - 1], asOf: dates[dates.length - 1],
      initials: p.name.replace(/^(Mr|Mrs|Ms|Dr)\.\s*/, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(),
    };
  });
}

/* ───────────── observations ───────────── */

const OBS_RE = /(FBS|PPBS|HbA1c)\s*[–-]\s*([\d.]+)\s*(mg\/dl|%)/gi;
const OBS_META: Record<string, { code: string; label: string; unit: string; decimals: number }> = {
  fbs: { code: 'fbs', label: 'FBS', unit: 'mg/dL', decimals: 0 },
  ppbs: { code: 'ppbs', label: 'PPBS', unit: 'mg/dL', decimals: 0 },
  hba1c: { code: 'hba1c', label: 'HbA1c', unit: '%', decimals: 1 },
};

function mkFact(p: Omit<Fact, 'source' | 'verification'> & Partial<Pick<Fact, 'source' | 'verification'>>): Fact {
  return { source: 'his-import', verification: 'imported', ...p };
}

function parseObservations(docs: SourceDocument[]): Fact[] {
  const facts: Fact[] = [];
  const dx = docs.filter(d => d.kind === 'diagnostic');
  for (const d of dx) {
    const rx = docIdOf(d.patientId, 'prescription', d.visit);
    for (const m of d.investigations.matchAll(OBS_RE)) {
      const meta = OBS_META[m[1].toLowerCase()];
      const value = Number(m[2]);
      const start = m.index!;
      facts.push(mkFact({
        id: `${d.patientId}-V${d.visit}-${meta.code}`, patientId: d.patientId, visit: d.visit, date: d.date,
        kind: 'observation', code: meta.code, label: meta.label, value, unit: meta.unit,
        display: `${meta.label} ${value.toFixed(meta.decimals)}${meta.unit === '%' ? '%' : ' ' + meta.unit}`,
        citation: {
          id: `cit:${d.id}:investigations:${start}-${start + m[0].length}`, docId: d.id, field: 'investigations',
          span: [start, start + m[0].length], quote: m[0], alsoIn: [rx],
        },
        extractor: ex('obs.glycemia'),
      }));
    }
  }
  // weight is printed in each slip header
  for (const d of docs.filter(x => x.kind === 'prescription')) {
    const sub = `${d.header.weightKg} kg`;
    facts.push(mkFact({
      id: `${d.patientId}-V${d.visit}-weight`, patientId: d.patientId, visit: d.visit, date: d.date,
      kind: 'observation', code: 'weight', label: 'Weight', value: d.header.weightKg, unit: 'kg',
      display: `Weight ${d.header.weightKg} kg`,
      citation: cite(d, 'header', sub, { alsoIn: [docIdOf(d.patientId, 'diagnostic', d.visit)] }),
      extractor: ex('obs.weight-header'),
    }));
  }
  return facts;
}

/* ───────────── conditions ───────────── */

function parseDiagnoses(docs: SourceDocument[]): DiagnosisEntry[] {
  const out: DiagnosisEntry[] = [];
  const rx = docs.filter(d => d.kind === 'prescription').sort((a, b) => a.patientId.localeCompare(b.patientId) || a.visit - b.visit);
  const last = new Map<string, string>();
  for (const d of rx) {
    const prev = last.get(d.patientId);
    out.push({
      patientId: d.patientId, visit: d.visit, date: d.date, text: d.diagnosis,
      changedFromPrev: prev !== undefined && prev !== d.diagnosis,
      citation: cite(d, 'diagnosis', null, { alsoIn: [docIdOf(d.patientId, 'diagnostic', d.visit)] }),
    });
    last.set(d.patientId, d.diagnosis);
  }
  return out;
}

/* ───────────── findings (complaint + investigations text) ───────────── */

interface FindingRule { re: RegExp; group: Finding['group']; label: string; state: FindingState; field: 'complaint' | 'investigations'; rule: string }
const FINDING_RULES: FindingRule[] = [
  { re: /Polyuria and thirst reduced/i, group: 'symptom', label: 'Polyuria / thirst', state: 'reduced', field: 'complaint', rule: 'find.symptom' },
  { re: /No polyuria(?:\/| or )polydipsia/i, group: 'symptom', label: 'Polyuria / polydipsia', state: 'absent', field: 'complaint', rule: 'find.symptom' },
  { re: /Asymptomatic/i, group: 'symptom', label: 'Symptoms', state: 'absent', field: 'complaint', rule: 'find.symptom' },
  { re: /No hypoglycemic symptoms|No symptomatic hypoglycemia|No documented hypoglycemia|No reported hypoglycemic episodes/i, group: 'hypoglycemia', label: 'Hypoglycemia', state: 'absent', field: 'complaint', rule: 'find.hypo' },
  { re: /Home glucose readings remain elevated/i, group: 'glycemia', label: 'Home glucose readings elevated', state: 'present', field: 'complaint', rule: 'find.glycemia' },
  { re: /Mild improvement in glucose readings/i, group: 'glycemia', label: 'Glucose readings improving', state: 'reduced', field: 'complaint', rule: 'find.glycemia' },
  { re: /Occasional dietary indiscretion/i, group: 'lifestyle', label: 'Dietary indiscretion', state: 'present', field: 'complaint', rule: 'find.lifestyle' },
  { re: /Clinically stable/i, group: 'general', label: 'Clinical status stable', state: 'note', field: 'complaint', rule: 'find.general' },
  { re: /Generally well/i, group: 'general', label: 'Generally well', state: 'note', field: 'complaint', rule: 'find.general' },
  { re: /No new complaints/i, group: 'general', label: 'New complaints', state: 'absent', field: 'complaint', rule: 'find.general' },
  { re: /Renal function\s*[–-]\s*within reference range/i, group: 'renal', label: 'Renal function within reference range (no value written)', state: 'note', field: 'investigations', rule: 'find.renal-qualitative' },
  { re: /Urine protein remains positive/i, group: 'renal', label: 'Urine protein positive', state: 'present', field: 'investigations', rule: 'find.renal-urine-protein' },
];

function parseFindings(docs: SourceDocument[]): Finding[] {
  const out: Finding[] = [];
  const rx = docs.filter(d => d.kind === 'prescription');
  for (const d of rx) {
    const dxId = docIdOf(d.patientId, 'diagnostic', d.visit);
    for (const r of FINDING_RULES) {
      const text = d[r.field];
      if (!r.re.test(text)) continue;
      const doc = r.field === 'investigations' ? docs.find(x => x.id === dxId)! : d;
      const other = r.field === 'investigations' ? d.id : dxId;
      const c = cite(doc, r.field, new RegExp(r.re.source, r.re.flags.replace('g', '')), { alsoIn: [other] });
      out.push({
        id: `${d.patientId}-V${d.visit}-${r.rule}-${out.length}`, patientId: d.patientId, visit: d.visit, date: d.date,
        group: r.group, label: r.label, state: r.state, text: c.quote, citation: c,
      });
    }
  }
  return out;
}

/* ───────────── advice → medications, plan, follow-up ───────────── */

export interface PlanSeed {
  id: string; patientId: string; visit: number; date: ISODate; category: PlanCategory; text: string;
  topic?: string; citation: Citation;
  followUp?: { months?: number; weeks?: number; days?: number; label: string } | 'as-advised';
}

export interface MedSeed {
  patientId: string; drug: string; strength?: string; regimen?: string; route?: string;
  mention: MedicationMention;
}

const DRUGS = [
  { drug: 'Metformin', re: /metformin/i },
  { drug: 'Insulin glargine', re: /insulin glargine|insulin/i },
];

function parseAdvice(docs: SourceDocument[]): { plan: PlanSeed[]; meds: MedSeed[] } {
  const plan: PlanSeed[] = [];
  const meds: MedSeed[] = [];
  const rx = docs.filter(d => d.kind === 'prescription').sort((a, b) => a.patientId.localeCompare(b.patientId) || a.visit - b.visit);
  const activeDrugs = new Map<string, Set<string>>(); // patient → drugs mentioned so far

  for (const d of rx) {
    const dxId = docIdOf(d.patientId, 'diagnostic', d.visit);
    const active = activeDrugs.get(d.patientId) ?? new Set<string>();
    activeDrugs.set(d.patientId, active);

    d.advice.forEach((item, i) => {
      const alsoIn = [dxId];
      const planId = (suffix: string) => `${d.patientId}-V${d.visit}-adv${i}-${suffix}`;
      const push = (category: PlanCategory, topic: string | undefined, sub: string | RegExp | null, extra: Partial<PlanSeed> = {}) =>
        plan.push({ id: planId(topic ?? category), patientId: d.patientId, visit: d.visit, date: d.date, category, text: item.replace(/\.$/, ''), topic, citation: cite(d, 'advice', sub, { adviceIndex: i, alsoIn }), ...extra });

      // follow-up
      const fu = /Follow-up after (\d+)\s*(month|week|day)s?/i.exec(item);
      if (fu) {
        const n = Number(fu[1]); const u = fu[2].toLowerCase();
        push('followup', 'followup', fu[0], { followUp: { [u === 'month' ? 'months' : u === 'week' ? 'weeks' : 'days']: n, label: `${n} ${u}${n > 1 ? 's' : ''}` } });
        return;
      }
      if (/Follow-up as advised/i.test(item)) { push('followup', 'followup', 'Follow-up as advised', { followUp: 'as-advised' }); return; }

      // medicines
      const named = DRUGS.filter(x => x.re.test(item));
      const byRef = /(existing|continue existing)( diabetes)? treatment|existing diabetes treatment/i.exec(item);
      if (named.length || byRef) {
        const mk = (drug: string, mode: MedicationMention['mode'], sub: string | RegExp | null, extra: Partial<MedSeed> = {}) => {
          meds.push({
            patientId: d.patientId, drug, ...extra,
            mention: { visit: d.visit, date: d.date, mode, text: item.replace(/\.$/, ''), citation: cite(d, 'advice', sub, { adviceIndex: i, alsoIn }) },
          });
          active.add(drug);
        };
        if (named.length) {
          for (const n of named) {
            if (n.drug === 'Metformin') {
              const dose = /(\d+)\s*mg/.exec(item); const freq = /(\d)\s*[×x]\s*(\d)\s*tab/i.exec(item);
              if (dose) mk('Metformin', 'dose-stated', /Tab\.\s*Metformin[^.]*?tab/i, {
                strength: `${dose[1]} mg`, route: 'Oral',
                regimen: `${freq ? `${freq[1]} × ${freq[2]} daily` : 'as written'}, before meals`,
              });
              else mk('Metformin', 'named', /metformin/i);
            } else {
              const dose = /(\d+)\s*U\/day/.exec(item);
              if (dose) mk('Insulin glargine', 'dose-stated', /Insulin glargine[^,]*,[^.]*U\/day/i, {
                strength: `${dose[1]} U/day`, route: 'Subcutaneous', regimen: 'Once daily at bedtime',
              });
              else mk('Insulin glargine', 'named', /insulin(?: glargine)?/i);
            }
          }
          push('medication', undefined, null);
        } else if (byRef) {
          for (const drug of active) mk(drug, 'by-reference', byRef[0]);
          push('medication', undefined, byRef[0]);
        }
        return;
      }

      // tests & monitoring
      if (/Periodic HbA1c and renal/i.test(item)) {
        push('test', 'hba1c', /Periodic HbA1c/i);
        push('test', 'renal', /renal[- ](profile|function monitoring)/i);
        return;
      }
      if (/Repeat renal assessment|urine albumin|protein quantification/i.test(item)) { push('test', 'renal', null); return; }
      if (/Monitor renal function/i.test(item)) { push('monitoring', 'renal', null); return; }
      if (/surveillance for diabetic complications/i.test(item)) { push('monitoring', 'complications', null); return; }
      if (/glucose/i.test(item) || /Periodic diabetes monitoring/i.test(item)) { push('monitoring', /glucose/i.test(item) ? 'glucose' : 'diabetes', null); return; }

      // lifestyle
      if (/diet|walking|physical activity|sugar/i.test(item)) {
        const topic = /sugar/i.test(item) ? 'sugar' : /diet/i.test(item) && /walking|activity/i.test(item) ? 'diet+activity' : /diet/i.test(item) ? 'diet' : 'activity';
        push('lifestyle', topic, null);
        return;
      }
      push('lifestyle', 'other', null);
    });
  }
  return { plan, meds };
}

/* ───────────── public ───────────── */

export interface ParsedRecord {
  patients: Patient[];
  docs: SourceDocument[];
  facts: Fact[];
  diagnoses: DiagnosisEntry[];
  findings: Finding[];
  planSeeds: PlanSeed[];
  medSeeds: MedSeed[];
}

let cache: ParsedRecord | null = null;
export function parseRecord(): ParsedRecord {
  if (cache) return cache;
  const docs = parseDocuments();
  const { plan, meds } = parseAdvice(docs);
  cache = {
    patients: parsePatients(docs),
    docs,
    facts: parseObservations(docs),
    diagnoses: parseDiagnoses(docs),
    findings: parseFindings(docs),
    planSeeds: plan,
    medSeeds: meds,
  };
  return cache;
}
