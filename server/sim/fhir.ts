/**
 * Builds a FHIR R4 document bundle from a patient's record. Resource shapes follow the common ABDM pattern, but the
 * bundle has not been validated against NHA's profiles: that has to be done against the real sandbox.
 */
import { randomUUID } from 'node:crypto';
import type { Fact, Recall } from '../../src/domain/types';
import { OBS_BY_CODE } from '../../src/domain/observations';

const LOINC: Record<string, { code: string; display: string }> = {
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
const CATEGORY: Record<string, string> = { glycaemic: 'laboratory', kidney: 'laboratory', lipid: 'laboratory', liver: 'laboratory', vitals: 'vital-signs', exam: 'exam', screening: 'survey' };

export interface Fhir { resourceType: string; id?: string; [k: string]: unknown }
export interface FhirBundle { resourceType: 'Bundle'; type: 'document'; id: string; timestamp: string; entry: { fullUrl: string; resource: Fhir }[] }

function observation(f: Fact, patientRef: string, i: number): Fhir | null {
  if (f.kind !== 'observation' || f.value === undefined || f.value === null) return null;
  const def = OBS_BY_CODE[f.code];
  const loinc = LOINC[f.code];
  const notes: { text: string }[] = [];
  if (f.verification === 'corrected') notes.push({ text: `Corrected${f.detail?.originalValue !== undefined ? ` from ${String(f.detail.originalValue)}` : ''}${f.detail?.correctionReason ? `: ${String(f.detail.correctionReason)}` : ''}` });
  if (f.citation.source?.kind === 'upload') notes.push({ text: 'Read from an uploaded document and confirmed by staff.' });
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

export function buildBundle(recall: Recall, hip: { hfr: string; name: string }, at = new Date()): FhirBundle {
  const entries: Fhir[] = [];
  const p = recall.patient;
  const org: Fhir = { resourceType: 'Organization', id: 'org', identifier: [{ system: 'urn:abdm:hfr', value: hip.hfr }], name: hip.name };
  const patient: Fhir = { resourceType: 'Patient', id: 'pat', identifier: [{ system: 'urn:abdm:abha', value: p.abhaId }], name: [{ text: p.name }], gender: p.sex === 'F' ? 'female' : 'male' };
  const obs = recall.facts.map((f, i) => observation(f, 'Patient/pat', i)).filter((o): o is Fhir => o !== null);
  const dx = recall.diagnoses.at(-1);
  const conditions: Fhir[] = dx ? [{ resourceType: 'Condition', id: 'cond-0', clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] }, code: { text: dx.text }, subject: { reference: 'Patient/pat' }, recordedDate: dx.date }] : [];
  const meds: Fhir[] = recall.medications.map((m, i) => ({ resourceType: 'MedicationStatement', id: `med-${i}`, status: 'active', medicationCodeableConcept: { text: `${m.drug}${m.strength ? ' ' + m.strength : ''}` }, subject: { reference: 'Patient/pat' }, dosage: [{ text: `${m.regimen} (${m.route})` }] }));
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
