import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, FileUp, HeartPulse, Pill, Save } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { useSession } from '@/session';
import { originalPdfUrl } from '@/domain/originals';
import { Button, Card, CardHead, SkeletonCard, SourceChip } from '@/ui/primitives';
import { useUi } from '@/ui/store';
import { TopBar } from './Chrome';
import { UploadDialog } from './UploadDocument';
import { ChecksList, buildChecks } from './Checks';

export default function NursePatient() {
  const close = useSession(s => s.closePatient);
  const vit = useSession(s => s.vitals);
  const user = useSession(s => s.user);
  const saved = vit?.patientId === useSession.getState().openId ? vit : null;
  const saveVitals = useSession(s => s.saveVitals);
  const toast = useUi(s => s.toast);
  const openId = useSession(s => s.openId)!;
  const uploads = useSession(s => s.uploads).filter(u => u.patientId === openId);
  const [uploading, setUploading] = useState(false);
  const { data: r } = useApi(() => api.getRecall(openId), [openId]);
  const [f, setF] = useState({ sbp: '', dbp: '', weight: '', height: '', pulse: '' });
  const [err, setErr] = useState('');
  if (!r) return <div className="screen"><TopBar /><main className="wrap"><SkeletonCard h={300} /></main></div>;
  const p = r.patient; const pid = p.id;
  const last = r.changes.at(-1)!;
  const rx = r.documents.filter(d => d.kind === 'prescription').at(-1)!;
  const T = Object.fromEntries(r.trends.map(t => [t.code, t]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = (k: keyof typeof f) => Number(f[k]);
    if (!f.sbp || !f.dbp || !f.weight || !f.height) { setErr('Enter BP (both numbers), weight and height.'); return; }
    if (n('sbp') < 60 || n('sbp') > 260 || n('dbp') < 30 || n('dbp') > 160) { setErr('That blood pressure looks implausible. Check the reading and re-enter.'); return; }
    setErr('');
    saveVitals({ ...f, patientId: pid, pulse: f.pulse || '—', by: user?.name ?? 'Nurse' });
    toast('Vitals saved — the doctor can see them now');
  };
  const bmi = f.weight && f.height ? (Number(f.weight) / (Number(f.height) / 100) ** 2).toFixed(1) : null;

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
            <CardHead title="Record today’s vitals" icon={<HeartPulse size={16} />} right={saved ? <span className="chip chip--sage"><CheckCircle2 size={12} />Saved</span> : <span className="chip chip--dashed">Not recorded yet</span>} />
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
              <div className="row"><Button icon={<Save size={15} />}>Save vitals</Button>
                <Button type="button" variant="secondary" icon={<FileUp size={15} />} onClick={() => setUploading(true)}>Upload document</Button></div>
            </form>
          </Card>

          <div className="stack" style={{ gap: 18 }}>
            <Card accent="sage">
              <CardHead title="Checks — on record and not on record" />
              <ChecksList rows={buildChecks(r, vit)} />
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
        {uploads.length > 0 && (
          <Card accent="sage">
            <CardHead title="Uploaded documents" icon={<FileUp size={16} />} />
            <ul className="chk">{uploads.map(u => <li key={u.id}><span className="chk__i"><FileText size={18} /></span><span className="grow"><b>{u.name}</b><small>{u.type} · {u.size} · uploaded by {u.by}, {u.at}</small></span><span className="chip chip--sage">Uploaded</span></li>)}</ul>
          </Card>
        )}
      </main>
      {uploading && <UploadDialog patientId={pid} onClose={() => setUploading(false)} />}
    </div>
  );
}
const Pill2 = () => <Pill size={14} className="muted" />;
