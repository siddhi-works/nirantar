/**
 * Shared domain contract. The UI and the (mock) server both speak these types, so a real
 * backend only has to honour them. Mirrors the PRD data model: evidence → fact → gap → task.
 */

export type ISODate = string; // YYYY-MM-DD
export type PatientId = string;
export type Role = 'doctor' | 'nurse' | 'coordinator';
export type Severity = 'high' | 'moderate' | 'low';

/* ───────────────────────── Identity ───────────────────────── */

export interface Patient {
  id: PatientId;
  name: string;
  age: number;
  sex: 'M' | 'F';
  weightKg: number;
  place: string;
  city: string;
  abhaId: string;
  abhaNote: string;
  doctor: string;
  doctorRegNo: string;
  visitCount: number;
  firstVisitDate: ISODate;
  lastVisitDate: ISODate;
  /** Each patient is evaluated "as of" their latest slip (synthetic dates span 2000–2027). */
  asOf: ISODate;
  initials: string;
}

/* ───────────────────────── Evidence ───────────────────────── */

export type SlipField = 'header' | 'complaint' | 'investigations' | 'diagnosis' | 'advice';

export interface SourceDocument {
  id: string; // e.g. P1-DX-V3
  patientId: PatientId;
  visit: number;
  kind: 'prescription' | 'diagnostic';
  title: string;
  date: ISODate;
  sheet: string; // workbook sheet
  sheetRow: number;
  header: { abha: string; name: string; age: number; sex: 'M' | 'F'; weightKg: number; place: string };
  complaint: string;
  investigations: string;
  diagnosis: string;
  advice: string[]; // numbered items, numbering stripped
  doctor: string;
  regNo: string;
  /** Workbook: "Prescription and diagnostic report are the same text for now." */
  copyOf?: string;
}

/** Points at an exact region of a source document. */
export interface Citation {
  id: string;
  docId: string;
  field: SlipField;
  adviceIndex?: number;
  /** [start,end) character span within the cited field's text (or advice item) */
  span?: [number, number];
  quote: string;
  /** Other documents carrying the identical text (corroboration) */
  alsoIn?: string[];
  /** Staff-entered evidence has no slip; it points at a closure record instead */
  closureRef?: { taskId: string; label: string };
}

/** "Absence is a finding": what was searched and not found. */
export interface AbsenceEvidence {
  searchedDocIds: string[];
  terms: string[];
  matches: 0;
  scope: string; // e.g. "12 months of record, 10 documents"
}

export interface Trigger {
  label: string;
  detail?: string;
  citation?: Citation;
  absence?: AbsenceEvidence;
}

/* ───────────────────────── Facts ───────────────────────── */

export type FactKind = 'observation' | 'medication' | 'condition' | 'finding' | 'followup' | 'plan';
export type VerificationState = 'imported' | 'verified' | 'corrected';

export interface Extractor {
  name: string;
  version: string;
  rule: string;
}

export interface Fact {
  id: string;
  patientId: PatientId;
  visit: number; // 0 for staff-entered facts outside a visit
  date: ISODate;
  kind: FactKind;
  code: string;
  label: string;
  value?: number | string;
  unit?: string;
  display: string; // human display, e.g. "HbA1c 6.1%"
  source: 'his-import' | 'staff-entered';
  citation: Citation;
  extractor: Extractor;
  verification: VerificationState;
  verifiedBy?: string;
  verifiedAt?: string;
  /** Free structured detail (e.g. medication dose) */
  detail?: Record<string, string | number | boolean | null>;
}

/* ───────────────────────── Computed views ───────────────────────── */

export type MeasureCode = 'hba1c' | 'fbs' | 'ppbs' | 'weight';
export type MissingMeasureCode = 'egfr' | 'uacr' | 'bp' | 'ldl';

export interface TargetBand {
  min?: number;
  max?: number;
  maxExclusive?: boolean;
  label: string; // "< 7.0 %"
  note: string;
}

export interface TrendPoint {
  visit: number;
  date: ISODate;
  value: number | null; // null = not written that visit
  factId?: string;
  citation?: Citation;
  deltaPrev: number | null;
  deltaBase: number | null;
  band: 'in' | 'above' | 'below' | null;
  verification?: VerificationState;
}

export interface TrendSeries {
  code: MeasureCode;
  label: string;
  unit: string;
  decimals: number;
  lowerIsBetter: boolean;
  target?: TargetBand;
  points: TrendPoint[];
  latest: TrendPoint | null;
  firstReading: TrendPoint | null;
  inBand: { in: number; of: number };
  summary: string; // text alternative for screen readers
}

/** Result-type measures with no readings: shown as designed "missing" tiles, never blank. */
export interface MissingMeasure {
  code: MissingMeasureCode;
  label: string;
  unit: string;
  why: string;
  absence: AbsenceEvidence;
  gapId?: string;
  /** staff-entered readings after closure */
  readings?: { date: ISODate; display: string; flag?: 'above' | 'below' | 'in'; citation: Citation }[];
}

