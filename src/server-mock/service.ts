/**
 * Mock service layer. Every rule that a real backend would enforce lives here, not in the UI:
 * role permissions, the task state machine, "closure needs recorded action + evidence", plausibility checks.
 */
import { ACTION_TYPES, PROTOCOL, RESULT_FORMS, ROLE_LABEL } from '@/domain/forms';
import { fmtDate } from '@/domain/format';
import type {
  ActionInput, ApiResult, AuditEvent, ClinicOverview, CloseInput, CreateTaskInput, EvidenceInput, Gap, Patient,
  PatientSummary, Recall, Role, SearchHit, SourceDocument, Task, Citation, Fact,
} from '@/domain/types';
import { db } from './db';
import { buildRecall } from './engine';
import { RULE_CATALOG } from './catalog';
import { parseRecord } from './parse';

const SEV = { high: 0, moderate: 1, low: 2 } as const;
const BASIS = { 'advised-not-evidenced': 0, schedule: 1, absence: 2 } as const;
const actor = (role: Role) => ROLE_LABEL[role];
const fail = <T,>(error: string): ApiResult<T> => ({ ok: false, error });
const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const patientOf = (id: string) => parseRecord().patients.find(p => p.id === id)!;

export const service = {
  /* ───────── reads ───────── */
  patients(): Patient[] { return parseRecord().patients; },

  search(q: string): SearchHit[] {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/[^0-9]/g, '');
    const all = parseRecord().patients;
    if (!needle) return all.map(p => ({ patient: p, matched: '', score: 0 }));
    const hits: SearchHit[] = [];
    for (const p of all) {
      const fields: [string, string][] = [['name', p.name], ['patient ID', p.id], ['ABHA', p.abhaId], ['city', p.place], ['doctor', p.doctor], ['reg. no.', p.doctorRegNo]];
      for (const [label, v] of fields) {
        const hay = v.toLowerCase();
        const match = hay.includes(needle) || (digits.length >= 3 && label === 'ABHA' && v.replace(/[^0-9]/g, '').includes(digits));
        if (match) { hits.push({ patient: p, matched: label, score: hay.startsWith(needle) ? 2 : 1 }); break; }
      }
    }
    return hits.sort((a, b) => b.score - a.score);
  },

  recall(patientId: string): Recall { return buildRecall(patientId, db.ops); },

  overview(): ClinicOverview {
    const recalls = parseRecord().patients.map(p => buildRecall(p.id, db.ops));
    const allGaps = recalls.flatMap(r => r.gaps);
    const open = allGaps.filter(g => g.status !== 'closed');
    const summaries: PatientSummary[] = recalls.map(r => {
      const og = r.gaps.filter(g => g.status !== 'closed');
      const hb = r.trends.find(t => t.code === 'hba1c')!;
      const present = r.coverage.filter(c => c.present).length;
      return {
        patient: r.patient, latestHba1c: hb.latest, hba1cSpark: hb.points.map(p => p.value),
        openGaps: og.length, highGaps: og.filter(g => g.severity === 'high').length,
        moderateGaps: og.filter(g => g.severity === 'moderate').length, lowGaps: og.filter(g => g.severity === 'low').length,
        attention: r.attention, coveragePct: Math.round((present / r.coverage.length) * 100), coverageOf: [present, r.coverage.length],
        diagnosis: r.diagnoses.at(-1)!.text, medicines: r.medications.map(m => m.drug),
      };
    });
    const fu = recalls.flatMap(r => r.followUps);
    const cov = summaries.map(s => s.coveragePct);
    return {
      patients: summaries,
      loop: {
        raised: open.filter(g => g.status === 'open').length,
        action: open.filter(g => g.status === 'tasked' || g.status === 'in_progress').length,
        evidence: open.filter(g => g.status === 'evidence').length,
        closed: allGaps.filter(g => g.status === 'closed').length,
        closedByRecord: allGaps.filter(g => g.status === 'closed' && g.closure?.auto).length,
      },
      kpis: {
        openGaps: open.length, highGaps: open.filter(g => g.severity === 'high').length,
        planNotEvidenced: recalls.flatMap(r => r.plan).filter(p => p.status === 'not-evidenced').length,
        followUpOnTime: [fu.filter(f => f.status === 'on-time').length, fu.length],
        tasksOpen: db.ops.tasks.filter(t => t.status !== 'closed').length,
        coveragePct: Math.round(cov.reduce((a, b) => a + b, 0) / cov.length),
      },
      topGaps: [...open].sort((a, b) => SEV[a.severity] - SEV[b.severity] || BASIS[a.basis] - BASIS[b.basis] || b.openDays - a.openDays).slice(0, 6),
      cohort: recalls.map(r => ({
        patientId: r.patient.id, name: r.patient.name,
        medsUnchanged: r.medications.every(m => !m.changed) && r.changes.every(c => c.visit === 1 || !c.items.some(i => i.kind === 'medication' && i.direction === 'new')),
        series: Object.fromEntries((['hba1c', 'fbs', 'ppbs'] as const).map(c => [c, r.trends.find(t => t.code === c)!.points.map(p => p.value)])) as ClinicOverview['cohort'][number]['series'],
        deltas: Object.fromEntries((['hba1c', 'fbs', 'ppbs'] as const).map(c => [c, r.trends.find(t => t.code === c)!.latest?.deltaBase ?? null])) as ClinicOverview['cohort'][number]['deltas'],
      })),
    };
  },

  gaps(): { gap: Gap; patient: Patient }[] {
    return parseRecord().patients.flatMap(p => buildRecall(p.id, db.ops).gaps.map(g => ({ gap: g, patient: p })))
      .sort((a, b) => Number(a.gap.status === 'closed') - Number(b.gap.status === 'closed') || SEV[a.gap.severity] - SEV[b.gap.severity] || BASIS[a.gap.basis] - BASIS[b.gap.basis] || b.gap.openDays - a.gap.openDays);
  },
  tasks(): { task: Task; patient: Patient; gap: Gap | undefined }[] {
    return db.ops.tasks.map(t => ({ task: t, patient: patientOf(t.patientId), gap: buildRecall(t.patientId, db.ops).gaps.find(g => g.id === t.gapId) }));
  },
  rules() { return RULE_CATALOG; },
  audit(): AuditEvent[] { return db.audit; },

  /** Everything extracted from one document, plus its siblings — powers the citation viewer. */
  documentView(patientId: string, docId: string): { doc: SourceDocument | null; siblings: SourceDocument[]; items: ExtractedItem[]; recall: Recall } {
    const r = buildRecall(patientId, db.ops);
    const doc = r.documents.find(d => d.id === docId) ?? null;
    const items: ExtractedItem[] = [];
    const take = (c: Citation | undefined) => !!c && (c.docId === docId || !!c.alsoIn?.includes(docId));
    for (const f of r.facts) if (take(f.citation)) items.push({ id: f.id, kind: 'fact', label: f.label, display: f.display, citation: f.citation, fact: f, viaCopy: f.citation.docId !== docId });
    for (const f of r.findings) if (take(f.citation)) items.push({ id: f.id, kind: 'finding', label: f.label, display: f.text, citation: f.citation, viaCopy: f.citation.docId !== docId });
    for (const d of r.diagnoses) if (take(d.citation)) items.push({ id: `dx-${d.visit}`, kind: 'diagnosis', label: 'Diagnosis', display: d.text, citation: d.citation, viaCopy: d.citation.docId !== docId });
    for (const p of r.plan) if (take(p.citation)) items.push({ id: p.id, kind: 'plan', label: p.category === 'followup' ? 'Follow-up' : p.category[0].toUpperCase() + p.category.slice(1), display: p.text, citation: p.citation, viaCopy: p.citation.docId !== docId });
    const siblings = doc ? r.documents.filter(d => d.kind === doc.kind) : [];
    return { doc, siblings, items, recall: r };
  },

  /* ───────── mutations ───────── */
  recordView(patientId: string, role: Role, purpose: string) {
    db.log({ actorRole: role, action: 'Viewed Patient 360', target: patientOf(patientId).name, patientId, purpose });
  },

  createTask(input: CreateTaskInput, role: Role): ApiResult<Task> {
    const gapEntry = this.gaps().find(x => x.gap.id === input.gapId);
    if (!gapEntry) return fail('That gap no longer exists. Refresh the list.');
    const { gap, patient } = gapEntry;
    if (gap.status !== 'open') return fail('This gap already has a task. Open it from the Tasks tab.');
    if (!input.title.trim()) return fail('Give the task a short title, for example “Order uACR and eGFR”.');
    const at = db.stamp(patient.asOf);
    const task: Task = {
      id: db.nextTaskId(), patientId: patient.id, gapId: gap.id, ruleId: gap.ruleId, title: input.title.trim(), owner: input.owner,
      priority: input.priority, dueDate: input.dueDate, status: 'open', origin: 'user', note: input.note?.trim() || undefined,
      createdAt: at, createdBy: actor(role),
      events: [{ at, label: `Task created for ${ROLE_LABEL[input.owner]}, due ${fmtDate(input.dueDate)}`, actor: actor(role) }],
    };
    db.commit(s => { s.ops = { ...s.ops, tasks: [...s.ops.tasks, task] }; });
    db.log({ actorRole: role, action: 'Created task', target: `${task.id} · ${task.title}`, patientId: patient.id, purpose: 'Care gap follow-up', detail: `From ${gap.ruleId}` });
    return ok(task);
  },

  recordAction(input: ActionInput, role: Role): ApiResult<Task> {
    const t = db.ops.tasks.find(x => x.id === input.taskId);
    if (!t) return fail('That task no longer exists.');
    if (t.status === 'closed') return fail('This task is closed. Closed tasks are never edited — only superseded.');
    if (t.status === 'evidence') return fail('Evidence is already attached. Close the task, or ask a clinician to review it.');
    const form = this.gaps().find(g => g.gap.id === t.gapId)?.gap.resultForm ?? 'generic';
    if (!ACTION_TYPES[form].includes(input.type)) return fail('Choose one of the listed actions.');
    const at = db.stamp(patientOf(t.patientId).asOf);
    db.commit(s => {
      s.ops = { ...s.ops, tasks: s.ops.tasks.map(x => x.id !== t.id ? x : { ...x, status: 'in_progress', action: { type: input.type, note: input.note.trim(), at, by: actor(role) }, events: [...x.events, { at, label: `Action recorded: ${input.type}${input.note.trim() ? ` — ${input.note.trim()}` : ''}`, actor: actor(role) }] }) };
    });
    db.log({ actorRole: role, action: 'Recorded action', target: `${t.id} · ${input.type}`, patientId: t.patientId, purpose: 'Care gap follow-up' });
    return ok(db.ops.tasks.find(x => x.id === t.id)!);
  },

  recordEvidence(input: EvidenceInput, role: Role): ApiResult<Task> {
    const t = db.ops.tasks.find(x => x.id === input.taskId);
    if (!t) return fail('That task no longer exists.');
    if (t.status === 'closed') return fail('This task is closed. Closed tasks are never edited — only superseded.');
    if (t.status === 'open') return fail('Record the action first. Evidence is attached to an action that was actually taken.');
    const gap = this.gaps().find(g => g.gap.id === t.gapId)!.gap;
    const form = RESULT_FORMS[gap.resultForm];
    const at = db.stamp(patientOf(t.patientId).asOf);
    let evidence: Task['evidence'];
    if (input.kind === 'values') {
      const values: NonNullable<Task['evidence']>['values'] = [];
      for (const f of form.fields) {
        const raw = (input.values?.[f.code] ?? '').trim();
        if (!raw) continue;
        if (f.type === 'number') {
          const n = Number(raw);
          if (Number.isNaN(n)) return fail(`${f.label} must be a number.`);
          if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return fail(`${f.label} ${raw} looks implausible (expected ${f.min}–${f.max}${f.unit ? ' ' + f.unit : ''}). Check the report and re-enter.`);
        }
        values.push({ code: f.code, label: f.label, value: raw, unit: f.unit });
      }
      if (gap.resultForm === 'bp' && values.length === 1) return fail('Enter both systolic and diastolic readings.');
      if (!values.length) return fail('Enter at least one result, or attach a document instead.');
      evidence = { kind: 'values', summary: values.map(v => `${v.label} ${v.value}${v.unit ? ' ' + v.unit : ''}`).join(' · '), values, at, by: actor(role) };
    } else if (input.kind === 'document') {
      if (!input.attachment?.trim()) return fail('Choose a document to attach.');
      evidence = { kind: 'document', summary: `Document attached: ${input.attachment.trim()}`, attachment: input.attachment.trim(), at, by: actor(role) };
    } else {
      if (!input.note?.trim()) return fail('Write what was found. A note needs content to count as evidence.');
      evidence = { kind: 'note', summary: input.note.trim(), at, by: actor(role) };
    }
    db.commit(s => {
      s.ops = { ...s.ops, tasks: s.ops.tasks.map(x => x.id !== t.id ? x : { ...x, status: 'evidence', evidence, events: [...x.events, { at, label: `Evidence attached: ${evidence!.summary}`, actor: actor(role) }] }) };
    });
    db.log({ actorRole: role, action: 'Attached evidence', target: `${t.id} · ${evidence.summary}`, patientId: t.patientId, purpose: 'Care gap follow-up' });
    return ok(db.ops.tasks.find(x => x.id === t.id)!);
  },

  closeTask(input: CloseInput, role: Role): ApiResult<Task> {
    const t = db.ops.tasks.find(x => x.id === input.taskId);
    if (!t) return fail('That task no longer exists.');
    if (t.status === 'closed') return fail('This task is already closed.');
    if (role === 'coordinator' && t.owner !== 'coordinator') return fail(`Coordinators can close only tasks assigned to them. This task is assigned to ${ROLE_LABEL[t.owner]}.`);
    if (t.status === 'open') return fail('Closure needs a recorded action and evidence. Record the action first.');
    if (t.status === 'in_progress') return fail('Closure needs evidence. Attach a result, a document or a note before closing.');
    if (!input.outcome.trim()) return fail('Say what the outcome was. Closure records who closed it and on what basis.');
    const at = db.stamp(patientOf(t.patientId).asOf);
    const basis = `${t.evidence!.summary} — ${t.action!.type}`;
    db.commit(s => {
      s.ops = { ...s.ops, tasks: s.ops.tasks.map(x => x.id !== t.id ? x : { ...x, status: 'closed', closure: { outcome: input.outcome.trim(), at, by: actor(role), basis }, events: [...x.events, { at, label: `Closed with evidence. Outcome: ${input.outcome.trim()}`, actor: actor(role) }] }) };
    });
    db.log({ actorRole: role, action: 'Closed task with evidence', target: `${t.id} · ${t.title}`, patientId: t.patientId, purpose: 'Care gap closure', detail: basis });
    return ok(db.ops.tasks.find(x => x.id === t.id)!);
  },

  verifyFacts(patientId: string, factIds: string[], role: Role): ApiResult<number> {
    if (role === 'coordinator') return fail('Coordinators can’t verify extracted values. A doctor or nurse can — ask one to confirm.');
    const at = db.stamp(patientOf(patientId).asOf);
    db.commit(s => {
      const v = { ...s.ops.verifications };
      for (const id of factIds) v[id] = { by: actor(role), at };
      s.ops = { ...s.ops, verifications: v };
    });
    db.log({ actorRole: role, action: factIds.length > 1 ? `Confirmed ${factIds.length} values` : 'Confirmed value', target: factIds.length > 1 ? `${factIds.length} facts` : factIds[0], patientId, purpose: 'Verification' });
    return ok(factIds.length);
  },

  acceptAi(patientId: string, role: Role): ApiResult<true> {
    if (role !== 'doctor') return fail('Only a doctor can accept a generated summary. It stays a draft until then.');
    const at = db.stamp(patientOf(patientId).asOf);
    db.commit(s => { s.ops = { ...s.ops, aiAccepted: { ...s.ops.aiAccepted, [patientId]: { by: actor(role), at } } }; });
    db.log({ actorRole: role, action: 'Accepted AI summary', target: patientOf(patientId).name, patientId, purpose: 'Clinician review of generated content' });
    return ok(true);
  },

  reset() { db.reset(); },
};

export interface ExtractedItem {
  id: string;
  kind: 'fact' | 'finding' | 'diagnosis' | 'plan';
  label: string;
  display: string;
  citation: Citation;
  fact?: Fact;
  viaCopy: boolean;
}

export { PROTOCOL };
