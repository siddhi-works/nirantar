/**
 * Builds a FHIR R4 document bundle from a patient's record. Resource shapes follow the common ABDM pattern, but the
 * bundle has not been validated against NHA's profiles: that has to be done against the real sandbox.
 */
import { randomUUID } from 'node:crypto';
import type { Fact, Recall } from '../../src/domain/types';
import { OBS_BY_CODE } from '../../src/domain/observations';

const LOINC: Record<string, { code: string; display: string }> = {
  insulin: { code: '20448-7', display: 'Insulin [Units/volume] in Serum or Plasma' },
  hba1c: { code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
  fbs: { code: '1558-6', display: 'Fasting glucose [Mass/volume] in Serum or Plasma' },
  ppbs: { code: '1521-4', display: 'Glucose [Mass/volume] in Serum or Plasma --2 hours post meal' },
  weight: { code: '29463-7', display: 'Body weight' },
  height: { code: '8302-2', display: 'Body height' },
  sbp: { code: '8480-6', display: 'Systolic blood pressure' },
  dbp: { code: '8462-4', display: 'Diastolic blood pressure' },
  pulse: { code: '8867-4', display: 'Heart rate' },
  egfr: { code: '33914-3', display: 'Glomerular filtration rate/1.73 sq M.predicted' },
  uacr: { code: '9318-7', display: 'Albumin/Creatinine [Mass Ratio] in Urine' },
  ldl: { code: '18262-6', display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma' },
  hdl: { code: '2085-9', display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma' },
  tg: { code: '2571-8', display: 'Triglyceride [Mass/volume] in Serum or Plasma' },
  alt: { code: '1742-6', display: 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma' },
};
const CATEGORY: Record<string, string> = { glycaemic: 'laboratory', kidney: 'laboratory', lipid: 'laboratory', liver: 'laboratory', vitals: 'vital-signs', exam: 'exam', history: 'social-history', screening: 'survey' };

export interface Fhir { resourceType: string; id?: string; [k: string]: unknown }
export interface FhirBundle { resourceType: 'Bundle'; type: 'document'; id: string; timestamp: string; entry: { fullUrl: string; resource: Fhir }[] }

function observation(f: Fact, patientRef: string, i: number): Fhir | null {
  if (f.kind !== 'observation' || f.value === undefined || f.value === null) return null;
  const def = OBS_BY_CODE[f.code];
  const loinc = LOINC[f.code];
  const notes: { text: string }[] = [];
  if (f.verification === 'corrected') notes.push({ text: `Corrected${f.detail?.originalValue !== undefined ? ` from ${String(f.detail.originalValue)}` : ''}${f.detail?.correctionReason ? `: ${String(f.detail.correctionReason)}` : ''}` });
  notes.push({ text: `Source: ${f.citation.source?.kind === 'upload' ? 'read from an uploaded report and confirmed by staff' : 'written on the hospital’s own slip'}, dated ${f.date}` });
  return {
    resourceType: 'Observation', id: `obs-${i}`,
    // The hospital's own slips are its authored record. Unreviewed values from uploads never reach a bundle (they are not facts).
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: CATEGORY[def?.group ?? ''] ?? 'laboratory' }] }],
    code: { ...(loinc ? { coding: [{ system: 'http://loinc.org', code: loinc.code, display: loinc.display }] } : {}), text: f.label },
    subject: { reference: patientRef },
    effectiveDateTime: f.date,
    ...(typeof f.value === 'number'
      ? { valueQuantity: { value: f.value, unit: f.unit ?? '', system: 'http://unitsofmeasure.org' } }
      : { valueString: String(f.value) }),
    ...(notes.length ? { note: notes } : {}),
  };
}

/** What the patient allowed: only these kinds of record, and only values dated inside the range. Everything else is left out. */
export interface Scope { hiTypes: readonly string[]; from?: string | null; to?: string | null }