export interface ChangeItem {
  id: string;
  kind: 'measure' | 'medication' | 'diagnosis' | 'finding' | 'weight';
  label: string;
  from?: string;
  to: string;
  delta?: number;
  unit?: string;
  direction: 'down' | 'up' | 'same' | 'new' | 'first' | 'none';
  tone: 'good' | 'watch' | 'neutral' | 'new';
  note?: string;
  citation?: Citation;
}

export interface VisitChange {
  visit: number;
  date: ISODate;
  prevVisit: number | null;
  prevDate: ISODate | null;
  items: ChangeItem[];
  /** HIS-sheet "reading against the last visit" text, kept verbatim */
  hisReading?: string;
  medicineOnSlip?: string;
}

/* Medication & treatment */

export interface MedicationMention {
  visit: number;
  date: ISODate;
  /** named = drug named on slip; by-reference = "existing treatment" only */
  mode: 'dose-stated' | 'named' | 'by-reference';
  text: string;
  citation: Citation;
}

export interface Medication {
  drug: string;
  strength?: string;
  regimen: string;
  route: string;
  firstMentionVisit: number;
  mentions: MedicationMention[];
  doseNote: string;
  changed: boolean;
}

export interface DiagnosisEntry {
  patientId: PatientId;
  visit: number;
  date: ISODate;
  text: string;
  changedFromPrev: boolean;
  citation: Citation;
}

export type FindingState = 'present' | 'absent' | 'reduced' | 'resolved' | 'note';
export interface Finding {
  id: string;
  patientId: PatientId;
  visit: number;
  date: ISODate;
  group: 'symptom' | 'hypoglycemia' | 'renal' | 'lifestyle' | 'glycemia' | 'general';
  label: string;
  state: FindingState;
  text: string;
  citation: Citation;
}

export type PlanCategory = 'medication' | 'lifestyle' | 'monitoring' | 'test' | 'followup';
export type PlanStatus = 'continued' | 'evidenced' | 'not-evidenced' | 'kept' | 'kept-late' | 'not-set' | 'upcoming';
export interface PlanItem {
  id: string;
  patientId: PatientId;
  visit: number;
  date: ISODate;
  category: PlanCategory;
  text: string;
  status: PlanStatus;
  statusNote: string;
  topic?: string; // "renal", "hba1c", ...
  citation: Citation;
}

export interface FollowUpCheck {
  fromVisit: number;
  toVisit: number;
  advised: string; // "3 months"
  expectedDate: ISODate;
  actualDate: ISODate;
  daysOff: number; // + late, − early
  status: 'on-time' | 'late' | 'early';
  citation: Citation;
}

/* Gaps, milestones, organ map */

export type DomainId = 'kidney' | 'cardio' | 'eye' | 'foot' | 'liver';
export type GapDomain = DomainId | 'glycemia' | 'followup';
export type GapStatus = 'open' | 'tasked' | 'in_progress' | 'evidence' | 'closed';
export type ResultFormKind = 'kidney' | 'eye' | 'foot' | 'lipid' | 'bp' | 'liver' | 'followup' | 'generic';

export interface SuggestedAction {
  id: string;
  label: string; // verb-first: "Order uACR"
  taskTitle: string;
}

export interface GapEvent {
  at: string;
  label: string;
  actor: string;
}

export interface Gap {
  id: string;
  patientId: PatientId;
  ruleId: string;
  ruleVersion: string;
  title: string;
  domain: GapDomain;
  type: 'overdue investigation' | 'missed follow-up' | 'complication review' | 'unreviewed result' | 'medication continuity';
  severity: Severity;
  severityBasis: string;
  basis: 'advised-not-evidenced' | 'absence' | 'schedule';
  raisedAt: ISODate;
  openDays: number;
  dueDate: ISODate;
  dueLabel: string;
  why: string; // "This rule fired because…"
  rationale: string; // one clinical sentence
  triggers: Trigger[];
  suggestedActions: SuggestedAction[];
  ownerRole: Role;
  status: GapStatus;
  taskId?: string;
  resultForm: ResultFormKind;
  history: GapEvent[];
  closure?: {
    at: string;
    by: string;
    basis: string;
    outcome: string;
    citation?: Citation;
    auto?: boolean;
  };
}

export type OrganState = 'confirmed' | 'at-risk' | 'missing';
export interface OrganFinding {
  state: OrganState;
  label: string;
  detail: string;
  ruleId: string;
  citation?: Citation;
  absence?: AbsenceEvidence;
  source?: 'his-import' | 'staff-entered';
  gapId?: string;
}
export interface OrganMeasure {
  label: string;
  value?: string;
  date?: ISODate;
  citation?: Citation;
  missing?: boolean;
}
export interface OrganDomain {
  id: DomainId;
  label: string;
  measures: OrganMeasure[];
  findings: OrganFinding[];
  lastAssessed: ISODate | null;
  lastAssessedNote: string;
  nextDue: ISODate | null;
  nextDueLabel: string;
  primaryState: OrganState | 'clear';
}

