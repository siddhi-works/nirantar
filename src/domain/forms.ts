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

export const RESULT_FORMS: Record<ResultFormKind, ResultForm> = {
  kidney: {
    kind: 'kidney', title: 'Kidney results', requireAny: true,
    blurb: 'Enter whichever results came back. Values are stored as staff-entered until a clinician closes the task.',
    fields: [
      { code: 'uacr', label: 'uACR', unit: 'mg/g', type: 'number', min: 0, max: 5000, step: 0.1, placeholder: 'e.g. 24' },
      { code: 'egfr', label: 'eGFR', unit: 'mL/min/1.73 m²', type: 'number', min: 5, max: 150, step: 1, placeholder: 'e.g. 78' },
      {
        code: 'urine-protein', label: 'Urine protein', type: 'select',
        options: [{ value: '', label: 'Not tested' }, { value: 'negative', label: 'Negative' }, { value: 'trace', label: 'Trace' }, { value: 'positive', label: 'Positive' }],
      },
    ],
  },
  eye: {
    kind: 'eye', title: 'Retinal exam result', requireAny: true,
    blurb: 'Record what the examiner documented.',
    fields: [{
      code: 'retina', label: 'Retinal exam', type: 'select',
      options: [
        { value: '', label: 'Select result' }, { value: 'no retinopathy', label: 'No retinopathy' },
        { value: 'non-proliferative retinopathy', label: 'Non-proliferative retinopathy' },
        { value: 'proliferative retinopathy', label: 'Proliferative retinopathy' }, { value: 'not gradable', label: 'Not gradable — repeat needed' },
      ],
    }],
  },
  foot: {
    kind: 'foot', title: 'Foot exam result', requireAny: true,
    blurb: 'Record the foot and sensation examination outcome.',
    fields: [{
      code: 'foot', label: 'Foot exam', type: 'select',
      options: [{ value: '', label: 'Select result' }, { value: 'normal', label: 'Normal — sensation intact' }, { value: 'abnormal', label: 'Abnormal — needs follow-up' }],
    }],
  },
  lipid: {
    kind: 'lipid', title: 'Lipid profile', requireAny: true, blurb: 'Enter the values reported by the lab.',
    fields: [
      { code: 'ldl', label: 'LDL cholesterol', unit: 'mg/dL', type: 'number', min: 10, max: 500, step: 1 },
      { code: 'hdl', label: 'HDL cholesterol', unit: 'mg/dL', type: 'number', min: 5, max: 200, step: 1 },
      { code: 'tg', label: 'Triglycerides', unit: 'mg/dL', type: 'number', min: 20, max: 2000, step: 1 },
    ],
  },
  bp: {
    kind: 'bp', title: 'Blood pressure', requireAny: true, blurb: 'Both readings are needed.',
    fields: [
      { code: 'sbp', label: 'Systolic', unit: 'mmHg', type: 'number', min: 60, max: 260, step: 1 },
      { code: 'dbp', label: 'Diastolic', unit: 'mmHg', type: 'number', min: 30, max: 160, step: 1 },
    ],
  },
  liver: {
    kind: 'liver', title: 'Liver panel', requireAny: true, blurb: 'Enter the value reported by the lab.',
    fields: [{ code: 'alt', label: 'ALT', unit: 'U/L', type: 'number', min: 1, max: 1500, step: 1 }],
  },
  followup: {
    kind: 'followup', title: 'Next review', requireAny: true, blurb: 'Record the booked appointment date.',
    fields: [{ code: 'nextvisit', label: 'Next review date', type: 'date' }],
  },
  generic: { kind: 'generic', title: 'Evidence', requireAny: false, blurb: '', fields: [] },
};

export const ACTION_TYPES: Record<ResultFormKind, string[]> = {
  kidney: ['Ordered uACR and eGFR', 'Ordered repeat urine protein quantification', 'Result received from lab', 'Referred to nephrology', 'Contacted patient to attend lab'],
  eye: ['Referred for dilated retinal exam', 'Retinal exam booked', 'Exam done in clinic', 'Contacted patient'],
  foot: ['Foot exam done at visit', 'Booked foot exam', 'Referred to podiatry', 'Contacted patient'],
  lipid: ['Ordered lipid profile', 'Result received from lab', 'Contacted patient to attend lab'],
  bp: ['BP measured at desk', 'Asked patient to log home BP', 'Booked BP check'],
  liver: ['Ordered liver panel', 'Result received from lab', 'Contacted patient to attend lab'],
  followup: ['Appointment booked', 'Contacted patient', 'Message sent after approval'],
  generic: ['Action taken', 'Contacted patient'],
};

export const ROLE_LABEL: Record<Role, string> = { doctor: 'Doctor', nurse: 'Nurse / clinic staff', coordinator: 'Care coordinator' };
export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', moderate: 'Moderate', low: 'Low' };
export const SEVERITY_RANK: Record<Severity, number> = { high: 0, moderate: 1, low: 2 };

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
