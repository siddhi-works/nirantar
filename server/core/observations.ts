import { OBS_BY_CODE, valueText, type ObsStatus } from '../../src/domain/observations';
import type { Fact, Patient } from '../../src/domain/types';
import type { observations, observationVersions } from '../db/schema';

export type ObservationRow = typeof observations.$inferSelect;
export type VersionRow = typeof observationVersions.$inferSelect;

/** The value to show: the newest correction if there is one, otherwise what was first recorded. */
export function currentValue(o: ObservationRow, versions: VersionRow[]): number | string | null {
  const v = versions.filter(x => x.observationId === o.id).sort((a, b) => b.id - a.id)[0];
  const raw = v ? v.value : o.valueNum ?? o.valueText;
  if (raw === null || raw === undefined) return null;
  return OBS_BY_CODE[o.code]?.kind === 'number' ? Number(raw) : String(raw);
}

export const originalText = (o: ObservationRow) => (o.valueNum ?? o.valueText ?? '').toString();

/**
 * Turns a recorded value into the same Fact shape the engine already uses for staff-entered results.
 * Only confirmed values become facts: an `extracted` value from an uploaded document is not evidence yet.
 */
export function observationFact(o: ObservationRow, versions: VersionRow[], patient: Patient): Fact | null {
  const def = OBS_BY_CODE[o.code];
  const status = o.status as ObsStatus;
  if (!def || (status !== 'verified' && status !== 'corrected')) return null;
  const value = currentValue(o, versions);
  if (value === null) return null;
  const latest = versions.filter(x => x.observationId === o.id).sort((a, b) => b.id - a.id)[0];
  const display = valueText(def, value);
  return {
    id: `OB-${o.groupId ?? o.id}-${o.code}`, patientId: patient.id, visit: 0, date: o.obsDate,
    kind: 'observation', code: o.code, label: def.label, value, unit: def.unit, display, source: 'staff-entered',
    citation: {
      id: `cit:OB-${o.id}`, docId: o.documentId ? `UP-${o.documentId}` : `EN-${o.id}`, field: 'investigations',
      quote: o.sourceText ?? display,
      source: {
        kind: o.origin as 'entry' | 'upload', observationId: o.id, documentId: o.documentId ?? undefined, status,
        by: latest?.byLabel ?? o.byLabel, at: (latest?.at ?? o.createdAt).toISOString(),
        original: status === 'corrected' ? originalText(o) : undefined, correctionReason: latest?.reason,
      },
    },
    extractor: { name: o.origin === 'upload' ? 'document-extraction' : 'staff-entry', version: '1', rule: o.origin === 'upload' ? 'upload.confirmed' : 'entry' },
    verification: status === 'corrected' ? 'corrected' : 'verified', verifiedBy: latest?.byLabel ?? o.byLabel, verifiedAt: (latest?.at ?? o.createdAt).toISOString(),
  };
}
