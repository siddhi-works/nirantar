import type { RuleDefinition } from '@/domain/types';

const EFFECTIVE = 'Prototype ruleset v0.1 — pending clinical sign-off';

/** The only place gaps can come from. Every gap carries one of these ids + version. */
export const RULE_CATALOG: RuleDefinition[] = [
  {
    id: 'R-KID-01', version: '1.0', name: 'Kidney assessment not quantified', family: 'Gap detection', kind: 'gap',
    intent: 'Make sure kidney function and albuminuria are measured, not only described in words.',
    trigger: 'No eGFR, creatinine or uACR result in any document of the record. Renal advice with no later result escalates the due state to overdue.',
    interval: 'Baseline due now; then annual', severity: 'High if proteinuria is on record, otherwise Moderate', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-EYE-01', version: '1.0', name: 'Retinal screening absent', family: 'Gap detection', kind: 'gap',
    intent: 'Detect diabetic eye disease early.',
    trigger: 'No retinal or fundus examination result in the record.',
    interval: 'Baseline due now; then annual', severity: 'Moderate', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-FOOT-01', version: '1.0', name: 'Foot examination absent', family: 'Gap detection', kind: 'gap',
    intent: 'Detect neuropathy and foot at-risk status.',
    trigger: 'No foot, monofilament or neuropathy examination in the record.',
    interval: 'Baseline due now; then annual', severity: 'Moderate', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-LIPID-01', version: '1.0', name: 'Lipid profile absent', family: 'Gap detection', kind: 'gap',
    intent: 'Keep cardiovascular risk visible.',
    trigger: 'No lipid values (LDL, HDL, triglycerides, cholesterol) in the record.',
    interval: 'Baseline due now; then annual', severity: 'Moderate', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-BP-01', version: '1.0', name: 'Blood pressure not recorded', family: 'Gap detection', kind: 'gap',
    intent: 'Blood pressure is checked at every visit.',
    trigger: 'No blood pressure reading on any slip.',
    interval: 'Every visit', severity: 'Moderate', ownerRole: 'Nurse / clinic staff', effective: EFFECTIVE,
  },
  {
    id: 'R-LIV-01', version: '1.0', name: 'Liver panel absent', family: 'Gap detection', kind: 'gap',
    intent: 'Keep the liver domain from being silently blank.',
    trigger: 'No liver enzyme result (ALT, AST) in the record.',
    interval: 'Per clinician', severity: 'Low', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-FU-02', version: '1.0', name: 'Next follow-up not set', family: 'Gap detection', kind: 'gap',
    intent: 'Every visit ends with a next review the patient can act on.',
    trigger: 'The latest advice has no follow-up interval or date ("as advised").',
    interval: 'Every visit', severity: 'Moderate', ownerRole: 'Care coordinator', effective: EFFECTIVE,
  },
  {
    id: 'R-LAB-02', version: '1.0', name: 'HbA1c not written at visit', family: 'Gap detection', kind: 'gap',
    intent: 'A missing HbA1c is a finding. It closes by itself when a later slip carries a value.',
    trigger: 'HbA1c absent at a visit. Closed automatically when evidence arrives at a later visit.',
    interval: 'Per visit', severity: 'Moderate', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-MED-01', version: '1.0', name: 'Medication continuity', family: 'Medication continuity', kind: 'gap',
    intent: 'Catch drugs that stop without a reason, and duplicate therapy.',
    trigger: 'A drug named earlier is absent from a later slip with no stop written, or two drugs of one class appear together.',
    interval: 'Every visit', severity: 'Moderate', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-PLAN-01', version: '1.0', name: 'Advised test not evidenced', family: 'Plan continuity', kind: 'informational',
    intent: 'What was asked for last time should be visible at the point of decision.',
    trigger: 'An advice line asks for a test and no result of that kind appears at a later visit.',
    interval: 'Per advice line', severity: 'Shown on the plan; escalates the matching gap', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-LAB-01', version: '1.0', name: 'HbA1c recurrence', family: 'Milestone schedule', kind: 'milestone',
    intent: 'Schedule the next HbA1c from the last one.',
    trigger: 'Next HbA1c = last HbA1c date + 3 months (the cadence the slips themselves use).',
    interval: '3 months', severity: 'Upcoming, then overdue', ownerRole: 'Care coordinator', effective: EFFECTIVE,
  },
  {
    id: 'R-FU-01', version: '1.0', name: 'Follow-up interval adherence', family: 'Engagement', kind: 'informational',
    intent: 'Show whether the patient came back when the last slip asked.',
    trigger: 'Next visit date differs from (previous visit + advised interval) by more than 7 days.',
    interval: 'Per slip', severity: 'Informational', ownerRole: 'Care coordinator', effective: EFFECTIVE,
  },
  {
    id: 'R-KID-02', version: '1.0', name: 'Proteinuria documented', family: 'Organ map', kind: 'informational',
    intent: 'Carry clinician-documented kidney findings into the organ map as a confirmed condition.',
    trigger: 'Diagnosis text or an investigation line records proteinuria / positive urine protein.',
    interval: 'On evidence', severity: 'Confirmed condition', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-SIG-01', version: '1.0', name: 'Result beyond reference (signal)', family: 'Organ map', kind: 'informational',
    intent: 'Raise a signal — explicitly not a diagnosis — when a recorded value is beyond its reference.',
    trigger: 'uACR ≥ 30 mg/g · eGFR < 60 · BP ≥ 130/80 · LDL ≥ 100 mg/dL.',
    interval: 'On evidence', severity: 'At risk', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
  {
    id: 'R-TREND-01', version: '1.0', name: 'Trend and rate of change', family: 'Trend', kind: 'informational',
    intent: 'Show direction and size of change since the last visit and since baseline.',
    trigger: 'Two or more readings of the same measure.',
    interval: 'Every visit', severity: 'Informational', ownerRole: 'Doctor', effective: EFFECTIVE,
  },
];

export const ruleById = (id: string) => RULE_CATALOG.find(r => r.id === id)!;
