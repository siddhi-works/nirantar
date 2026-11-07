import type { ResultFormKind, Severity, Role } from './types';

/** Structured evidence forms used when closing a gap. Shared by the UI (render) and the server (validate). */
export interface FormField {
  code: string;
  label: string;
  unit?: string;
  type: 'number' | 'select' | 'date';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
}
export interface ResultForm {
  kind: ResultFormKind;
  title: string;
  blurb: string;
  fields: FormField[];
  /** at least one field must be filled (or an attachment/note given) */
  requireAny: boolean;
}

export const ROLE_LABEL: Record<Role, string> = { doctor: 'Doctor', nurse: 'Nurse / clinic staff', coordinator: 'Care coordinator' };
export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', moderate: 'Moderate', low: 'Low' };

/** Prototype protocol. Thresholds are configuration, not patient data; pending clinical sign-off. */
export const PROTOCOL = {
  version: 'proto-0.1',
  status: 'Prototype protocol — pending clinical sign-off',
  hba1cIntervalMonths: 3,
  followUpToleranceDays: 7,
  autoTaskSeverity: 'high' as Severity,
  taskDueDays: { high: 7, moderate: 21, low: 45 } as Record<Severity, number>,
  targets: {
    hba1c: { max: 7.0, maxExclusive: true, label: '< 7.0 %', note: 'General adult goal. An individualised target is not recorded for this patient.' },
    fbs: { min: 80, max: 130, label: '80–130 mg/dL', note: 'Fasting goal band. An individualised target is not recorded.' },
    ppbs: { max: 180, label: '< 180 mg/dL', note: 'Post-meal goal band. Timing after the meal is not written on the slips.' },
  },
  thresholds: { uacr: 30, egfr: 60, sbp: 130, dbp: 80, ldl: 100 },
};
