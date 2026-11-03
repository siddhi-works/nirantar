export const DOC_TYPES = [
  'Prescription',
  'Blood glucose report (FBS / PPBS / RBS)',
  'HbA1c report',
  'Kidney function (creatinine / eGFR)',
  'Urine albumin / protein (uACR)',
  'Lipid profile',
  'Liver function test',
  'Eye (retina) examination report',
  'Foot / neuropathy examination',
  'Blood pressure / vitals chart',
  'Home glucose log',
  'ECG / cardiac report',
  'Discharge summary',
  'Referral / specialist note',
  'Other',
] as const;

export interface DocumentItem {
  id: string;
  docType: string;
  fileName: string;
  mime: string;
  size: number;
  origin: 'staff' | 'patient';
  status: 'queued' | 'running' | 'done' | 'failed';
  method: 'text-layer' | 'ocr' | null;
  pages: number | null;
  error: string | null;
  by: string;
  at: string;
  syncStatus: 'pending' | 'pushed';
  values: number;
  waiting: number;
}
