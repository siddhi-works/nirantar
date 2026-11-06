import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardPlus, ExternalLink, FileUp, HeartPulse, Pill, Save } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { useSession } from '@/session';
import { originalPdfUrl } from '@/domain/originals';
import { Button, Card, CardHead, SkeletonCard, SourceChip } from '@/ui/primitives';
import { useUi } from '@/ui/store';
import { LoadError, TopBar } from './Chrome';
import { UploadDialog } from './UploadDocument';
import { ChecksList, buildChecks } from './Checks';
import { RecordDialog } from './RecordResult';
import { CorrectionCard, CounsellingCard, SummaryBlock } from './Care';
import { ReviewCard } from './Review';
import { bmi as bmiOf } from '@/domain/observations';
import { vitalsNote } from '@/domain/profile';

export default function NursePatient() {
  const close = useSession(s => s.closePatient);
  const toast = useUi(s => s.toast);
  const openId = useSession(s => s.openId)!;
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: r, error, refetch } = useApi(() => api.getRecall(openId), [openId]);
  const [f, setF] = useState({ sbp: '', dbp: '', weight: '', height: '', pulse: '' });
  const [err, setErr] = useState('');
  if (error && !r) return <LoadError message={error} onRetry={refetch} onBack={close} />;
  if (!r) return <div className="screen"><TopBar /><main className="wrap"><SkeletonCard h={300} /></main></div>;
  const p = r.patient; const pid = p.id;
  const last = r.changes.at(-1)!;
  const rx = r.documents.filter(d => d.kind === 'prescription').at(-1)!;
  const T = Object.fromEntries(r.trends.map(t => [t.code, t]));

  const vit = vitalsNote(r);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.sbp || !f.dbp || !f.weight || !f.height) { setErr('Enter BP (both numbers), weight and height.'); return; }
    setBusy(true); setErr('');
    try {
      await api.recordValues(pid, [
        { code: 'sbp', value: f.sbp }, { code: 'dbp', value: f.dbp }, { code: 'weight', value: f.weight },
        { code: 'height', value: f.height }, { code: 'pulse', value: f.pulse },
      ]);
      setF({ sbp: '', dbp: '', weight: '', height: '', pulse: '' });
      toast('Vitals saved. The doctor can see them now.');
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not save the vitals.'); } finally { setBusy(false); }
  };
  const bmi = f.weight && f.height && Number(f.height) > 0 ? bmiOf(Number(f.weight), Number(f.height)).toFixed(1) : null;

  return (
    <div className="screen">
      <TopBar right={<Button variant="secondary" size="sm" onClick={close} icon={<ArrowLeft size={14} />}>Exit to dashboard</Button>} />
      <main className="wrap wrap--wide">
        <Card accent="ink" className="phead"><div className="phead__row">
          <span className="avatar">{p.initials}</span>
          <div className="grow"><h1>{p.name}</h1><div className="phead__meta"><span>{p.age} years · Female</span><span>{p.place}</span><span>ABHA {p.abhaId}</span><span>Doctor: {p.doctor}</span></div></div>
          <a className="btn btn--secondary" href={originalPdfUrl(pid)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />View original document</a>
          <div className="phead__last"><span className="eyebrow">Last visit</span><b>{fmtDate(p.lastVisitDate)}</b></div>
        </div></Card>

        <div className="cols cols--even">
          <Card accent="cerulean">
            <CardHead title="Record today’s vitals" icon={<HeartPulse size={16} />} right={vit ? <span className="chip chip--sage"><CheckCircle2 size={12} />Last saved {fmtDate(vit.date)}</span> : <span className="chip chip--dashed">Not recorded yet</span>} />
            <form className="card__body vitals" onSubmit={submit}>
              <div className="grid2" style={{ gap: 14 }}>
                <div className="field"><label htmlFor="sbp">Systolic BP</label><div className="input-unit"><input id="sbp" className="input" type="number" value={f.sbp} onChange={e => setF({ ...f, sbp: e.target.value })} /><span>mmHg</span></div></div>
                <div className="field"><label htmlFor="dbp">Diastolic BP</label><div className="input-unit"><input id="dbp" className="input" type="number" value={f.dbp} onChange={e => setF({ ...f, dbp: e.target.value })} /><span>mmHg</span></div></div>
                <div className="field"><label htmlFor="wt">Weight</label><div className="input-unit"><input id="wt" className="input" type="number" value={f.weight} onChange={e => setF({ ...f, weight: e.target.value })} /><span>kg</span></div></div>
                <div className="field"><label htmlFor="ht">Height</label><div className="input-unit"><input id="ht" className="input" type="number" value={f.height} onChange={e => setF({ ...f, height: e.target.value })} /><span>cm</span></div></div>
                <div className="field"><label htmlFor="pl">Pulse</label><div className="input-unit"><input id="pl" className="input" type="number" value={f.pulse} onChange={e => setF({ ...f, pulse: e.target.value })} /><span>/min</span></div></div>
                <div className="field"><label>BMI</label><div className="bmi">{bmi ?? '—'}</div></div>
              </div>
              <p className="hint" style={{ margin: '10px 0' }}>Blood pressure and height are not on any earlier slip. Saved readings appear in the doctor’s record.</p>
              {err && <div className="error-text" role="alert">{err}</div>}
              <div className="row"><Button icon={<Save size={15} />} disabled={busy}>Save vitals</Button>
                <Button type="button" variant="secondary" icon={<FileUp size={15} />} onClick={() => setUploading(true)}>Upload document</Button></div>
            </form>
          </Card>

          <div className="stack" style={{ gap: 18 }}>
            <Card accent="sage">
              <CardHead title="Checks — on record and not on record" right={<Button size="sm" variant="secondary" onClick={() => setRecording(true)} icon={<ClipboardPlus size={14} />}>Record a result</Button>} />
              <ChecksList sections={buildChecks(r)} />
            </Card>
            <Card accent="terracotta">
              <CardHead title="Last visit at a glance" />
              <div className="card__body">
                <div className="glance">
                  {(['fbs', 'ppbs', 'hba1c'] as const).map(c => <div key={c}><span className="eyebrow">{T[c].label}</span><b className="num">{T[c].latest!.value!.toFixed(T[c].decimals)}</b><small>{T[c].unit}</small></div>)}
                </div>
                <div className="row-wrap" style={{ margin: '12px 0 6px' }}><Pill2 />{r.medications.map(m => <span key={m.drug} className="chip chip--outline">{m.drug} {m.strength}</span>)}</div>
                <div className="eyebrow" style={{ margin: '12px 0 6px' }}>As written on the slip, visit {last.visit}</div>
                <ul className="advice-s">{rx.advice.map((a, i) => <li key={i}>{a}</li>)}</ul>
                <div style={{ marginTop: 8 }}><SourceChip citation={{ id: `nav:${rx.id}`, docId: rx.id, field: 'advice', quote: '' }} patientId={pid} label="Open slip" /></div>
              </div>
            </Card>
          </div>
        </div>
        <ReviewCard patientId={pid} onUpload={() => setUploading(true)} />
        <SummaryBlock patientId={pid} />
        <CounsellingCard patientId={pid} role="nurse" />
        <CorrectionCard patientId={pid} role="nurse" />
      </main>
      {uploading && <UploadDialog patientId={pid} onClose={() => setUploading(false)} />}
      {recording && <RecordDialog patientId={pid} onClose={() => setRecording(false)} />}
    </div>
  );
}
const Pill2 = () => <Pill size={14} className="muted" />;
