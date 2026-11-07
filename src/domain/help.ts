/** What a complaint can be about. Kept short on purpose: a person in a hurry should find theirs at once. */
export const COMPLAINT_KINDS = [
  { id: 'wrong-record', label: 'A record shows wrong or missing information' },
  { id: 'not-working', label: 'Something on the screen is not working' },
  { id: 'privacy', label: 'A privacy or consent concern' },
  { id: 'service', label: 'The service or the way I was treated' },
  { id: 'other', label: 'Something else' },
] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number]['id'];
export interface Complaint { id: number; kind: ComplaintKind; message: string; at: string }
