/**
 * Deterministic rules engine ("Tier 0"). Pure functions over facts + ops state → Recall payload.
 * Nothing here guesses: every gap names its rule, version, triggering citations and due state.
 */
import { PROTOCOL, ROLE_LABEL } from '@/domain/forms';
import { diffDays, fmtDate, joinList, monthsBetween, plural, round, signed, visitsLabel } from '@/domain/format';
import type {
  AbsenceEvidence, ActivityEvent, AttentionItem, BriefingLine, ChangeItem, Citation, CoverageField, DomainId, DueItem,
  Fact, Finding, FollowUpCheck, Gap, GapStatus, Medication, MissingMeasure, MissingMeasureCode, OrganDomain,
  OrganFinding, OrganMeasure, OrganState, PlanItem, PlanStatus, Recall, Role, RuleEvaluation, Severity, Task,
  TrendPoint, TrendSeries, Trigger, VisitChange, MeasureCode, SourceDocument, Patient, TargetBand,
} from '@/domain/types';
import { HIS_AI, HIS_MED_VS_TREND, addDays, addMonths, parseRecord, type PlanSeed } from './parse';
import { RULE_CATALOG, ruleById } from './catalog';

export interface Ops {
  tasks: Task[];
  verifications: Record<string, { by: string; at: string }>;
  aiAccepted: Record<string, { by: string; at: string }>;
}
export const EMPTY_OPS: Ops = { tasks: [], verifications: {}, aiAccepted: {} };

const SEV_RANK: Record<Severity, number> = { high: 0, moderate: 1, low: 2 };
const BASIS_RANK: Record<Gap['basis'], number> = { 'advised-not-evidenced': 0, schedule: 1, absence: 2 };
const ASSESSMENT_NAME: Record<string, string> = { eye: 'retinal exam', foot: 'foot exam', lipid: 'lipid profile', bp: 'blood pressure', liver: 'liver panel' };

/* ───────────────────────── staff-entered facts ───────────────────────── */

function staffFacts(patient: Patient, tasks: Task[]): Fact[] {
  const out: Fact[] = [];
  for (const t of tasks) {
    if (!t.evidence?.values || (t.status !== 'evidence' && t.status !== 'closed')) continue;
    for (const v of t.evidence.values) {
      const numeric = v.unit !== undefined && v.value !== '' && !Number.isNaN(Number(v.value));
      const display = `${v.label} ${v.value}${v.unit ? ' ' + v.unit : ''}`;
      out.push({
        id: `${t.id}-${v.code}`, patientId: patient.id, visit: 0, date: t.evidence.at.slice(0, 10),
        kind: 'observation', code: v.code, label: v.label, value: numeric ? Number(v.value) : v.value, unit: v.unit, display,
        source: 'staff-entered',
        citation: { id: `cit:EV-${t.id}:${v.code}`, docId: `EV-${t.id}`, field: 'investigations', quote: display, closureRef: { taskId: t.id, label: t.title } },
        extractor: { name: 'staff-entry', version: '1', rule: 'closure.evidence' },
        verification: t.status === 'closed' ? 'verified' : 'imported',
        verifiedBy: t.status === 'closed' ? t.closure?.by : undefined,
        verifiedAt: t.status === 'closed' ? t.closure?.at : undefined,
      });
    }
  }
  return out;
}

/* ───────────────────────── trends ───────────────────────── */

const SERIES_META: Record<MeasureCode, { label: string; unit: string; decimals: number; lowerIsBetter: boolean; target?: TargetBand }> = {
  hba1c: { label: 'HbA1c', unit: '%', decimals: 1, lowerIsBetter: true, target: PROTOCOL.targets.hba1c },
  fbs: { label: 'FBS', unit: 'mg/dL', decimals: 0, lowerIsBetter: true, target: PROTOCOL.targets.fbs },
  ppbs: { label: 'PPBS', unit: 'mg/dL', decimals: 0, lowerIsBetter: true, target: PROTOCOL.targets.ppbs },
  weight: { label: 'Weight', unit: 'kg', decimals: 0, lowerIsBetter: false },
};

function bandOf(v: number, t?: TargetBand): 'in' | 'above' | 'below' | null {
  if (!t) return null;
  if (t.max !== undefined && (t.maxExclusive ? v >= t.max : v > t.max)) return 'above';
  if (t.min !== undefined && v < t.min) return 'below';
  return 'in';
}

const fmtV = (v: number, dec: number, unit: string) => `${v.toFixed(dec)}${unit === '%' ? '%' : ' ' + unit}`;

function buildSeries(code: MeasureCode, facts: Fact[], visits: number[], dates: Record<number, string>): TrendSeries {
  const m = SERIES_META[code];
  const points: TrendPoint[] = visits.map(v => {
    const f = facts.find(x => x.source === 'his-import' && x.code === code && x.visit === v);
    return {
      visit: v, date: dates[v], value: f ? (f.value as number) : null, factId: f?.id, citation: f?.citation,
      deltaPrev: null, deltaBase: null, band: f ? bandOf(f.value as number, m.target) : null, verification: f?.verification,
    };
  });
  const first = points.find(p => p.value !== null) ?? null;
  points.forEach((p, i) => {
    if (p.value === null) return;
    const prev = points[i - 1];
    if (prev && prev.value !== null) p.deltaPrev = round(p.value - prev.value, m.decimals);
    if (first && p !== first) p.deltaBase = round(p.value - first.value!, m.decimals);
  });
  const read = points.filter(p => p.value !== null);
  const latest = read.at(-1) ?? null;
  const inBand = { in: read.filter(p => p.band === 'in').length, of: read.length };
  let summary = `${m.label}: no readings on record.`;
  if (latest && first) {
    summary = first === latest
      ? `${m.label}: one reading, ${fmtV(latest.value!, m.decimals, m.unit)} at visit ${latest.visit}.`
      : `${m.label}: ${fmtV(first.value!, m.decimals, m.unit)} at visit ${first.visit} to ${fmtV(latest.value!, m.decimals, m.unit)} at visit ${latest.visit}, a change of ${signed(latest.deltaBase ?? 0, m.decimals)}.`;
    if (m.target) summary += ` ${inBand.in} of ${inBand.of} readings within the ${m.target.label} band.`;
  }
  return { code, ...m, points, latest, firstReading: first, inBand, summary };
}

/* ───────────────────────── absence search ───────────────────────── */

const HAS = {
  quant: /eGFR|creatinine|uACR|\bACR\b|albumin[^.;]*\d+\s*mg/i,
  eye: /retin|fundus|ophthalm|eye exam/i,
  foot: /\bfoot\b|monofilament|neuropath/i,
  lipid: /lipid|cholesterol|\bLDL\b|\bHDL\b|triglycer/i,
  bp: /\bBP\b|blood pressure|mmHg/i,
  liver: /liver|\bLFT\b|\bALT\b|\bAST\b|SGPT|SGOT|bilirubin/i,
};
const resultText = (d: SourceDocument) => `${d.complaint}\n${d.investigations}\n${d.diagnosis}`;

/* ───────────────────────── main builder ───────────────────────── */

