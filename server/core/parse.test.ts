import { describe, expect, it } from 'vitest';
import { parseRecord, HIS_TRENDS, docIdOf, fieldText } from './parse';

const rec = parseRecord();

describe('documents', () => {
  it('has 5 prescription slips and 5 diagnostic reports per patient', () => {
    for (const pid of ['P1', 'P2']) {
      expect(rec.docs.filter(d => d.patientId === pid && d.kind === 'prescription')).toHaveLength(5);
      expect(rec.docs.filter(d => d.patientId === pid && d.kind === 'diagnostic')).toHaveLength(5);
    }
  });
  it('splits numbered advice and strips numbering', () => {
    const d = rec.docs.find(x => x.id === 'P1-RX-V1')!;
    expect(d.advice).toHaveLength(5);
    expect(d.advice[0]).toBe('Continue Tab. Metformin 500 mg oral before meal, 1 × 3 tab.');
  });
});

describe('observations match the workbook Trends sheet exactly', () => {
  for (const pid of ['P1', 'P2']) {
    for (const code of ['fbs', 'ppbs', 'hba1c'] as const) {
      it(`${pid} ${code}`, () => {
        for (const row of HIS_TRENDS[pid]) {
          const f = rec.facts.find(x => x.patientId === pid && x.visit === row.visit && x.code === code);
          expect(f?.value ?? null).toBe(row[code]);
        }
      });
    }
  }
  it('every observation citation quotes real text from its document', () => {
    for (const f of rec.facts) {
      const doc = rec.docs.find(d => d.id === f.citation.docId)!;
      const text = fieldText(doc, f.citation.field, f.citation.adviceIndex);
      const [a, b] = f.citation.span!;
      expect(text.slice(a, b)).toBe(f.citation.quote);
    }
  });
  it('P2 has no HbA1c before visit 3 (absent, not zero)', () => {
    expect(rec.facts.filter(f => f.patientId === 'P2' && f.code === 'hba1c').map(f => f.visit)).toEqual([3, 4, 5]);
  });
});

describe('findings', () => {
  it('finds P2 urine protein positive at visit 3 only', () => {
    const f = rec.findings.filter(x => x.patientId === 'P2' && x.group === 'renal');
    expect(f).toHaveLength(1);
    expect(f[0].visit).toBe(3);
    expect(f[0].state).toBe('present');
  });
  it('finds P1 renal function qualitative at visit 2 only', () => {
    const f = rec.findings.filter(x => x.patientId === 'P1' && x.group === 'renal');
    expect(f.map(x => x.visit)).toEqual([2]);
  });
  it('flags P2 diagnosis change at v3 and reversion at v4', () => {
    const d = rec.diagnoses.filter(x => x.patientId === 'P2');
    expect(d.map(x => x.changedFromPrev)).toEqual([false, false, true, true, false]);
  });
});

describe('medications', () => {
  it('P1: metformin dose stated at v1, named v2-3, by-reference v4-5', () => {
    const m = rec.medSeeds.filter(x => x.patientId === 'P1' && x.drug === 'Metformin');
    expect(m.map(x => x.mention.mode)).toEqual(['dose-stated', 'named', 'named', 'by-reference', 'by-reference']);
    expect(m[0].strength).toBe('500 mg');
    expect(m[0].regimen).toBe('1 × 3 daily, before meals');
  });
  it('P2: insulin glargine 10 U/day stated at v1 only; carried by reference later', () => {
    const m = rec.medSeeds.filter(x => x.patientId === 'P2' && x.drug === 'Insulin glargine');
    expect(m.map(x => x.mention.visit)).toEqual([1, 2, 3, 4, 5]);
    expect(m.map(x => x.mention.mode)).toEqual(['dose-stated', 'named', 'by-reference', 'named', 'by-reference']);
    expect(m[0].strength).toBe('10 U/day');
  });
});

describe('plan seeds', () => {
  it('captures the renal re-assessment thread for P2 at visits 3, 4 and 5', () => {
    const r = rec.planSeeds.filter(p => p.patientId === 'P2' && p.topic === 'renal');
    expect(r.map(x => x.visit)).toEqual([3, 4, 5]);
  });
  it('P1 renal profile advised once (v3)', () => {
    const r = rec.planSeeds.filter(p => p.patientId === 'P1' && p.topic === 'renal');
    expect(r.map(x => x.visit)).toEqual([3]);
  });
  it('parses follow-up intervals, with "as advised" at visit 5', () => {
    const f = rec.planSeeds.filter(p => p.patientId === 'P2' && p.category === 'followup');
    expect(f.map(x => (x.followUp === 'as-advised' ? 'as-advised' : x.followUp?.label))).toEqual(['1 month', '6 weeks', '3 months', '3 months', 'as-advised']);
    expect(docIdOf('P2', 'diagnostic', 3)).toBe('P2-DX-V3');
  });
});
