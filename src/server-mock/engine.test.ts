import { describe, expect, it } from 'vitest';
import { buildRecall, EMPTY_OPS } from './engine';
import { HIS_MED_VS_TREND } from './parse';
import type { Task } from '@/domain/types';

const p1 = buildRecall('P1');
const p2 = buildRecall('P2');
const open = (r: typeof p1) => r.gaps.filter(g => g.status !== 'closed');

describe('trends & change detection', () => {
  it('P1 totals from first slip: FBS −18, PPBS −36, HbA1c −0.6 (matches the HIS sheet)', () => {
    const t = Object.fromEntries(p1.trends.map(s => [s.code, s.latest!.deltaBase]));
    expect(t.fbs).toBe(-18); expect(t.ppbs).toBe(-36); expect(t.hba1c).toBe(-0.6);
  });
  it('P2 totals from first slip: FBS −42, PPBS −47; HbA1c 6.8 → 6.5 once it appears', () => {
    const t = Object.fromEntries(p2.trends.map(s => [s.code, s.latest!.deltaBase]));
    expect(t.fbs).toBe(-42); expect(t.ppbs).toBe(-47); expect(t.hba1c).toBe(-0.3);
    expect(p2.trends.find(s => s.code === 'hba1c')!.firstReading!.visit).toBe(3);
  });
  it('per-visit deltas match the "reading against the last visit" text on the HIS sheet', () => {
    for (const [r, pid] of [[p1, 'P1'], [p2, 'P2']] as const) {
      for (const row of HIS_MED_VS_TREND[pid]) {
        const ch = r.changes.find(c => c.visit === row.visit)!;
        for (const it of ch.items.filter(i => i.kind === 'measure' && i.delta !== undefined && i.delta !== 0)) {
          const shown = Math.abs(it.delta!).toString();
          expect(row.reading.includes(`−${shown}`), `${pid} v${row.visit} ${it.label} ${it.delta}: ${row.reading}`).toBe(true);
        }
      }
    }
  });
  it('P2 HbA1c at visit 3 is a "first reading", not a delta', () => {
    const it = p2.changes.find(c => c.visit === 3)!.items.find(i => i.id === 'hba1c-3')!;
    expect(it.direction).toBe('first');
  });
  it('P2 visit 3 surfaces the new diagnosis and the new urine-protein finding', () => {
    const items = p2.changes.find(c => c.visit === 3)!.items;
    expect(items.some(i => i.kind === 'diagnosis' && /proteinuria/.test(i.to))).toBe(true);
    expect(items.some(i => i.kind === 'finding' && /Urine protein/.test(i.to))).toBe(true);
  });
  it('medicines are unchanged at every visit after the first', () => {
    for (const r of [p1, p2]) for (const c of r.changes.filter(c => c.visit > 1)) expect(c.items.find(i => i.kind === 'medication')!.to).toBe('Unchanged');
  });
});

describe('follow-up adherence', () => {
  it('P1: all four follow-ups on time', () => { expect(p1.followUps.map(f => f.status)).toEqual(['on-time', 'on-time', 'on-time', 'on-time']); });
  it('P2: visit 3 came 19 days after the 6-week advice', () => {
    const f = p2.followUps.find(x => x.toVisit === 3)!;
    expect(f.advised).toBe('6 weeks'); expect(f.daysOff).toBe(19); expect(f.status).toBe('late');
    expect(p2.followUps.filter(x => x.status === 'on-time')).toHaveLength(3);
  });
});