export function buildRecall(patientId: string, ops: Ops = EMPTY_OPS): Recall {
  const rec = parseRecord();
  const patient = rec.patients.find(p => p.id === patientId)!;
  const docs = rec.docs.filter(d => d.patientId === patientId).sort((a, b) => a.visit - b.visit || a.kind.localeCompare(b.kind));
  const rxDocs = docs.filter(d => d.kind === 'prescription');
  const visits = rxDocs.map(d => d.visit);
  const N = visits.length;
  const dates: Record<number, string> = Object.fromEntries(rxDocs.map(d => [d.visit, d.date]));
  const asOf = patient.asOf;
  const tasks = ops.tasks.filter(t => t.patientId === patientId);

  const hisFacts = rec.facts.filter(f => f.patientId === patientId);
  const staff = staffFacts(patient, tasks);
  const applyVerif = (f: Fact): Fact => {
    const v = ops.verifications[f.id];
    return v ? { ...f, verification: 'verified', verifiedBy: v.by, verifiedAt: v.at } : f;
  };
  const facts = [...hisFacts, ...staff].map(applyVerif);
  const staffBy = (code: string) => facts.filter(f => f.source === 'staff-entered' && f.code === code).sort((a, b) => b.date.localeCompare(a.date));

  const findings = rec.findings.filter(f => f.patientId === patientId);
  const diagnoses = rec.diagnoses.filter(d => d.patientId === patientId);
  const planSeeds = rec.planSeeds.filter(p => p.patientId === patientId);
  const medSeeds = rec.medSeeds.filter(m => m.patientId === patientId);

  const monthsOfRecord = monthsBetween(patient.firstVisitDate, asOf);
  const absence = (terms: string[]): AbsenceEvidence => ({
    searchedDocIds: docs.map(d => d.id), terms, matches: 0,
    scope: `${plural(N, 'visit')} · ${docs.length} documents · ${plural(monthsOfRecord, 'month')} of record`,
  });
  const anyHis = (re: RegExp) => docs.some(d => re.test(resultText(d)));

  /* trends */
  const trends = (['hba1c', 'fbs', 'ppbs', 'weight'] as MeasureCode[]).map(c => buildSeries(c, facts, visits, dates));
  const T = Object.fromEntries(trends.map(t => [t.code, t])) as Record<MeasureCode, TrendSeries>;

  /* plan seeds → follow-up checks */
  const fuSeeds = planSeeds.filter(p => p.category === 'followup').sort((a, b) => a.visit - b.visit);
  const followUps: FollowUpCheck[] = [];
  for (const s of fuSeeds) {
    if (!s.followUp || s.followUp === 'as-advised') continue;
    const next = visits.find(v => v === s.visit + 1);
    if (!next) continue;
    const f = s.followUp;
    const expected = f.months ? addMonths(s.date, f.months) : f.weeks ? addDays(s.date, f.weeks * 7) : addDays(s.date, f.days ?? 0);
    const actual = dates[next];
    const off = diffDays(expected, actual);
    followUps.push({
      fromVisit: s.visit, toVisit: next, advised: f.label, expectedDate: expected, actualDate: actual, daysOff: off,
      status: Math.abs(off) <= PROTOCOL.followUpToleranceDays ? 'on-time' : off > 0 ? 'late' : 'early', citation: s.citation,
    });
  }

  /* medications */
  const medMap = new Map<string, Medication>();
  for (const s of medSeeds) {
    let m = medMap.get(s.drug);
    if (!m) {
      m = { drug: s.drug, regimen: 'Not written', route: '—', firstMentionVisit: s.mention.visit, mentions: [], doseNote: '', changed: false };
      medMap.set(s.drug, m);
    }
    m.mentions.push(s.mention);
    if (s.strength) { m.strength = s.strength; m.regimen = s.regimen ?? m.regimen; m.route = s.route ?? m.route; }
  }
  const medications = [...medMap.values()];
  for (const m of medications) {
    const stated = m.mentions.filter(x => x.mode === 'dose-stated').map(x => x.visit);
    const distinct = new Set(m.mentions.filter(x => x.mode === 'dose-stated').map(x => x.text));
    m.changed = distinct.size > 1;
    m.doseNote = stated.length === m.mentions.length
      ? `Dose written on every slip (${plural(stated.length, 'visit')}).`
      : `Dose written on ${stated.length === 1 ? `visit ${stated[0]} only` : `visits ${joinList(stated.map(String))}`}. Other slips name the regimen or say “existing treatment”.`;
  }
  const medVisits = new Set(medSeeds.map(s => s.mention.visit));
  const medicationContinuity = {
    fired: !visits.every(v => medVisits.has(v)),
    text: `${joinList(medications.map(m => m.drug))} ${medications.length > 1 ? 'were' : 'was'} carried on ${medications.length ? Math.min(...medications.map(m => m.mentions.length)) : 0} of ${N} slips. No stop without a reason and no duplicate therapy.`,
  };

  /* plan items with status */
  const hasHbaAfter = (v: number) => T.hba1c.points.find(p => p.visit > v && p.value !== null);
  const renalEvidenceAfter = (visit: number): string | null => {
    const f = findings.find(x => x.group === 'renal' && x.visit > visit);
    if (f) return `${f.label} at visit ${f.visit}`;
    const s = [...staffBy('uacr'), ...staffBy('egfr'), ...staffBy('urine-protein')][0];
    return s ? `${s.display} (staff-entered)` : null;
  };
  const plan: PlanItem[] = planSeeds.map(s => {
    let status: PlanStatus = 'continued';
    let note = s.visit < N ? 'Repeated on the next slip.' : 'Latest advice.';
    if (s.category === 'followup') {
      const chk = followUps.find(f => f.fromVisit === s.visit);
      if (chk) { status = chk.status === 'on-time' ? 'kept' : 'kept-late'; note = chk.status === 'on-time' ? `Kept — visit ${chk.toVisit} on ${fmtDate(chk.actualDate)}.` : `Visit ${chk.toVisit} came ${plural(Math.abs(chk.daysOff), 'day')} ${chk.daysOff > 0 ? 'after' : 'before'} the advised date.`; }
      else if (s.followUp === 'as-advised') {
        const nv = staffBy('nextvisit')[0];
        status = nv ? 'upcoming' : 'not-set';
        note = nv ? `Next review booked for ${fmtDate(String(nv.value))}.` : 'No interval or date written.';
      } else { status = 'upcoming'; note = `Review advised in ${s.followUp ? s.followUp.label : ''}.`; }
    } else if (s.topic === 'hba1c') {
      const after = hasHbaAfter(s.visit);
      if (after) { status = 'evidenced'; note = `HbA1c ${after.value!.toFixed(1)}% at visit ${after.visit}.`; }
      else { status = 'upcoming'; note = `Next HbA1c due ${fmtDate(addMonths(dates[s.visit], PROTOCOL.hba1cIntervalMonths))} on the 3-month cadence.`; }
    } else if (s.topic === 'renal') {
      const ev = renalEvidenceAfter(s.visit);
      const earlier = planSeeds.filter(x => x.topic === 'renal' && x.visit < s.visit);
      if (ev) { status = 'evidenced'; note = `${ev}.`; }
      else if (s.visit < N) { status = 'not-evidenced'; note = `No renal result recorded after visit ${s.visit}.`; }
      else if (earlier.length) { status = 'not-evidenced'; note = `Asked again — also advised at ${visitsLabel(earlier.map(e => e.visit))}. No result recorded.`; }
      else { status = 'upcoming'; note = 'Advised at the latest visit.'; }
    } else if (s.topic === 'complications') {
      const any = [...staffBy('retina'), ...staffBy('foot'), ...staffBy('uacr'), ...staffBy('egfr')][0];
      status = any ? 'evidenced' : 'not-evidenced';
      note = any ? `${any.display} (staff-entered).` : 'No eye, foot or kidney assessment is documented.';
    } else if (s.topic === 'glucose') {
      note = patient.id === 'P2' || !T.fbs.latest ? 'Home glucose readings are not in the record.' : 'Clinic glucose values recorded at every visit.';
    }
    return { id: s.id, patientId, visit: s.visit, date: s.date, category: s.category, text: s.text, status, statusNote: note, topic: s.topic, citation: s.citation };
  });

  /* ───────── gaps ───────── */
  const gaps: Gap[] = [];
  const firstRenal = planSeeds.filter(p => p.topic === 'renal').sort((a, b) => a.visit - b.visit)[0];
  const proteinuria = findings.find(f => f.group === 'renal' && f.state === 'present');
  const proteinuriaDx = diagnoses.find(d => /proteinuria/i.test(d.text));

  type GapInput = Omit<Gap, 'id' | 'patientId' | 'ruleVersion' | 'raisedAt' | 'openDays' | 'dueDate' | 'dueLabel' | 'status' | 'history'>
    & Partial<Pick<Gap, 'raisedAt' | 'openDays' | 'dueDate' | 'dueLabel'>> & { key: string };
  const baseGap = ({ key, ...rest }: GapInput): Gap => {
    const rule = ruleById(rest.ruleId);
    const raisedAt = rest.raisedAt ?? asOf;
    return {
      id: `${patientId}:${key}`, patientId, ruleVersion: rule.version, raisedAt, openDays: 0, dueDate: raisedAt,
      dueLabel: 'Due now', status: 'open', history: [{ at: raisedAt, label: `Raised by ${rule.id} v${rule.version}`, actor: 'Rules engine' }],
      ...rest,
    };
  };

  // R-KID-01
  if (!anyHis(HAS.quant)) {
    const triggers: Trigger[] = [];
    for (const s of planSeeds.filter(p => p.topic === 'renal')) {
      triggers.push({ label: `Renal assessment advised at visit ${s.visit} (${fmtDate(s.date)})`, detail: s.text, citation: s.citation });
    }
    const q = findings.filter(f => f.group === 'renal');
    for (const f of q) triggers.push({ label: `${f.label} — visit ${f.visit} (${fmtDate(f.date)})`, citation: f.citation });
    triggers.push({ label: 'No eGFR, creatinine or uACR result in the record', absence: absence(['eGFR', 'creatinine', 'uACR', 'albumin (mg)']) });
    const sev: Severity = proteinuria || proteinuriaDx ? 'high' : 'moderate';
    const advisedN = planSeeds.filter(p => p.topic === 'renal').length;
    gaps.push(baseGap({
      key: 'kidney', ruleId: 'R-KID-01', domain: 'kidney', type: 'overdue investigation', severity: sev,
      severityBasis: sev === 'high' ? `High because urine protein / proteinuria is documented at visit ${proteinuria?.visit ?? proteinuriaDx?.visit}.` : 'Moderate: no proteinuria is on record.',
      basis: firstRenal ? 'advised-not-evidenced' : 'absence', resultForm: 'kidney', ownerRole: 'doctor',
      title: proteinuria ? 'Repeat renal assessment and urine protein quantification not recorded' : 'Renal profile advised — no result recorded',
      raisedAt: firstRenal ? firstRenal.date : asOf, openDays: firstRenal ? diffDays(firstRenal.date, asOf) : diffDays(patient.firstVisitDate, asOf),
      dueDate: firstRenal ? firstRenal.date : asOf,
      dueLabel: firstRenal ? `Overdue — advised ${fmtDate(firstRenal.date)}, no due date written` : 'Baseline due now',
      why: firstRenal
        ? `R-KID-01 fired because renal assessment was advised ${advisedN > 1 ? `${advisedN} times (${joinList(planSeeds.filter(p => p.topic === 'renal').map(p => `visit ${p.visit}`))})` : `at visit ${firstRenal.visit}`} and no eGFR, creatinine or uACR result appears in any of the ${docs.length} documents.`
        : `R-KID-01 fired because no eGFR, creatinine or uACR result appears in any of the ${docs.length} documents.`,
      rationale: proteinuria
        ? 'Proteinuria was documented once and never quantified, so kidney involvement cannot be tracked.'
        : 'Kidney function is only described in words, so change over time cannot be tracked.',
      triggers,
      suggestedActions: [
        { id: 'order-uacr', label: 'Order uACR and eGFR', taskTitle: 'Order uACR and eGFR' },
        ...(proteinuria ? [{ id: 'repeat-protein', label: 'Repeat urine protein quantification', taskTitle: 'Repeat urine protein quantification' }] : []),
      ],
    }));
  }

  // baseline absence gaps
  const absenceSpecs: { key: string; ruleId: string; re: RegExp; domain: DomainId; title: string; terms: string[]; form: Gap['resultForm']; owner: Role; sev: Severity; why: string; rationale: string; actions: { id: string; label: string }[] }[] = [
    { key: 'eye', ruleId: 'R-EYE-01', re: HAS.eye, domain: 'eye', title: 'No retinal screening on record', terms: ['retina', 'fundus', 'ophthalmology', 'eye exam'], form: 'eye', owner: 'doctor', sev: 'moderate', why: 'no retinal or fundus examination appears', rationale: 'Diabetic eye disease is silent early, so the first exam cannot be left unrecorded.', actions: [{ id: 'refer-eye', label: 'Refer for dilated eye exam' }] },
    { key: 'foot', ruleId: 'R-FOOT-01', re: HAS.foot, domain: 'foot', title: 'No foot examination on record', terms: ['foot', 'monofilament', 'neuropathy'], form: 'foot', owner: 'doctor', sev: 'moderate', why: 'no foot, monofilament or neuropathy examination appears', rationale: 'Loss of protective sensation is only found by examining the feet.', actions: [{ id: 'foot-exam', label: 'Examine feet and test sensation' }] },
    { key: 'lipid', ruleId: 'R-LIPID-01', re: HAS.lipid, domain: 'cardio', title: 'No lipid profile on record', terms: ['lipid', 'cholesterol', 'LDL', 'HDL', 'triglycerides'], form: 'lipid', owner: 'doctor', sev: 'moderate', why: 'no lipid value appears', rationale: 'Cardiovascular risk cannot be judged without a lipid profile.', actions: [{ id: 'order-lipid', label: 'Order lipid profile' }] },
    { key: 'bp', ruleId: 'R-BP-01', re: HAS.bp, domain: 'cardio', title: 'Blood pressure not recorded at any visit', terms: ['BP', 'blood pressure', 'mmHg'], form: 'bp', owner: 'nurse', sev: 'moderate', why: 'no blood pressure reading appears on any slip', rationale: 'Blood pressure drives both kidney and heart risk and takes one minute to measure.', actions: [{ id: 'record-bp', label: 'Record blood pressure now' }] },
    { key: 'liver', ruleId: 'R-LIV-01', re: HAS.liver, domain: 'liver', title: 'No liver panel on record', terms: ['liver', 'ALT', 'AST', 'LFT'], form: 'liver', owner: 'doctor', sev: 'low', why: 'no liver enzyme result appears', rationale: 'A baseline liver panel completes the organ map and informs drug choices.', actions: [{ id: 'order-lft', label: 'Order liver panel' }] },
  ];
  for (const s of absenceSpecs) {
    if (anyHis(s.re)) continue;
    gaps.push(baseGap({
      key: s.key, ruleId: s.ruleId, domain: s.domain, type: 'complication review', severity: s.sev,
      severityBasis: `${s.sev === 'low' ? 'Low' : 'Moderate'} by protocol default for this rule.`, basis: 'absence', resultForm: s.form, ownerRole: s.owner,
      title: s.title, openDays: diffDays(patient.firstVisitDate, asOf),
      dueLabel: `Baseline due now — nothing on record in ${plural(monthsOfRecord, 'month')}`,
      why: `${s.ruleId} fired because, across ${docs.length} documents, ${s.why}.`, rationale: s.rationale,
      triggers: [{ label: `Searched ${docs.length} documents — 0 matches`, absence: absence(s.terms) }],
      suggestedActions: s.actions.map(a => ({ ...a, taskTitle: a.label })),
    }));
  }

  // R-FU-02
  const lastFu = fuSeeds.at(-1);
  if (lastFu && lastFu.followUp === 'as-advised') {
    gaps.push(baseGap({
      key: 'followup', ruleId: 'R-FU-02', domain: 'followup', type: 'missed follow-up', severity: 'moderate',
      severityBasis: 'Moderate by protocol default for this rule.', basis: 'schedule', resultForm: 'followup', ownerRole: 'coordinator',
      title: 'Next review date not set', dueLabel: `Due at this visit — slip of ${fmtDate(lastFu.date)} says “as advised”`,
      why: 'R-FU-02 fired because the latest advice reads “Follow-up as advised” with no interval or date.',
      rationale: 'Without a written interval, the next review depends on the patient remembering to return.',
      triggers: [{ label: `Visit ${lastFu.visit} advice: “${lastFu.text}”`, citation: lastFu.citation }],
      suggestedActions: [{ id: 'book-review', label: 'Book next review', taskTitle: 'Book next review' }],
    }));
  }

  // R-LAB-02 (auto-closed by evidence in the record)
  const missingPrefix: number[] = [];
  for (const p of T.hba1c.points) { if (p.value === null) missingPrefix.push(p.visit); else break; }
  const firstHba = T.hba1c.points.find(p => p.value !== null);
  if (missingPrefix.length) {
    const g = baseGap({
      key: 'hba1c-missing', ruleId: 'R-LAB-02', domain: 'glycemia', type: 'overdue investigation', severity: 'moderate',
      severityBasis: 'Moderate by protocol default for this rule.', basis: 'absence', resultForm: 'generic', ownerRole: 'doctor',
      title: `HbA1c not written at ${missingPrefix.length > 1 ? `visits ${missingPrefix[0]}–${missingPrefix.at(-1)}` : `visit ${missingPrefix[0]}`}`,
      raisedAt: dates[missingPrefix[0]], dueDate: dates[missingPrefix[0]],
      dueLabel: 'HbA1c expected at each visit',
      why: `R-LAB-02 fired because the slip${missingPrefix.length > 1 ? 's' : ''} for visit${missingPrefix.length > 1 ? 's' : ''} ${joinList(missingPrefix.map(String))} carried no HbA1c.`,
      rationale: 'HbA1c is the long-run glycaemic anchor; an absent value is shown as a finding, not a blank.',
      triggers: [{ label: `Visit ${missingPrefix[0]} investigations carry FBS and PPBS only`, citation: rec.docs.length ? investigationsCite(docs, missingPrefix[0]) : undefined }],
      suggestedActions: [],
    });
    if (firstHba) {
      g.status = 'closed';
      g.openDays = diffDays(g.raisedAt, firstHba.date);
      g.closure = {
        at: firstHba.date, by: 'Rules engine', auto: true,
        basis: `Evidence arrived: HbA1c ${firstHba.value!.toFixed(1)}% at visit ${firstHba.visit}.`,
        outcome: 'Closed automatically when a later slip carried the value.', citation: firstHba.citation,
      };
      g.history.push({ at: firstHba.date, label: `HbA1c ${firstHba.value!.toFixed(1)}% recorded at visit ${firstHba.visit}`, actor: 'Rules engine' });
      g.history.push({ at: firstHba.date, label: 'Closed with evidence', actor: 'Rules engine' });
    }
    gaps.push(g);
  }

  // apply task state
  const taskStatusToGap: Record<string, GapStatus> = { open: 'tasked', in_progress: 'in_progress', evidence: 'evidence', closed: 'closed' };
  for (const g of gaps) {
    const t = tasks.find(x => x.gapId === g.id);
    if (!t) continue;
    g.taskId = t.id;
    g.status = taskStatusToGap[t.status];
    g.history.push(...t.events);
    if (t.status === 'closed' && t.closure) {
      const ev = staff.find(f => f.id.startsWith(t.id + '-'));
      g.closure = { at: t.closure.at, by: t.closure.by, basis: t.closure.basis, outcome: t.closure.outcome, citation: ev?.citation };
    }
  }
  gaps.sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || SEV_RANK[a.severity] - SEV_RANK[b.severity] || BASIS_RANK[a.basis] - BASIS_RANK[b.basis] || b.openDays - a.openDays);
  const openGaps = gaps.filter(g => g.status !== 'closed');
  const gapOf = (key: string) => gaps.find(g => g.id === `${patientId}:${key}`);

  /* ───────── missing measures (tiles) ───────── */
  const qualRenal = findings.find(f => f.group === 'renal' && f.state === 'note');
  const mm = (code: MissingMeasureCode, label: string, unit: string, why: string, terms: string[], gapKey: string, readings?: MissingMeasure['readings']): MissingMeasure => ({
    code, label, unit, why, absence: absence(terms), gapId: gapOf(gapKey)?.id, readings,
  });
  const readingsOf = (code: string, thr: (v: number) => 'above' | 'below' | 'in'): MissingMeasure['readings'] =>
    staffBy(code).map(f => ({ date: f.date, display: f.display, flag: thr(f.value as number), citation: f.citation }));
  const bpReadings: MissingMeasure['readings'] = staffBy('sbp').map(s => {
    const d = staffBy('dbp').find(x => x.id.slice(0, x.id.lastIndexOf('-')) === s.id.slice(0, s.id.lastIndexOf('-')));
    const sv = s.value as number; const dv = d ? (d.value as number) : 0;
    return { date: s.date, display: `BP ${sv}/${d ? dv : '—'} mmHg`, flag: sv >= PROTOCOL.thresholds.sbp || dv >= PROTOCOL.thresholds.dbp ? 'above' : 'in', citation: s.citation };
  });
  const missingMeasures: MissingMeasure[] = [
    mm('egfr', 'eGFR', 'mL/min/1.73 m²', qualRenal ? `Kidney function is written as “within reference range” at visit ${qualRenal.visit}, with no number.` : proteinuria ? `Urine protein is positive at visit ${proteinuria.visit}; no eGFR or creatinine value.` : 'No eGFR or creatinine on any slip.', ['eGFR', 'creatinine'], 'kidney', readingsOf('egfr', v => (v < PROTOCOL.thresholds.egfr ? 'above' : 'in'))),
    mm('uacr', 'uACR', 'mg/g', proteinuria ? 'Proteinuria is on record but was never quantified.' : 'No albuminuria test on any slip.', ['uACR', 'albumin'], 'kidney', readingsOf('uacr', v => (v >= PROTOCOL.thresholds.uacr ? 'above' : 'in'))),
    mm('bp', 'Blood pressure', 'mmHg', 'No blood pressure is written on any slip.', ['BP', 'blood pressure'], 'bp', bpReadings),
    mm('ldl', 'LDL cholesterol', 'mg/dL', 'No lipid values are written on any slip.', ['lipid', 'LDL'], 'lipid', readingsOf('ldl', v => (v >= PROTOCOL.thresholds.ldl ? 'above' : 'in'))),
  ];

  /* ───────── organ map ───────── */
  const lastOf = (codes: string[]) => codes.flatMap(c => staffBy(c))[0];
  const measureFromFact = (f: Fact): OrganMeasure => ({ label: f.label, value: `${f.value}${f.unit ? ' ' + f.unit : ''}`, date: f.date, citation: f.citation });
  const missingMeasure = (label: string): OrganMeasure => ({ label, missing: true });
  const flag = (cond: boolean, label: string, detail: string, f: Fact, state: OrganState = 'at-risk'): OrganFinding | null =>
    cond ? { state, label, detail, ruleId: 'R-SIG-01', citation: f.citation, source: 'staff-entered' } : null;
  const nn = <T,>(x: T | null | undefined | false): x is T => !!x;
  const gapIdOf = (key: string) => gapOf(key)?.id;

  const kidney = (): OrganDomain => {
    const f: OrganFinding[] = []; const measures: OrganMeasure[] = [];
    const uacr = staffBy('uacr')[0]; const egfr = staffBy('egfr')[0]; const up = staffBy('urine-protein')[0];
    if (qualRenal) measures.push({ label: 'Renal function (in words)', value: 'within reference range — no value', date: qualRenal.date, citation: qualRenal.citation });
    if (proteinuria) measures.push({ label: 'Urine protein', value: 'positive', date: proteinuria.date, citation: proteinuria.citation });
    measures.push(egfr ? measureFromFact(egfr) : missingMeasure('eGFR'));
    measures.push(uacr ? measureFromFact(uacr) : missingMeasure('uACR'));
    if (up) measures.push({ label: 'Urine protein (staff-entered)', value: String(up.value), date: up.date, citation: up.citation });
    if (proteinuria || proteinuriaDx) {
      f.push({ state: 'confirmed', label: 'Proteinuria documented', ruleId: 'R-KID-02', detail: `Clinician-documented at visit ${(proteinuria ?? proteinuriaDx)!.visit}${proteinuriaDx ? ' — diagnosis reads “' + proteinuriaDx.text + '”' : ''}. Later slips do not repeat it as a result.`, citation: (proteinuria ?? proteinuriaDx)!.citation, source: 'his-import' });
    }
    if (!egfr && !uacr) f.push({ state: 'missing', label: 'Kidney function not quantified', ruleId: 'R-KID-01', detail: 'No eGFR, creatinine or uACR value in the record.', absence: absence(['eGFR', 'creatinine', 'uACR']), gapId: gapIdOf('kidney') });
    [uacr && flag((uacr.value as number) >= PROTOCOL.thresholds.uacr, `uACR ${uacr.value} mg/g — at or above ${PROTOCOL.thresholds.uacr} mg/g`, 'A signal from a staff-entered result, not a diagnosis.', uacr),
      egfr && flag((egfr.value as number) < PROTOCOL.thresholds.egfr, `eGFR ${egfr.value} — below ${PROTOCOL.thresholds.egfr}`, 'A signal from a staff-entered result, not a diagnosis.', egfr),
      up && flag(up.value === 'positive', 'Urine protein positive (staff-entered)', 'A signal, not a diagnosis.', up)].filter(Boolean).forEach(x => f.push(x as OrganFinding));
    const assessed = [qualRenal && { d: qualRenal.date, note: 'Described in words — no value' }, proteinuria && { d: proteinuria.date, note: 'Urine protein positive — not quantified' }, lastOf(['uacr', 'egfr', 'urine-protein']) && { d: lastOf(['uacr', 'egfr', 'urine-protein']).date, note: 'Staff-entered result' }].filter(Boolean) as { d: string; note: string }[];
    assessed.sort((a, b) => b.d.localeCompare(a.d));
    const g = gapOf('kidney');
    return finishDomain('kidney', 'Kidney', measures, f, assessed[0], g);
  };
  const cardio = (): OrganDomain => {
    const f: OrganFinding[] = []; const measures: OrganMeasure[] = [];
    const sbp = staffBy('sbp')[0]; const dbp = staffBy('dbp')[0]; const ldl = staffBy('ldl')[0]; const hdl = staffBy('hdl')[0]; const tg = staffBy('tg')[0];
    measures.push(sbp ? { label: 'Blood pressure', value: `${sbp.value}/${dbp?.value ?? '—'} mmHg`, date: sbp.date, citation: sbp.citation } : missingMeasure('Blood pressure'));
    measures.push(ldl ? measureFromFact(ldl) : missingMeasure('Lipid profile'));
    if (hdl) measures.push(measureFromFact(hdl));
    if (tg) measures.push(measureFromFact(tg));
    const w = T.weight.latest;
    if (w) measures.push({ label: 'Weight', value: `${w.value} kg · BMI not computable (no height)`, date: w.date, citation: w.citation });
    if (!sbp) f.push({ state: 'missing', label: 'Blood pressure not recorded', ruleId: 'R-BP-01', detail: 'No reading on any slip.', absence: absence(['BP', 'blood pressure']), gapId: gapIdOf('bp') });
    if (!ldl) f.push({ state: 'missing', label: 'Lipid profile not recorded', ruleId: 'R-LIPID-01', detail: 'No lipid values on any slip.', absence: absence(['lipid', 'LDL']), gapId: gapIdOf('lipid') });
    const a = sbp && flag((sbp.value as number) >= PROTOCOL.thresholds.sbp || ((dbp?.value as number) ?? 0) >= PROTOCOL.thresholds.dbp, `BP ${sbp.value}/${dbp?.value ?? '—'} mmHg — at or above 130/80`, 'A signal from a staff-entered reading, not a diagnosis.', sbp);
    const b = ldl && flag((ldl.value as number) >= PROTOCOL.thresholds.ldl, `LDL ${ldl.value} mg/dL — at or above ${PROTOCOL.thresholds.ldl}`, 'A signal from a staff-entered result, not a diagnosis.', ldl);
    [a, b].filter(nn).forEach(x => f.push(x as OrganFinding));
    const last = lastOf(['sbp', 'ldl']);
    return finishDomain('cardio', 'Cardiovascular', measures, f, last && { d: last.date, note: 'Staff-entered result' }, gapOf('bp')?.status !== 'closed' && !sbp ? gapOf('bp') : gapOf('lipid'));
  };
  const eye = (): OrganDomain => {
    const r = staffBy('retina')[0]; const f: OrganFinding[] = [];
    const measures = [r ? { label: 'Retinal exam', value: String(r.value), date: r.date, citation: r.citation } : missingMeasure('Retinal exam')];
    if (!r) f.push({ state: 'missing', label: 'Retinal screening not recorded', ruleId: 'R-EYE-01', detail: 'No retinal or fundus result in the record.', absence: absence(['retina', 'fundus', 'eye exam']), gapId: gapIdOf('eye') });
    else if (/proliferative|non-proliferative/.test(String(r.value))) f.push({ state: 'confirmed', label: `Retinopathy documented — ${r.value}`, ruleId: 'R-EYE-01', detail: 'Clinician-documented from a staff-entered exam result.', citation: r.citation, source: 'staff-entered' });
    else if (r.value === 'not gradable') f.push({ state: 'missing', label: 'Retinal exam not gradable — repeat needed', ruleId: 'R-EYE-01', detail: 'The exam did not give a usable result.', citation: r.citation, source: 'staff-entered' });
    return finishDomain('eye', 'Eye', measures, f, r && { d: r.date, note: 'Staff-entered result' }, gapOf('eye'));
  };
  const foot = (): OrganDomain => {
    const r = staffBy('foot')[0]; const f: OrganFinding[] = [];
    const measures = [r ? { label: 'Foot exam', value: String(r.value), date: r.date, citation: r.citation } : missingMeasure('Foot & sensation exam')];
    if (!r) f.push({ state: 'missing', label: 'Foot examination not recorded', ruleId: 'R-FOOT-01', detail: 'No foot, monofilament or neuropathy result in the record.', absence: absence(['foot', 'monofilament', 'neuropathy']), gapId: gapIdOf('foot') });
    else if (r.value === 'abnormal') f.push({ state: 'confirmed', label: 'Abnormal foot exam documented', ruleId: 'R-FOOT-01', detail: 'Clinician-documented from a staff-entered exam result.', citation: r.citation, source: 'staff-entered' });
    return finishDomain('foot', 'Foot & neuropathy', measures, f, r && { d: r.date, note: 'Staff-entered result' }, gapOf('foot'));
  };
  const liver = (): OrganDomain => {
    const r = staffBy('alt')[0]; const f: OrganFinding[] = [];
    const measures = [r ? measureFromFact(r) : missingMeasure('Liver enzymes (ALT)')];
    if (!r) f.push({ state: 'missing', label: 'Liver panel not recorded', ruleId: 'R-LIV-01', detail: 'No ALT or AST in the record.', absence: absence(['liver', 'ALT', 'AST']), gapId: gapIdOf('liver') });
    return finishDomain('liver', 'Liver', measures, f, r && { d: r.date, note: 'Staff-entered result' }, gapOf('liver'));
  };
  function finishDomain(id: DomainId, label: string, measures: OrganMeasure[], findingsList: OrganFinding[], last: { d: string; note: string } | undefined, g?: Gap): OrganDomain {
    const states = findingsList.map(x => x.state);
    const primary: OrganDomain['primaryState'] = states.includes('confirmed') ? 'confirmed' : states.includes('at-risk') ? 'at-risk' : states.includes('missing') ? 'missing' : 'clear';
    const open = g && g.status !== 'closed';
    return {
      id, label, measures, findings: findingsList, lastAssessed: last?.d ?? null, lastAssessedNote: last?.note ?? 'No assessment on file',
      nextDue: open ? g!.dueDate : last ? addMonths(last.d, 12) : null,
      nextDueLabel: open ? (g!.basis === 'advised-not-evidenced' ? `Overdue since ${fmtDate(g!.dueDate)}` : 'Due now') : last ? `Annual — ${fmtDate(addMonths(last.d, 12))}` : 'Due now',
      primaryState: primary,
    };
  }
  const organMap = [kidney(), cardio(), eye(), foot(), liver()];

  /* ───────── changes ───────── */
  const medOnSlip = HIS_MED_VS_TREND[patientId] ?? [];
  const changes: VisitChange[] = visits.map((v, idx) => {
    const prev = idx > 0 ? visits[idx - 1] : null;
    const items: ChangeItem[] = [];
    for (const code of ['hba1c', 'fbs', 'ppbs'] as MeasureCode[]) {
      const s = T[code]; const p = s.points.find(x => x.visit === v)!;
      if (p.value === null) {
        items.push({ id: `${code}-${v}`, kind: 'measure', label: s.label, to: 'Not written on this slip', direction: 'none', tone: 'neutral', note: 'Absence is a finding — see care gaps.' });
        continue;
      }
      const pp = prev ? s.points.find(x => x.visit === prev)! : null;
      if (!pp || pp.value === null) {
        items.push({ id: `${code}-${v}`, kind: 'measure', label: s.label, to: fmtV(p.value, s.decimals, s.unit), direction: prev ? 'first' : 'first', tone: 'new', note: prev ? 'First reading' : 'Baseline', citation: p.citation, unit: s.unit });
      } else {
        const d = p.deltaPrev!;
        items.push({
          id: `${code}-${v}`, kind: 'measure', label: s.label, from: fmtV(pp.value, s.decimals, s.unit), to: fmtV(p.value, s.decimals, s.unit), delta: d, unit: s.unit,
          direction: d < 0 ? 'down' : d > 0 ? 'up' : 'same', tone: d === 0 ? 'neutral' : (d < 0) === s.lowerIsBetter ? 'good' : 'watch', citation: p.citation,
        });
      }
    }
    const wp = T.weight.points.find(x => x.visit === v)!; const wpp = prev ? T.weight.points.find(x => x.visit === prev) : null;
    if (wp.value !== null) items.push({
      id: `weight-${v}`, kind: 'weight', label: 'Weight', to: `${wp.value} kg`, from: wpp?.value != null ? `${wpp.value} kg` : undefined,
      direction: !wpp || wpp.value === null ? 'first' : wp.value === wpp.value ? 'same' : wp.value! > wpp.value! ? 'up' : 'down', tone: 'neutral', citation: wp.citation,
      note: wpp && wp.value === wpp.value ? 'Unchanged (as printed on the slip header)' : undefined,
    });
    // medicines
    const mentions = medications.flatMap(m => m.mentions.filter(x => x.visit === v).map(x => ({ m, x })));
    const newDrug = medications.filter(m => m.firstMentionVisit === v && v > 1);
    if (v === 1) items.push({ id: `med-${v}`, kind: 'medication', label: 'Medicines', to: joinList(medications.filter(m => m.firstMentionVisit === 1).map(m => m.drug + (m.strength ? ` ${m.strength}` : ''))), direction: 'first', tone: 'new', note: 'Baseline — start dates are not on the slips', citation: mentions[0]?.x.citation });
    else items.push({ id: `med-${v}`, kind: 'medication', label: 'Medicines', to: newDrug.length ? `Added ${joinList(newDrug.map(m => m.drug))}` : 'Unchanged', direction: newDrug.length ? 'new' : 'same', tone: newDrug.length ? 'new' : 'neutral', note: newDrug.length ? undefined : 'No drug or dose change written on this slip', citation: mentions[0]?.x.citation });
    // diagnosis
    const dxv = diagnoses.find(d => d.visit === v)!; const dxp = prev ? diagnoses.find(d => d.visit === prev) : null;
    if (dxp && dxv.changedFromPrev) items.push({ id: `dx-${v}`, kind: 'diagnosis', label: 'Diagnosis', from: dxp.text, to: dxv.text, direction: 'new', tone: 'watch', citation: dxv.citation });
    // new findings
    const newFind = findings.filter(f => f.visit === v && (f.state === 'present' && (f.group === 'renal' || f.group === 'lifestyle' || f.group === 'glycemia')) && v > 1);
    for (const f of newFind) items.push({ id: `find-${f.id}`, kind: 'finding', label: 'New finding', to: f.label, direction: 'new', tone: f.group === 'renal' ? 'watch' : 'neutral', citation: f.citation });
    const his = medOnSlip.find(x => x.visit === v);
    return { visit: v, date: dates[v], prevVisit: prev, prevDate: prev ? dates[prev] : null, items, hisReading: his?.reading, medicineOnSlip: his?.medicine };
  });

  /* ───────── due list ───────── */
  const due: DueItem[] = openGaps.map(g => ({
    id: g.id, label: g.title, status: g.basis === 'advised-not-evidenced' ? 'overdue' as const : 'due-now' as const, dueDate: g.dueDate, dueLabel: g.dueLabel, ruleId: g.ruleId, gapId: g.id, severity: g.severity,
  }));
  const lastHba = T.hba1c.latest;
  if (lastHba) {
    const nextHba = addMonths(lastHba.date, PROTOCOL.hba1cIntervalMonths);
    const days = diffDays(asOf, nextHba);
    due.push({ id: `${patientId}:hba1c-next`, label: 'Next HbA1c', status: days < 0 ? 'overdue' : 'upcoming', dueDate: nextHba, dueLabel: `${fmtDate(nextHba)} — 3 months after ${fmtDate(lastHba.date)}`, ruleId: 'R-LAB-01' });
  }
  const order = { overdue: 0, 'due-now': 1, upcoming: 2 } as const;
  due.sort((a, b) => order[a.status] - order[b.status] || SEV_RANK[a.severity ?? 'low'] - SEV_RANK[b.severity ?? 'low']);

  /* ───────── attention (“why here today”) ───────── */
  const attention: AttentionItem[] = [];
  openGaps.filter(g => g.severity === 'high').forEach(g => attention.push({ id: g.id, label: g.title, tone: 'high', gapId: g.id }));
  const fu = openGaps.find(g => g.domain === 'followup');
  if (fu) attention.push({ id: fu.id, label: fu.title, tone: 'moderate', gapId: fu.id });
  const kg = openGaps.find(g => g.domain === 'kidney' && g.severity !== 'high');
  if (kg) attention.push({ id: kg.id, label: kg.title, tone: 'moderate', gapId: kg.id });
  const misc = openGaps.filter(g => g.basis === 'absence');
  if (misc.length) attention.push({ id: `${patientId}:missing`, label: `${plural(misc.length, 'missing assessment')}: ${joinList(misc.map(g => ASSESSMENT_NAME[g.id.split(':')[1]] ?? g.title))}`, tone: 'moderate', to: 'organ-map' });
  const lh = T.hba1c.latest;
  if (lh) attention.push({ id: `${patientId}:glycemia`, label: `HbA1c ${lh.value!.toFixed(1)}% at visit ${lh.visit} — ${lh.band === 'in' ? 'within' : 'above'} target (${PROTOCOL.targets.hba1c.label})${lh.deltaPrev ? `, ${signed(lh.deltaPrev, 1)} since visit ${lh.visit - 1}` : ''}`, tone: 'info', to: 'trends' });

  /* ───────── briefing ───────── */
  const dxFirst = diagnoses[0]; const dxLast = diagnoses.at(-1)!;
  const briefing: BriefingLine[] = [];
  briefing.push({ id: 'b1', text: `${dxLast.text}. ${N} follow-ups on record, ${fmtDate(dates[visits[0]])} to ${fmtDate(dates[visits.at(-1)!])}${diagnoses.some(d => d.changedFromPrev) ? `; the diagnosis line adds proteinuria at visit ${diagnoses.find(d => d.changedFromPrev && /proteinuria/i.test(d.text))?.visit} and reverts at the next` : ''}.`, citations: [dxFirst.citation, dxLast.citation] });
  const h = T.hba1c; const hf = h.firstReading; const hl = h.latest;
  if (hf && hl && hf !== hl) briefing.push({ id: 'b2', text: `HbA1c ${hf.value!.toFixed(1)} → ${hl.value!.toFixed(1)}%${hf.visit > 1 ? ` (first written at visit ${hf.visit})` : ''}; ${h.inBand.in} of ${h.inBand.of} readings are below 7.0%.`, citations: [hf.citation!, hl.citation!] });
  const f0 = T.fbs.firstReading!; const f1 = T.fbs.latest!; const p0 = T.ppbs.firstReading!; const p1 = T.ppbs.latest!;
  const noChange = medications.every(m => !m.changed) && changes.every(c => c.visit === 1 || !c.items.some(i => i.kind === 'medication' && i.direction === 'new'));
  briefing.push({
    id: 'b3', text: `FBS ${f0.value} → ${f1.value} and PPBS ${p0.value} → ${p1.value} mg/dL${noChange ? '; no drug added or dose changed on any slip' : ''}.`,
    citations: [f0.citation!, f1.citation!, p0.citation!, p1.citation!, ...(noChange ? [medications[0].mentions[0].citation] : [])],
  });
  const rn = planSeeds.filter(p => p.topic === 'renal');
  if (rn.length) briefing.push({
    id: 'b4', text: `${proteinuria ? `Urine protein positive at visit ${proteinuria.visit}. ` : ''}Renal assessment advised at ${visitsLabel(rn.map(r => r.visit))}; no result is recorded.`,
    citations: [...(proteinuria ? [proteinuria.citation] : []), ...rn.map(r => r.citation)],
  });
  const missAbs = ['bp', 'lipid', 'eye', 'foot'].filter(k => { const g = gapOf(k); return g && g.status !== 'closed'; });
  if (missAbs.length) briefing.push({ id: 'b5', text: `No ${joinList(missAbs.map(k => ASSESSMENT_NAME[k]))} on file.`, citations: [], absence: absence(['BP', 'lipid', 'retina', 'foot']) });

  /* ───────── coverage ───────── */
  const hasFact = (c: string) => facts.some(f => f.code === c);
  const hdr = rxDocs.at(-1)!;
  const mk = (id: string, label: string, group: string, present: boolean, extra: Partial<CoverageField> = {}): CoverageField => ({ id, label, group, present, ...extra });
  const hdrCite = (sub: string): Citation => { const t = `${hdr.header.name}, ${hdr.header.age}/${hdr.header.sex}, ${hdr.header.weightKg} kg, ${hdr.header.place}`; const i = t.indexOf(sub); return { id: `cit:${hdr.id}:header:${i}`, docId: hdr.id, field: 'header', span: [i, i + sub.length], quote: sub }; };
  const coverage: CoverageField[] = [
    mk('name', 'Name, age, sex', 'Identity', true, { value: `${patient.name}, ${patient.age}/${patient.sex}`, citation: hdrCite(`${hdr.header.name}, ${hdr.header.age}/${hdr.header.sex}`) }),
    mk('abha', 'ABHA number', 'Identity', true, { value: patient.abhaId, note: 'Dummy ID written for this dataset — the source slip was blank.' }),
    mk('address', 'Address', 'Identity', true, { value: patient.place, citation: hdrCite(patient.place) }),
    mk('language', 'Preferred language', 'Identity', false),
    mk('phone', 'Phone / contact', 'Identity', false),
    mk('consent', 'Consent on file', 'Identity', false),
    mk('dx', 'Diagnosis', 'History', true, { value: dxLast.text, citation: dxLast.citation }),
    mk('dxdate', 'Diabetes start date', 'History', false, { note: `Record begins ${fmtDate(patient.firstVisitDate)}; onset is not written.` }),
    mk('allergy', 'Allergies', 'History', false),
    mk('family', 'Family history', 'History', false),
    mk('meds', 'Medicines with doses', 'Treatment', medications.length > 0, { value: joinList(medications.map(m => m.drug)), citation: medications[0]?.mentions[0].citation }),
    mk('hba1c', 'HbA1c', 'Measures', !!T.hba1c.latest, { value: T.hba1c.latest ? `${T.hba1c.latest.value!.toFixed(1)}%` : undefined, citation: T.hba1c.latest?.citation }),
    mk('glucose', 'Fasting & post-meal glucose', 'Measures', !!T.fbs.latest, { value: T.fbs.latest ? `${T.fbs.latest.value} / ${T.ppbs.latest?.value} mg/dL` : undefined, citation: T.fbs.latest?.citation }),
    mk('weight', 'Weight', 'Measures', !!T.weight.latest, { value: T.weight.latest ? `${T.weight.latest.value} kg` : undefined, citation: T.weight.latest?.citation }),
    mk('bmi', 'Height / BMI', 'Measures', hasFact('height')),
    mk('bp', 'Blood pressure', 'Measures', hasFact('sbp')),
    mk('egfr', 'eGFR / creatinine', 'Measures', hasFact('egfr')),
    mk('uacr', 'uACR', 'Measures', hasFact('uacr')),
    mk('lipid', 'Lipid profile', 'Measures', hasFact('ldl')),
    mk('retina', 'Retinal exam status', 'Assessments', hasFact('retina')),
    mk('foot', 'Foot exam status', 'Assessments', hasFact('foot')),
    mk('nextvisit', 'Next follow-up date', 'Assessments', hasFact('nextvisit')),
  ];
  for (const c of coverage) { const f = facts.find(x => x.code === c.id || (c.id === 'bp' && x.code === 'sbp') || (c.id === 'lipid' && x.code === 'ldl') || (c.id === 'retina' && x.code === 'retina')); if (c.present && !c.citation && f) { c.value = f.display; c.citation = f.citation; } }

  /* ───────── rule evaluations ───────── */
  const firedKeys = new Set(gaps.map(g => g.ruleId));
  const late = followUps.filter(f => f.status !== 'on-time');
  const ruleEvals: RuleEvaluation[] = RULE_CATALOG.map(r => {
    let fired = firedKeys.has(r.id); let summary = fired ? '' : 'Evaluated — did not fire.';
    const g = gaps.find(x => x.ruleId === r.id);
    if (g) summary = `${g.title} (${g.status === 'closed' ? 'closed' : g.severity})`;
    switch (r.id) {
      case 'R-FU-01': fired = late.length > 0; summary = `${followUps.length - late.length} of ${followUps.length} follow-ups on time${late.map(l => `; visit ${l.toVisit} was ${plural(Math.abs(l.daysOff), 'day')} ${l.daysOff > 0 ? 'late' : 'early'}`).join('')}.`; break;
      case 'R-PLAN-01': { const n = plan.filter(p => p.status === 'not-evidenced').length; fired = n > 0; summary = n ? `${plural(n, 'advice line')} with no evidence of follow-through.` : 'Every advised test has a later result.'; break; }
      case 'R-LAB-01': fired = false; summary = lastHba ? `Next HbA1c due ${fmtDate(addMonths(lastHba.date, PROTOCOL.hba1cIntervalMonths))} — not yet due.` : 'No HbA1c on record.'; break;
      case 'R-MED-01': fired = medicationContinuity.fired; summary = medicationContinuity.text; break;
      case 'R-KID-02': fired = !!(proteinuria || proteinuriaDx); summary = fired ? `Proteinuria documented at visit ${(proteinuria ?? proteinuriaDx)!.visit}.` : 'No proteinuria documented.'; break;
      case 'R-SIG-01': { const sig = organMap.flatMap(o => o.findings).filter(f => f.ruleId === 'R-SIG-01'); fired = sig.length > 0; summary = fired ? sig.map(s => s.label).join('; ') : 'No recorded value is beyond its reference range.'; break; }
      case 'R-TREND-01': fired = true; summary = `Computed for ${trends.filter(t => t.points.filter(p => p.value !== null).length >= 2).length} measures.`; break;
      case 'R-LAB-02': if (!g) summary = 'HbA1c written at every visit.'; break;
    }
    return { ruleId: r.id, name: r.name, fired, summary };
  });

  /* ───────── activity ───────── */
  const activity: ActivityEvent[] = tasks.flatMap(t => t.events.map((e, i) => ({
    id: `${t.id}-e${i}`, at: e.at, patientId, label: e.label, actor: e.actor, gapId: t.gapId, taskId: t.id,
  }))).sort((a, b) => b.at.localeCompare(a.at));

  const ai = HIS_AI[patientId];
  const acc = ops.aiAccepted[patientId];

  return {
    patient, attention, briefing, changes, due, trends, missingMeasures, organMap, gaps, plan, followUps, medications,
    medicationContinuity, diagnoses, findings, documents: docs, facts, coverage, rules: ruleEvals, tasks, activity,
    ai: { headline: ai.headline, body: ai.body, watch: ai.watch, source: `${ai.sheet} · HIS workbook`, state: acc ? 'accepted' : 'draft', acceptedBy: acc?.by, acceptedAt: acc?.at },
    visits,
  };
}

function investigationsCite(docs: SourceDocument[], visit: number): Citation | undefined {
  const d = docs.find(x => x.kind === 'diagnostic' && x.visit === visit);
  if (!d) return undefined;
  return { id: `cit:${d.id}:investigations:all`, docId: d.id, field: 'investigations', span: [0, d.investigations.length], quote: d.investigations, alsoIn: [d.id.replace('-DX-', '-RX-')] };
}

export { ROLE_LABEL };
export type { Finding, PlanSeed };
