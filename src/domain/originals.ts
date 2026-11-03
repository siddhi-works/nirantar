/** The original scanned follow-up PDF, served by the API only to someone allowed to open this patient. */
export function originalPdfUrl(patientId: string, visit?: number): string {
  return `/api/patients/${encodeURIComponent(patientId)}/original${visit ? `#page=${visit}` : ''}`;
}
