import { ArrowLeft, CheckCircle2, ClipboardList, Droplets, ExternalLink, FileText, FileUp, Pill } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { useState } from 'react';
import { originalPdfUrl } from '@/domain/originals';
import { fmtDate } from '@/domain/format';
import type { MedicationMention, Recall, TrendPoint, TrendSeries } from '@/domain/types';
import { useSession } from '@/session';
import { AbsenceChip, Button, Card, CardHead, SkeletonCard, SourceChip, cx } from '@/ui/primitives';
import { TrendChart } from '@/ui/charts/TrendChart';
import { MedLane } from '@/ui/charts/Mini';
import { domainOf } from '@/ui/charts/scale';
import { useUi } from '@/ui/store';
import { TopBar } from './Chrome';
import { UploadDialog } from './UploadDocument';
import { ChecksList, buildChecks } from './Checks';

const dedupe = <T extends { id: string }>(xs: T[]) => xs.filter((x, i) => xs.findIndex(y => y.id === x.id) === i);

export default function DoctorPatient() {
  const close = useSession(s => s.closePatient);
  const vitals = useSession(s => s.vitals);
  const openId = useSession(s => s.openId)!;
  const uploads = useSession(s => s.uploads).filter(u => u.patientId === openId);
  const [uploading, setUploading] = useState(false);
  const openSource = useUi(s => s.openSource);
  const { data: r } = useApi(() => api.getRecall(openId), [openId]);

  if (!r) return <div className="screen"><TopBar /><main className="wrap"><SkeletonCard h={140} /><SkeletonCard h={300} /></main></div>;

  const p = r.patient; const pid = p.id;
  const visitDates = r.changes.map(c => ({ visit: c.visit, date: c.date }));
  const domain = domainOf(visitDates.map(v => v.date), 22);
  const T = Object.fromEntries(r.trends.map(t => [t.code, t])) as Record<string, TrendSeries>;
  const pick = (s: TrendSeries) => (pt: TrendPoint) => pt.citation && openSource({ kind: 'citation', citation: pt.citation, patientId: pid, title: `${s.label} ${pt.value!.toFixed(s.decimals)} ${s.unit === '%' ? '%' : s.unit}` });
  const lastChange = r.changes.at(-1)!;

  return (
    <div className="screen">
      <TopBar right={<Button variant="secondary" size="sm" onClick={close} icon={<ArrowLeft size={14} />}>Exit to dashboard</Button>} />
      <main className="wrap wrap--wide">
        {/* patient header */}
        <Card accent="ink" className="phead">
          <div className="phead__row">
            <span className="avatar">{p.initials}</span>
            <div className="grow">
              <h1>{p.name}</h1>
              <div className="phead__meta"><span>{p.age} years · {p.sex === 'F' ? 'Female' : 'Male'}</span><span>{p.weightKg} kg</span><span>{p.place}</span><span>ABHA {p.abhaId}</span><span>{r.diagnoses.at(-1)!.text}</span></div>
            </div>
            <div className="row" style={{ gap: 8 }}><a className="btn btn--secondary" href={originalPdfUrl(pid)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />View original document</a><Button onClick={() => setUploading(true)} icon={<FileUp size={15} />}>Upload document</Button></div>
            <div className="phead__last"><span className="eyebrow">Last visit</span><b>{fmtDate(p.lastVisitDate)}</b><small>visit {r.visits.length} of {r.visits.length} on record</small></div>
          </div>
        </Card>

        {/* summary */}
        <div className="cols cols--even">
          <Card accent="cerulean">
            <CardHead title="Summary" />
            <ol className="sum">
              {r.briefing.map(b => (
                <li key={b.id}><span>{b.text}</span><span className="sum__c">{dedupe(b.citations).slice(0, 3).map(c => <SourceChip key={c.id} citation={c} patientId={pid} />)}{b.absence && <AbsenceChip absence={b.absence} patientId={pid} title="Not on record" />}</span></li>
              ))}
            </ol>
          </Card>
          <Card accent="sage">
            <CardHead title={`What changed · visit ${lastChange.visit} vs ${lastChange.prevVisit}`} />
            <ul className="chgs">
              {lastChange.items.filter(i => ['measure', 'medication'].includes(i.kind)).map(i => (
                <li key={i.id}><span className="muted">{i.label}</span><span className="grow" />{i.from && <span className="muted num">{i.from} →</span>}<b className="num">{i.to}</b>
                  {i.kind === 'measure' && i.delta !== undefined && <span className={cx('delta', i.tone === 'good' ? 'delta--good' : 'delta--neutral')}>{i.delta > 0 ? '+' : '−'}{Math.abs(i.delta).toFixed(i.unit === '%' ? 1 : 0)}</span>}
                  {i.kind === 'medication' && <span className="delta delta--neutral">{i.to}</span>}
                  {i.citation && <SourceChip citation={i.citation} patientId={pid} />}</li>
              ))}
            </ul>
            {vitals?.patientId === pid && <div className="vit"><CheckCircle2 size={15} /><span><b>Vitals recorded today by {vitals.by}:</b> BP {vitals.sbp}/{vitals.dbp} mmHg · {vitals.weight} kg · {vitals.height} cm · pulse {vitals.pulse}</span></div>}
          </Card>
        </div>

        {/* trends */}
        <Card accent="ink">
          <CardHead title="Trends" icon={<Droplets size={16} />} right={<span className="hint">Click a point to see the slip it came from</span>} />
          <div className="trio">
            {(['hba1c', 'fbs', 'ppbs'] as const).map(c => (
              <div key={c}>
                <div className="trio__h"><b>{T[c].label}</b><span className="muted">{T[c].unit} · target {T[c].target?.label}</span></div>
                <TrendChart series={T[c]} domain={domain} visitDates={visitDates} height={170} onSelect={pick(T[c])} />
              </div>
            ))}
          </div>
        </Card>

        <div className="cols cols--even">
          {/* medicines */}
          <Card accent="sage">
            <CardHead title="Medicines" icon={<Pill size={16} />} />
            <div className="card__body">
              <MedLane meds={r.medications} domain={domain} visitDates={visitDates}
                onSelect={(m: MedicationMention) => openSource({ kind: 'citation', citation: m.citation, patientId: pid, title: `Visit ${m.visit}` })} />
              <ul className="meds">
                {r.medications.map(m => <li key={m.drug}><b>{m.drug}</b> {m.strength} · {m.regimen} · {m.route}</li>)}
              </ul>
              
            </div>
          </Card>

          {/* checks */}
          <Card accent="terracotta">
            <CardHead title="Checks — on record and not on record" icon={<ClipboardList size={16} />} />
            <ChecksList rows={buildChecks(r, vitals)} />
          </Card>
        </div>

        {uploads.length > 0 && (
          <Card accent="sage">
            <CardHead title="Uploaded documents" icon={<FileUp size={16} />} />
            <ul className="chk">{uploads.map(u => <li key={u.id}><span className="chk__i"><FileText size={18} /></span><span className="grow"><b>{u.name}</b><small>{u.type} · {u.size} · uploaded by {u.by}, {u.at}</small></span><span className="chip chip--sage">Uploaded</span></li>)}</ul>
          </Card>
        )}

        {/* visit history */}
        <Card accent="cerulean">
          <CardHead title="Visit history" icon={<FileText size={16} />} />
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Visit</th><th>Date</th><th>FBS</th><th>PPBS</th><th>HbA1c</th><th>Complaint and advice</th><th /></tr></thead>
              <tbody>
                {[...r.changes].reverse().map(c => <VisitRow key={c.visit} r={r} visit={c.visit} />)}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="hint" style={{ textAlign: 'center', margin: '8px 0 24px' }}>Prototype with synthetic data. Generated summaries are drafts for the clinician to review.</p>
      </main>
      {uploading && <UploadDialog patientId={pid} onClose={() => setUploading(false)} />}
    </div>
  );
}

function VisitRow({ r, visit }: { r: Recall; visit: number }) {
  const pid = r.patient.id;
  const rx = r.documents.find(d => d.kind === 'prescription' && d.visit === visit)!;
  const dx = r.documents.find(d => d.kind === 'diagnostic' && d.visit === visit)!;
  const val = (code: string, dec: number) => { const f = r.facts.find(x => x.visit === visit && x.code === code && x.source === 'his-import'); return f ? <SourceChip citation={f.citation} patientId={pid} label={Number(f.value).toFixed(dec)} /> : <span className="chip chip--dashed">not written</span>; };
  return (
    <tr>
      <td><b className="num">V{visit}</b></td><td>{fmtDate(rx.date)}</td>
      <td>{val('fbs', 0)}</td><td>{val('ppbs', 0)}</td><td>{val('hba1c', 1)}</td>
      <td className="vh"><span>{rx.complaint}</span><small>{rx.advice.slice(0, 2).join(' · ')}</small></td>
      <td><SourceChip citation={{ id: `nav:${dx.id}`, docId: dx.id, field: 'investigations', quote: '' }} patientId={pid} label="Open slip" /></td>
    </tr>
  );
}