export function buildBundle(recall: Recall, hip: { hfr: string; name: string }, at = new Date(), scope?: Scope): FhirBundle {
  const entries: Fhir[] = [];
  const p = recall.patient;
  const org: Fhir = { resourceType: 'Organization', id: 'org', identifier: [{ system: 'urn:abdm:hfr', value: hip.hfr }], name: hip.name };
  const patient: Fhir = { resourceType: 'Patient', id: 'pat', identifier: [{ system: 'urn:abdm:abha', value: p.abhaId }], name: [{ text: p.name }], gender: p.sex === 'F' ? 'female' : 'male' };
  const inRange = (d: unknown) => !scope || ((!scope.from || String(d) >= scope.from.slice(0, 10)) && (!scope.to || String(d) <= scope.to.slice(0, 10)));
  const allow = (type: string) => !scope || scope.hiTypes.includes(type);
  const obs = allow('DiagnosticReport') ? recall.facts.map((f, i) => observation(f, 'Patient/pat', i)).filter((o): o is Fhir => o !== null && inRange(o.effectiveDateTime)) : [];
  const dx = allow('OPConsultation') ? recall.diagnoses.at(-1) : undefined;
  const conditions: Fhir[] = dx ? [{ resourceType: 'Condition', id: 'cond-0', clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] }, code: { text: dx.text }, subject: { reference: 'Patient/pat' }, recordedDate: dx.date }] : [];
  const meds: Fhir[] = (allow('Prescription') ? recall.medications : []).map((m, i) => ({ resourceType: 'MedicationStatement', id: `med-${i}`, status: 'active', medicationCodeableConcept: { text: `${m.drug}${m.strength ? ' ' + m.strength : ''}` }, subject: { reference: 'Patient/pat' }, dosage: [{ text: `${m.regimen} (${m.route})` }] }));
  const composition: Fhir = {
    resourceType: 'Composition', id: 'comp', status: 'final', type: { text: 'Diabetes record summary' }, subject: { reference: 'Patient/pat' },
    date: at.toISOString(), author: [{ reference: 'Organization/org' }], title: 'Diabetes record summary',
    section: [
      { title: 'Conditions', entry: conditions.map(c => ({ reference: `Condition/${c.id}` })) },
      { title: 'Medicines', entry: meds.map(m => ({ reference: `MedicationStatement/${m.id}` })) },
      { title: 'Results and examinations', entry: obs.map(o => ({ reference: `Observation/${o.id}` })) },
    ],
  };
  entries.push(composition, patient, org, ...conditions, ...meds, ...obs);
  return { resourceType: 'Bundle', type: 'document', id: randomUUID(), timestamp: at.toISOString(), entry: entries.map(r => ({ fullUrl: `urn:uuid:${randomUUID()}`, resource: r })) };
}

/** A bundle for a patient who has no follow-up slips: identity plus the values a person has recorded or confirmed. */
export function buildRegisteredBundle(
  p: { name: string; sex: string; abha: string },
  rows: { code: string; valueNum: number | null; valueText: string | null; obsDate: string; status: string; origin?: string; byLabel?: string }[],
  hip: { hfr: string; name: string }, at = new Date(), scope?: Scope,
): FhirBundle {
  const allowed = !scope || scope.hiTypes.includes('DiagnosticReport');
  const inRange = (d: string) => !scope || ((!scope.from || d >= scope.from.slice(0, 10)) && (!scope.to || d <= scope.to.slice(0, 10)));
  const org: Fhir = { resourceType: 'Organization', id: 'org', identifier: [{ system: 'urn:abdm:hfr', value: hip.hfr }], name: hip.name };
  const patient: Fhir = { resourceType: 'Patient', id: 'pat', identifier: [{ system: 'urn:abdm:abha', value: p.abha.replace(/(\d{2})(\d{4})(\d{4})(\d{4})/, '$1-$2-$3-$4') }], name: [{ text: p.name }], gender: p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : 'other' };
  const obs: Fhir[] = (allowed ? rows.filter(r => (r.status === 'verified' || r.status === 'corrected') && inRange(r.obsDate)) : []).map((r, i) => {
    const def = OBS_BY_CODE[r.code]; const loinc = LOINC[r.code];
    return {
      resourceType: 'Observation', id: `obs-${i}`, status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: CATEGORY[def?.group ?? ''] ?? 'laboratory' }] }],
      code: { coding: loinc ? [{ system: 'http://loinc.org', code: loinc.code, display: loinc.display }] : [{ system: 'urn:nirantar:obs', code: r.code }], text: def?.label ?? r.code },
      subject: { reference: 'Patient/pat' }, effectiveDateTime: r.obsDate,
      ...(r.origin ? { note: [{ text: `Source: ${r.origin === 'upload' ? 'read from an uploaded report' : 'entered'} and confirmed by ${r.byLabel ?? 'staff'} at ${hip.name}` }] } : {}),
      ...(r.valueNum !== null ? { valueQuantity: { value: r.valueNum, unit: def?.unit ?? '', system: 'http://unitsofmeasure.org' } } : { valueString: r.valueText ?? '' }),
    } as Fhir;
  });
  const composition: Fhir = {
    resourceType: 'Composition', id: 'comp', status: 'final', type: { text: 'Diabetes record summary' }, subject: { reference: 'Patient/pat' }, date: at.toISOString(), author: [{ reference: 'Organization/org' }], title: 'Diabetes record summary',
    section: [{ title: 'Results and examinations', entry: obs.map(o => ({ reference: `Observation/${o.id}` })) }],
  };
  return { resourceType: 'Bundle', type: 'document', id: randomUUID(), timestamp: at.toISOString(), entry: [composition, patient, org, ...obs].map(r => ({ fullUrl: `urn:uuid:${randomUUID()}`, resource: r })) };
}
