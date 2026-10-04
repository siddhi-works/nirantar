/**
 * The only door between the UI and "the backend". The interface mirrors the PRD's endpoints
 * (GET /patients/search, GET /patients/{id}/recall, POST /tasks, POST /tasks/{id}/close, GET /audit …).
 * `mockApi` implements it against src/server-mock. To go live, implement NirantarApi over fetch() and
 * swap the export at the bottom — no UI code changes.
 */
import type {
  ActionInput, ApiResult, AuditEvent, ClinicOverview, CloseInput, CreateTaskInput, EvidenceInput, Gap, Patient,
  Recall, Role, RuleDefinition, SearchHit, SourceDocument, Task,
} from '@/domain/types';
import { db } from '@/server-mock/db';
import { service, type ExtractedItem } from '@/server-mock/service';

export type { ExtractedItem };

export interface DocumentView {
  doc: SourceDocument | null;
  siblings: SourceDocument[];
  items: ExtractedItem[];
  recall: Recall;
}

export interface NirantarApi {
  searchPatients(q: string): Promise<SearchHit[]>;
  listPatients(): Promise<Patient[]>;
  getOverview(): Promise<ClinicOverview>;
  getRecall(patientId: string): Promise<Recall>;
  getDocumentView(patientId: string, docId: string): Promise<DocumentView>;
  listGaps(): Promise<{ gap: Gap; patient: Patient }[]>;
  listTasks(): Promise<{ task: Task; patient: Patient; gap: Gap | undefined }[]>;
  listRules(): Promise<RuleDefinition[]>;
  listAudit(): Promise<AuditEvent[]>;

  recordView(patientId: string, role: Role, purpose: string): Promise<void>;
  createTask(input: CreateTaskInput, role: Role): Promise<ApiResult<Task>>;
  recordAction(input: ActionInput, role: Role): Promise<ApiResult<Task>>;
  recordEvidence(input: EvidenceInput, role: Role): Promise<ApiResult<Task>>;
  closeTask(input: CloseInput, role: Role): Promise<ApiResult<Task>>;
  verifyFacts(patientId: string, factIds: string[], role: Role): Promise<ApiResult<number>>;
  acceptAiSummary(patientId: string, role: Role): Promise<ApiResult<true>>;
  resetDemo(): Promise<void>;

  /** Stand-in for server events: called whenever data may have changed. */
  subscribe(listener: () => void): () => void;
  /** Bumps on every change; hooks use it to refetch. */
  readonly version: number;
}

const latency = <T,>(v: T, ms = 90): Promise<T> => new Promise(res => setTimeout(() => res(v), ms + Math.random() * 90));

export const mockApi: NirantarApi = {
  searchPatients: q => latency(service.search(q), 30),
  listPatients: () => latency(service.patients(), 30),
  getOverview: () => latency(service.overview()),
  getRecall: id => latency(service.recall(id)),
  getDocumentView: (pid, docId) => latency(service.documentView(pid, docId), 40),
  listGaps: () => latency(service.gaps()),
  listTasks: () => latency(service.tasks()),
  listRules: () => latency(service.rules(), 40),
  listAudit: () => latency(service.audit(), 40),

  recordView: async (pid, role, purpose) => { service.recordView(pid, role, purpose); },
  createTask: (i, r) => latency(service.createTask(i, r), 120),
  recordAction: (i, r) => latency(service.recordAction(i, r), 120),
  recordEvidence: (i, r) => latency(service.recordEvidence(i, r), 120),
  closeTask: (i, r) => latency(service.closeTask(i, r), 120),
  verifyFacts: (pid, ids, r) => latency(service.verifyFacts(pid, ids, r), 80),
  acceptAiSummary: (pid, r) => latency(service.acceptAi(pid, r), 80),
  resetDemo: async () => { service.reset(); },

  subscribe: fn => db.subscribe(fn),
  get version() { return db.version; },
};

export const api: NirantarApi = mockApi;
