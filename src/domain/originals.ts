/** The original scanned follow-up PDFs (one page per visit), served from /public/docs. */
export function originalPdfUrl(patientId: string, visit?: number): string {
  const n = patientId.replace(/\D/g, '');
  return `${import.meta.env.BASE_URL}docs/patient-${n}-followups.pdf${visit ? `#page=${visit}` : ''}`;
}
