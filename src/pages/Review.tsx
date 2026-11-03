import { useState } from 'react';
import { AlertTriangle, BadgeCheck, ExternalLink, FileText, FileUp, Pencil, XCircle } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import type { DocumentItem } from '@/domain/documents';
import type { ObservationItem } from '@/domain/api';
import { fmtDate } from '@/domain/format';
import { OBS_BY_CODE } from '@/domain/observations';
import { useSession } from '@/session';
import { Button, Card, CardHead, cx } from '@/ui/primitives';
import { useUi } from '@/ui/store';
import { useT } from '@/i18n';
import { CorrectForm, ReasonForm } from '@/ui/ValueForms';

const shown = (o: ObservationItem) => {
  const def = OBS_BY_CODE[o.code];
  if (!def) return String(o.current);
  return def.kind === 'choice' ? def.options!.find(x => x.value === o.current)?.label ?? String(o.current) : `${o.current} ${def.unit}`;
};

function ValueRow({ patientId, o, role }: { patientId: string; o: ObservationItem; role: 'doctor' | 'nurse' | 'patient' }) {
  const toast = useUi(s => s.toast);
  const [mode, setMode] = useState<'view' | 'correct' | 'reject'>('view');
  const staff = role !== 'patient';
  const edited = o.history.some(h => h.reason.startsWith('Edited by the patient'));
  const run = async (fn: () => Promise<void>, ok: string) => { try { await fn(); toast(ok); setMode('view'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.', 'error'); } };
  return (
    <li className={cx('rv', o.flagged && 'is-flag')}>
      <div className="rv__main">
        <div className="grow">
          <b>{o.label}</b> <span className="chk__v num">{shown(o)}</span>
          {String(o.current) !== o.original && <small className="muted"> first read as {o.original}{edited ? ' · edited by the patient' : ''}</small>}
          <small>{o.page ? `Page ${o.page} · ` : ''}{fmtDate(o.date)}{o.sourceText ? <> · <q>{o.sourceText}</q></> : null}</small>
          {o.flagged && <small className="rv__warn"><AlertTriangle size={12} /> {o.flagged}</small>}
        </div>
        {mode === 'view' && staff && (
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" onClick={() => run(() => api.confirmObservation(patientId, o.id), `${o.label} confirmed`)} icon={<BadgeCheck size={14} />}>Confirm</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('correct')} icon={<Pencil size={14} />}>Correct</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('reject')} icon={<XCircle size={14} />}>Reject</Button>
          </div>
        )}
        {mode === 'view' && !staff && <Button size="sm" variant="secondary" onClick={() => setMode('correct')} icon={<Pencil size={14} />}>Edit</Button>}
      </div>
      {mode === 'correct' && (
        staff
          ? <CorrectForm code={o.code} current={String(o.current ?? '')} onCancel={() => setMode('view')} onSave={(v, r) => run(() => api.correctObservation(patientId, o.id, v, r), 'Correction saved')} />
          : <PatientEdit code={o.code} current={String(o.current ?? '')} onCancel={() => setMode('view')} onSave={v => run(() => api.editObservation(patientId, o.id, v), 'Saved. Your doctor will review it.')} />
      )}
      {mode === 'reject' && <ReasonForm label="Why is this value wrong?" action="Reject value" onCancel={() => setMode('view')} onSave={r => run(() => api.rejectObservation(patientId, o.id, r), 'Value rejected')} />}
    </li>
  );
}

function PatientEdit({ code, current, onSave, onCancel }: { code: string; current: string; onSave: (v: string) => Promise<void>; onCancel: () => void }) {
  const def = OBS_BY_CODE[code];
  const [v, setV] = useState(current);
  const [err, setErr] = useState('');
  return (
    <form className="row" style={{ gap: 8, marginTop: 8 }} onSubmit={async e => { e.preventDefault(); try { await onSave(v); } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not save.'); } }}>
      {def?.kind === 'choice'
        ? <select className="select" value={v} onChange={e => setV(e.target.value)}>{def.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : <input className="input" type="number" step="any" value={v} onChange={e => setV(e.target.value)} aria-label="Corrected value" style={{ maxWidth: 140 }} />}
      <Button size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      {err && <span className="error-text" role="alert">{err}</span>}
    </form>
  );
}

function PushButton({ patientId, d }: { patientId: string; d: DocumentItem }) {
  const toast = useUi(s => s.toast);
  return <Button size="sm" variant="secondary" onClick={async () => { try { await api.pushDocument(patientId, d.id); toast('Pushed to ABDM'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not push.', 'error'); } }}>Push to ABDM</Button>;
}

const METHOD: Record<string, string> = { 'text-layer': 'Read from the PDF text', ocr: 'Read by the document reader' };

function DocBlock({ patientId, d, values, role }: { patientId: string; d: DocumentItem; values: ObservationItem[]; role: 'doctor' | 'nurse' | 'patient' }) {
  const t = useT();
  const waiting = values.filter(v => v.status === 'extracted');
  const done = values.length - waiting.length;
  return (
    <div className="rvdoc">
      <div className="rvdoc__head">
        <span className="chk__i"><FileText size={18} /></span>
        <span className="grow"><b>{d.fileName}</b><small>{d.docType} · uploaded by {d.by}{d.origin === 'patient' ? ' (patient)' : ''}, {fmtDate(d.at)}{d.method ? ` · ${METHOD[d.method]}` : ''}{d.pages ? ` · ${d.pages} page${d.pages === 1 ? '' : 's'}` : ''}</small></span>
        <span className="chip chip--outline" title="Kept in our private store until it is pushed to ABDM">{d.syncStatus === 'pushed' ? 'Pushed to ABDM' : 'Pending, not yet shared'}</span>
        {role !== 'patient' && d.status === 'done' && d.syncStatus === 'pending' && <PushButton patientId={patientId} d={d} />}
        <a className="btn btn--secondary btn--sm" href={`/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open file</a>
      </div>
      {d.status === 'failed' && <p className="error-text" role="alert">{d.error}</p>}
      {d.status === 'done' && values.length === 0 && <p className="hint">No values were found in this document.</p>}
      {waiting.length > 0 && (
        <>
          <div className="eyebrow" style={{ margin: '10px 0 4px' }}>{role === 'patient' ? t('Waiting for your doctor to review') : `${waiting.length} value${waiting.length === 1 ? '' : 's'} to review. Compare with the file, then confirm, correct or reject.`}</div>
          <ul className="rvlist">{waiting.map(o => <ValueRow key={o.id} patientId={patientId} o={o} role={role} />)}</ul>
        </>
      )}
      {done > 0 && <p className="hint" style={{ marginTop: 8 }}>{done} value{done === 1 ? '' : 's'} already reviewed from this document.</p>}
    </div>
  );
}

/** Uploaded documents and the values read from them. Nothing here counts as record until a doctor or nurse confirms it. */
export function ReviewCard({ patientId, onUpload }: { patientId: string; onUpload: () => void }) {
  const role = useSession(s => s.user!.role);
  const t = useT();
  const docs = useApi(() => api.listDocuments(patientId), [patientId]);
  const obs = useApi(() => api.listObservations(patientId), [patientId]);
  const list = docs.data ?? [];
  const values = obs.data ?? [];
  const total = list.reduce((n, d) => n + d.waiting, 0);
  return (
    <Card accent="sage">
      <CardHead title={role === 'patient' ? t('Your uploaded documents') : 'Uploaded documents and values to review'} icon={<FileUp size={16} />}
        right={<div className="row" style={{ gap: 8 }}>{total > 0 && <span className="chip chip--cerulean">{total} to review</span>}<Button size="sm" variant="secondary" onClick={onUpload} icon={<FileUp size={14} />}>{t('Upload document')}</Button></div>} />
      <div className="card__body">
        {list.length === 0
          ? <p className="hint">{role === 'patient' ? t('Add an old prescription or report. Your doctor reviews what is read from it.') : 'No uploaded documents yet. Values read from a document stay here until you confirm them.'}</p>
          : list.map(d => <DocBlock key={d.id} patientId={patientId} d={d} role={role as 'doctor' | 'nurse' | 'patient'} values={values.filter(v => v.documentId === d.id)} />)}
      </div>
    </Card>
  );
}
