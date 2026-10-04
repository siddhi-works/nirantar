/**
 * Mutable "database" of the mock backend: tasks, verifications, AI acceptances and the append-only audit log.
 * Persisted to localStorage so a refresh keeps the demo state. A real backend replaces this whole module.
 */
import type { AuditEvent, Role, Task } from '@/domain/types';
import { PROTOCOL } from '@/domain/forms';
import { buildRecall, EMPTY_OPS, type Ops } from './engine';
import { parseRecord } from './parse';

interface DbState {
  ops: Ops;
  audit: AuditEvent[];
  seq: number;
}

const KEY = 'nirantar-mock-v1';
const listeners = new Set<() => void>();
let state: DbState = seed();
let version = 0;

function load(): DbState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DbState) : null;
  } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable — demo state is session-only */ }
}

/** High-severity gaps auto-create a task (protocol default). Records are stamped in each patient's own record frame. */
function seed(): DbState {
  const cached = typeof localStorage !== 'undefined' ? load() : null;
  if (cached) return cached;
  const tasks: Task[] = [];
  const audit: AuditEvent[] = [];
  let seq = 0;
  const now = new Date().toISOString();
  for (const p of parseRecord().patients) {
    const r = buildRecall(p.id, EMPTY_OPS);
    for (const g of r.gaps.filter(x => x.status !== 'closed' && x.severity === PROTOCOL.autoTaskSeverity)) {
      seq += 1;
      const at = `${p.asOf}T09:00`;
      const due = new Date(`${p.asOf}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + PROTOCOL.taskDueDays[g.severity]);
      tasks.push({
        id: `T-${String(seq).padStart(3, '0')}`, patientId: p.id, gapId: g.id, ruleId: g.ruleId, title: g.suggestedActions[0]?.taskTitle ?? g.title,
        owner: g.ownerRole, priority: g.severity, dueDate: due.toISOString().slice(0, 10), status: 'open', origin: 'rules-engine',
        note: `Auto-created: ${g.severity}-severity gaps open a task by protocol default.`, createdAt: at, createdBy: 'Rules engine',
        events: [{ at, label: `Task created by ${g.ruleId} v${g.ruleVersion} (protocol default for high-severity gaps)`, actor: 'Rules engine' }],
      });
    }
  }
  audit.push({ id: 'A-0001', at: now, actorRole: 'doctor', action: 'Rules engine recomputed', target: 'All patients', purpose: 'Session start', detail: 'Prototype ruleset v0.1 · 2 patients · 15 rules evaluated' });
  return { ops: { tasks, verifications: {}, aiAccepted: {} }, audit, seq };
}

export const db = {
  get ops(): Ops { return state.ops; },
  get audit(): AuditEvent[] { return state.audit; },
  get version() { return version; },
  nextTaskId(): string { state.seq += 1; return `T-${String(state.seq).padStart(3, '0')}`; },
  log(e: Omit<AuditEvent, 'id' | 'at'>) {
    const id = `A-${String(state.audit.length + 1).padStart(4, '0')}`;
    state.audit = [{ ...e, id, at: new Date().toISOString() }, ...state.audit];
    version += 1;
    save();
    listeners.forEach(l => l());
  },
  /** Commit a mutation: persist and notify subscribers (stand-in for server events / refetch). */
  commit(mutate: (s: DbState) => void) {
    mutate(state);
    version += 1;
    save();
    listeners.forEach(l => l());
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  reset() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    state = seed();
    version += 1;
    save();
    listeners.forEach(l => l());
  },
  /** Record-frame timestamp: the patient's as-of date with the real wall-clock time of day. */
  stamp(asOf: string): string {
    const d = new Date();
    return `${asOf}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
};
export type { Role };