export interface DueItem {
  id: string;
  label: string;
  status: 'overdue' | 'due-now' | 'upcoming';
  dueDate: ISODate;
  dueLabel: string;
  ruleId: string;
  gapId?: string;
  severity?: Severity;
}

export interface AttentionItem {
  id: string;
  label: string;
  tone: 'high' | 'moderate' | 'info';
  gapId?: string;
  to?: string; // tab target
}

export interface BriefingLine {
  id: string;
  text: string;
  citations: Citation[];
  absence?: AbsenceEvidence;
}

export interface CoverageField {
  id: string;
  label: string;
  group: string;
  present: boolean;
  value?: string;
  citation?: Citation;
  note?: string;
}

export interface RuleEvaluation {
  ruleId: string;
  name: string;
  fired: boolean;
  summary: string;
}

/* Tasks (Setu) */

export type TaskStatus = 'open' | 'in_progress' | 'evidence' | 'closed';
export interface TaskEvidence {
  kind: 'values' | 'document' | 'note';
  summary: string;
  values?: { code: string; label: string; value: string; unit?: string }[];
  attachment?: string;
  at: string;
  by: string;
}
export interface Task {
  id: string;
  patientId: PatientId;
  gapId: string;
  ruleId: string;
  title: string;
  owner: Role;
  priority: Severity;
  dueDate: ISODate;
  status: TaskStatus;
  origin: 'rules-engine' | 'user';
  note?: string;
  createdAt: string;
  createdBy: string;
  action?: { type: string; note: string; at: string; by: string };
  evidence?: TaskEvidence;
  closure?: { outcome: string; at: string; by: string; basis: string };
  events: GapEvent[];
}

/* ───────────────────────── Payloads ───────────────────────── */

export interface ActivityEvent {
  id: string;
  at: string;
  patientId: PatientId;
  label: string;
  actor: string;
  gapId?: string;
  taskId?: string;
}

export interface AiDraft {
  headline: string;
  body: string;
  watch: string | null;
  source: string;
  state: 'draft' | 'accepted';
  acceptedBy?: string;
  acceptedAt?: string;
}

export interface Recall {
  patient: Patient;
  attention: AttentionItem[];
  briefing: BriefingLine[];
  changes: VisitChange[]; // one per visit, oldest → newest
  due: DueItem[];
  trends: TrendSeries[];
  missingMeasures: MissingMeasure[];
  organMap: OrganDomain[];
  gaps: Gap[]; // includes closed
  plan: PlanItem[];
  followUps: FollowUpCheck[];
  medications: Medication[];
  medicationContinuity: { fired: boolean; text: string };
  diagnoses: DiagnosisEntry[];
  findings: Finding[];
  documents: SourceDocument[];
  facts: Fact[];
  coverage: CoverageField[];
  rules: RuleEvaluation[];
  tasks: Task[];
  activity: ActivityEvent[];
  ai: AiDraft;
  visits: number[];
}

export interface RuleDefinition {
  id: string;
  version: string;
  name: string;
  family: string;
  intent: string;
  trigger: string;
  interval: string;
  severity: string;
  ownerRole: string;
  effective: string;
  kind: 'gap' | 'milestone' | 'informational';
}

export interface AuditEvent {
  id: string;
  at: string; // wall clock
  actorRole: Role;
  action: string;
  target: string;
  patientId?: PatientId;
  purpose: string;
  detail?: string;
}

export interface PatientSummary {
  patient: Patient;
  latestHba1c: TrendPoint | null;
  hba1cSpark: (number | null)[];
  openGaps: number;
  highGaps: number;
  moderateGaps: number;
  lowGaps: number;
  attention: AttentionItem[];
  coveragePct: number;
  coverageOf: [number, number];
  diagnosis: string;
  medicines: string[];
}

export interface ClinicOverview {
  patients: PatientSummary[];
  loop: { raised: number; action: number; evidence: number; closed: number; closedByRecord: number };
  kpis: {
    openGaps: number;
    highGaps: number;
    planNotEvidenced: number;
    followUpOnTime: [number, number];
    tasksOpen: number;
    coveragePct: number;
  };
  topGaps: Gap[];
  cohort: { patientId: PatientId; name: string; medsUnchanged: boolean; series: Record<'hba1c' | 'fbs' | 'ppbs', (number | null)[]>; deltas: Record<'hba1c' | 'fbs' | 'ppbs', number | null> }[];
}

export interface SearchHit {
  patient: Patient;
  matched: string; // which field matched
  score: number;
}

export type ClosureFormValues = Record<string, string>;

export interface CreateTaskInput {
  gapId: string;
  title: string;
  owner: Role;
  priority: Severity;
  dueDate: ISODate;
  note?: string;
}
export interface ActionInput {
  taskId: string;
  type: string;
  note: string;
}
export interface EvidenceInput {
  taskId: string;
  kind: 'values' | 'document' | 'note';
  values?: ClosureFormValues;
  attachment?: string;
  note?: string;
}
export interface CloseInput {
  taskId: string;
  outcome: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
