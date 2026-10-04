import { beforeEach, describe, expect, it } from 'vitest';
import { service } from './service';

beforeEach(() => service.reset());

describe('seed', () => {
  it('auto-creates one task, for the single high-severity gap (P2 kidney)', () => {
    const t = service.tasks();
    expect(t).toHaveLength(1);
    expect(t[0].task.gapId).toBe('P2:kidney');
    expect(t[0].task.origin).toBe('rules-engine');
    expect(t[0].gap!.status).toBe('tasked');
  });
  it('overview loop counts add up', () => {
    const o = service.overview();
    expect(o.loop).toMatchObject({ raised: 13, action: 1, evidence: 0, closed: 1, closedByRecord: 1 });
    expect(o.kpis.openGaps).toBe(14);
    expect(o.kpis.followUpOnTime).toEqual([7, 8]);
  });
});

describe('gap → action → evidence → closure', () => {
  it('walks the whole loop and updates the record', () => {
    const tid = service.tasks()[0].task.id;
    // closing straight away is blocked, with an explanation
    const early = service.closeTask({ taskId: tid, outcome: 'done' }, 'doctor');
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toMatch(/recorded action and evidence/);
    // evidence before action is blocked
    expect(service.recordEvidence({ taskId: tid, kind: 'note', note: 'x' }, 'doctor').ok).toBe(false);
    // action
    expect(service.recordAction({ taskId: tid, type: 'Ordered uACR and eGFR', note: 'Lab slip given' }, 'doctor').ok).toBe(true);
    const mid = service.closeTask({ taskId: tid, outcome: 'done' }, 'doctor');
    expect(mid.ok).toBe(false);
    if (!mid.ok) expect(mid.error).toMatch(/needs evidence/);
    // implausible value rejected, not stored
    const bad = service.recordEvidence({ taskId: tid, kind: 'values', values: { uacr: '99999' } }, 'doctor');
    expect(bad.ok).toBe(false);
    // evidence
    const ev = service.recordEvidence({ taskId: tid, kind: 'values', values: { uacr: '45', egfr: '58' } }, 'doctor');
    expect(ev.ok).toBe(true);
    let r = service.recall('P2');
    expect(r.gaps.find(g => g.id === 'P2:kidney')!.status).toBe('evidence');
    expect(r.facts.find(f => f.code === 'uacr')!.verification).toBe('imported');
    expect(r.organMap.find(o => o.id === 'kidney')!.findings.filter(f => f.state === 'at-risk')).toHaveLength(2);
    // coordinator cannot close a doctor-owned task
    const denied = service.closeTask({ taskId: tid, outcome: 'ok' }, 'coordinator');
    expect(denied.ok).toBe(false);
    // outcome required
    expect(service.closeTask({ taskId: tid, outcome: '  ' }, 'doctor').ok).toBe(false);
    // close
    expect(service.closeTask({ taskId: tid, outcome: 'Referred to nephrology; recheck in 3 months' }, 'doctor').ok).toBe(true);
    r = service.recall('P2');
    const g = r.gaps.find(x => x.id === 'P2:kidney')!;
    expect(g.status).toBe('closed');
    expect(g.closure!.by).toBe('Doctor');
    expect(g.closure!.basis).toContain('uACR 45 mg/g');
    expect(r.facts.find(f => f.code === 'uacr')!.verification).toBe('verified');
    expect(r.plan.filter(p => p.topic === 'renal').every(p => p.status === 'evidenced')).toBe(true);
    expect(service.overview().loop.closed).toBe(2);
    expect(service.audit().map(a => a.action)).toContain('Closed task with evidence');
  });

  it('creates a task from an open gap once only', () => {
    const a = service.createTask({ gapId: 'P1:kidney', title: 'Order uACR and eGFR', owner: 'doctor', priority: 'moderate', dueDate: '2027-12-24' }, 'doctor');
    expect(a.ok).toBe(true);
    expect(service.createTask({ gapId: 'P1:kidney', title: 'again', owner: 'doctor', priority: 'moderate', dueDate: '2027-12-24' }, 'doctor').ok).toBe(false);
    expect(service.recall('P1').gaps.find(g => g.id === 'P1:kidney')!.status).toBe('tasked');
  });

  it('BP needs both readings', () => {
    const a = service.createTask({ gapId: 'P1:bp', title: 'Record BP', owner: 'nurse', priority: 'moderate', dueDate: '2027-12-24' }, 'nurse');
    if (!a.ok) throw new Error('x');
    service.recordAction({ taskId: a.data.id, type: 'BP measured at desk', note: '' }, 'nurse');
    expect(service.recordEvidence({ taskId: a.data.id, kind: 'values', values: { sbp: '142' } }, 'nurse').ok).toBe(false);
    expect(service.recordEvidence({ taskId: a.data.id, kind: 'values', values: { sbp: '142', dbp: '88' } }, 'nurse').ok).toBe(true);
    const cardio = service.recall('P1').organMap.find(o => o.id === 'cardio')!;
    expect(cardio.findings.some(f => f.state === 'at-risk' && /142\/88/.test(f.label))).toBe(true);
  });
});

describe('permissions', () => {
  it('coordinators cannot verify values or accept AI drafts', () => {
    expect(service.verifyFacts('P1', ['P1-V1-hba1c'], 'coordinator').ok).toBe(false);
    expect(service.acceptAi('P1', 'nurse').ok).toBe(false);
    expect(service.acceptAi('P1', 'doctor').ok).toBe(true);
    expect(service.recall('P1').ai.state).toBe('accepted');
  });
  it('verification is recorded on the fact with who and when', () => {
    service.verifyFacts('P1', ['P1-V1-hba1c'], 'nurse');
    const f = service.recall('P1').facts.find(x => x.id === 'P1-V1-hba1c')!;
    expect(f.verification).toBe('verified'); expect(f.verifiedBy).toBe('Nurse / clinic staff');
  });
});

describe('search', () => {
  it('finds by name, ABHA digits, city and doctor', () => {
    expect(service.search('savitri')[0].patient.id).toBe('P2');
    expect(service.search('2612')[0].patient.id).toBe('P1');
    expect(service.search('gorakhpur')[0].patient.id).toBe('P2');
    expect(service.search('arvind')[0].patient.id).toBe('P1');
    expect(service.search('zzz')).toHaveLength(0);
  });
});

describe('document view', () => {
  it('returns extracted items for a diagnostic report, including values and the copy relationship', () => {
    const v = service.documentView('P1', 'P1-DX-V3');
    expect(v.doc!.copyOf).toBe('P1-RX-V3');
    expect(v.items.filter(i => i.kind === 'fact').map(i => i.label).sort()).toEqual(['FBS', 'HbA1c', 'PPBS', 'Weight']);
  });
});
