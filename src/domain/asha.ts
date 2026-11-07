/** Why a nurse or doctor sends a patient to the community health worker: ASHA in villages, USHA in cities. */
export const ASHA_REASONS = [
  { id: 'home-visit', label: 'Follow-up visit at home' },
  { id: 'missed-visit', label: 'Missed the review, please bring them back' },
  { id: 'diet-walking', label: 'Diet and walking counselling at home' },
  { id: 'medicine-reminder', label: 'Medicine reminders' },
  { id: 'foot-check', label: 'Foot check at home' },
  { id: 'screening-camp', label: 'Take to a screening camp' },
] as const;
export type AshaReason = (typeof ASHA_REASONS)[number]['id'];
export type AshaWorker = 'asha' | 'usha';
export interface AshaReferral { id: number; worker: AshaWorker; reason: AshaReason; note: string | null; by: string; at: string }