describe('gaps', () => {
  it('P2 has a HIGH kidney gap: protein positive, repeat asked at v3,v4,v5, never recorded', () => {
    const g = p2.gaps.find(x => x.id === 'P2:kidney')!;
    expect(g.severity).toBe('high'); expect(g.ruleId).toBe('R-KID-01'); expect(g.basis).toBe('advised-not-evidenced');
    expect(g.triggers.filter(t => t.citation && /advised at visit/.test(t.label)).map(t => t.label.match(/visit (\d)/)![1])).toEqual(['3', '4', '5']);
    expect(g.openDays).toBe(181);
  });
  it('P1 kidney gap is moderate, advised once at v3', () => {
    const g = p1.gaps.find(x => x.id === 'P1:kidney')!;
    expect(g.severity).toBe('moderate'); expect(g.openDays).toBe(183);
  });
  it('both patients: open gaps are kidney, eye, foot, lipid, bp, liver, followup', () => {
    for (const r of [p1, p2]) expect(open(r).map(g => g.id.split(':')[1]).sort()).toEqual(['bp', 'eye', 'followup', 'foot', 'kidney', 'lipid', 'liver']);
  });
  it('every gap names a rule, version and has at least one trigger', () => {
    for (const g of [...p1.gaps, ...p2.gaps]) { expect(g.ruleId).toMatch(/^R-/); expect(g.ruleVersion).toBe('1.0'); expect(g.triggers.length).toBeGreaterThan(0); }
  });
  it('absence gaps list all 10 searched documents', () => {
    const g = p1.gaps.find(x => x.id === 'P1:eye')!;
    expect(g.triggers[0].absence!.searchedDocIds).toHaveLength(10);
  });
  it('P2 HbA1c-missing gap is closed by evidence in the record at visit 3; P1 has none', () => {
    const g = p2.gaps.find(x => x.id === 'P2:hba1c-missing')!;
    expect(g.status).toBe('closed'); expect(g.closure!.auto).toBe(true); expect(g.closure!.basis).toContain('6.8%');
    expect(p1.gaps.some(x => x.id === 'P1:hba1c-missing')).toBe(false);
  });
  it('gaps are ordered: open before closed, high before moderate', () => {
    expect(p2.gaps[0].id).toBe('P2:kidney'); expect(p2.gaps.at(-1)!.status).toBe('closed');
  });
});

describe('organ map keeps the three states separate', () => {
  it('P2 kidney has a confirmed and a missing finding at once', () => {
    const k = p2.organMap.find(o => o.id === 'kidney')!;
    expect(k.findings.map(f => f.state).sort()).toEqual(['confirmed', 'missing']);
  });
  it('P1 kidney is missing (quantified) and never confirmed', () => {
    const k = p1.organMap.find(o => o.id === 'kidney')!;
    expect(k.findings.map(f => f.state)).toEqual(['missing']);
  });
  it('no at-risk signal fires on imported data alone', () => {
    for (const r of [p1, p2]) expect(r.organMap.flatMap(o => o.findings).filter(f => f.state === 'at-risk')).toHaveLength(0);
  });
});

describe('plan continuity', () => {
  it('P2 renal advice is not evidenced at v3, v4 and v5', () => {
    expect(p2.plan.filter(p => p.topic === 'renal').map(p => p.status)).toEqual(['not-evidenced', 'not-evidenced', 'not-evidenced']);
  });
  it('last visit follow-up is "not set" for both', () => {
    for (const r of [p1, p2]) expect(r.plan.find(p => p.category === 'followup' && p.visit === 5)!.status).toBe('not-set');
  });
});

describe('staff evidence flows into the record', () => {
  const task: Task = {
    id: 'T-X', patientId: 'P2', gapId: 'P2:kidney', ruleId: 'R-KID-01', title: 't', owner: 'doctor', priority: 'high', dueDate: '2001-05-11',
    status: 'evidence', origin: 'user', createdAt: '2001-05-04T10:00', createdBy: 'Doctor',
    evidence: { kind: 'values', summary: 's', at: '2001-05-04T11:00', by: 'Doctor', values: [{ code: 'uacr', label: 'uACR', value: '45', unit: 'mg/g' }] },
    events: [],
  };
  it('a staff-entered uACR ≥ 30 raises an at-risk signal (not a diagnosis) and fills the tile', () => {
    const r = buildRecall('P2', { ...EMPTY_OPS, tasks: [task] });
    const k = r.organMap.find(o => o.id === 'kidney')!;
    expect(k.findings.some(f => f.state === 'at-risk' && /uACR 45/.test(f.label))).toBe(true);
    expect(r.missingMeasures.find(m => m.code === 'uacr')!.readings![0].flag).toBe('above');
    expect(r.gaps.find(g => g.id === 'P2:kidney')!.status).toBe('evidence');
  });
});
