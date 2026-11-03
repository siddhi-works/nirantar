import type { Citation, Recall } from '../../src/domain/types';
import type { DocumentView, ExtractedItem } from '../../src/domain/api';
import { buildRecall, type Ops } from './engine';

/** Everything extracted from one document, plus its siblings. Powers the source panel. */
export function documentView(patientId: string, docId: string, ops: Ops): DocumentView {
  const r: Recall = buildRecall(patientId, ops);
  const doc = r.documents.find(d => d.id === docId) ?? null;
  const items: ExtractedItem[] = [];
  const take = (c: Citation | undefined) => !!c && (c.docId === docId || !!c.alsoIn?.includes(docId));
  for (const f of r.facts) if (take(f.citation)) items.push({ id: f.id, kind: 'fact', label: f.label, display: f.display, citation: f.citation, fact: f, viaCopy: f.citation.docId !== docId });
  for (const f of r.findings) if (take(f.citation)) items.push({ id: f.id, kind: 'finding', label: f.label, display: f.text, citation: f.citation, viaCopy: f.citation.docId !== docId });
  for (const d of r.diagnoses) if (take(d.citation)) items.push({ id: `dx-${d.visit}`, kind: 'diagnosis', label: 'Diagnosis', display: d.text, citation: d.citation, viaCopy: d.citation.docId !== docId });
  for (const p of r.plan) if (take(p.citation)) items.push({ id: p.id, kind: 'plan', label: p.category === 'followup' ? 'Follow-up' : p.category[0].toUpperCase() + p.category.slice(1), display: p.text, citation: p.citation, viaCopy: p.citation.docId !== docId });
  const siblings = doc ? r.documents.filter(d => d.kind === doc.kind) : [];
  return { doc, siblings, items, recall: r };
}
