import type { SlipField, SourceDocument } from './types';

/** The identity line exactly as it is printed on the slip. Citation spans index into this string. */
export function headerLine(d: Pick<SourceDocument, 'header'>): string {
  const h = d.header;
  return `${h.name}, ${h.age}/${h.sex}, ${h.weightKg} kg, ${h.place}`;
}

export function fieldText(doc: SourceDocument, field: SlipField, adviceIndex?: number): string {
  switch (field) {
    case 'header': return headerLine(doc);
    case 'complaint': return doc.complaint;
    case 'investigations': return doc.investigations;
    case 'diagnosis': return doc.diagnosis;
    case 'advice': return doc.advice[adviceIndex ?? 0] ?? '';
  }
}

export const FIELD_LABEL: Record<SlipField, string> = {
  header: 'Slip header', complaint: 'C/O (complaint)', investigations: 'Investigations', diagnosis: 'Diagnosis', advice: 'Advice',
};
