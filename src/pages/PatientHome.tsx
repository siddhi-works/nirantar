import { Pill } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { useSession } from '@/session';
import { SkeletonCard, cx } from '@/ui/primitives';
import { SparkLine } from '@/ui/charts/Mini';
import { TopBar } from './Chrome';
import { ChecksList, buildChecks } from './Checks';

export default function PatientHome() {
  const vitals = useSession(s => s.vitals);
  const user = useSession(s => s.user)!;
  const { data: r } = useApi(() => api.getRecall(user.patientId!), [user.patientId]);
  if (!r) return <div className="screen"><TopBar /><main className="wrap wrap--narrow"><SkeletonCard h={200} /></main></div>;
  const T = Object.fromEntries(r.trends.map(t => [t.code, t]));
  const hb = T.hba1c;
  return (
    <div className="screen screen--patient">
      <TopBar />
      <main className="wrap wrap--narrow">
        <div className="hello"><div><div className="eyebrow">Your health record · ABHA {r.patient.abhaId}</div><h1>Namaste, {r.patient.name.replace(/^Mrs?\. /, '')}</h1></div></div>

        <section className="card pcard2" data-accent="sage">
          <div className="eyebrow">Your sugar control</div>
          <div className="pcard2__big"><span className="num">{hb.latest!.value!.toFixed(1)}<small>%</small></span><SparkLine values={hb.points.map(p => p.value)} w={150} h={46} /></div>
          <p>Your HbA1c was {hb.latest!.value!.toFixed(1)}% at your last visit. The first value written in your record was {hb.firstReading!.value!.toFixed(1)}%.</p>
          <div className="glance">
            {(['fbs', 'ppbs'] as const).map(c => <div key={c}><span className="eyebrow">{c === 'fbs' ? 'Fasting sugar' : 'After-meal sugar'}</span><b className="num">{T[c].latest!.value}</b><small>mg/dL · was {T[c].firstReading!.value}</small></div>)}
          </div>
          <small className="muted">As of your visit on {fmtDate(r.patient.lastVisitDate)}</small>
        </section>

        <section className="card" data-accent="cerulean">
          <div className="card__head"><h3 className="card__title"><Pill size={16} />Your medicines</h3></div>
          <ul className="pmeds">
            {r.medications.map(m => <li key={m.drug}><b>{m.drug}</b><span>{m.strength} · {m.regimen}</span></li>)}
          </ul>
        </section>

        <section className="card" data-accent="terracotta">
          <div className="card__head"><h3 className="card__title">Your checks</h3></div>
          <ChecksList plain rows={buildChecks(r, vitals)} />
        </section>

        {vitals?.patientId === r.patient.id && (
          <section className="card" data-accent="ink">
            <div className="card__head"><h3 className="card__title">Measured today</h3></div>
            <div className="glance" style={{ padding: '4px 18px 16px' }}>
              <div><span className="eyebrow">Blood pressure</span><b className="num">{vitals.sbp}/{vitals.dbp}</b><small>mmHg</small></div>
              <div><span className="eyebrow">Weight</span><b className="num">{vitals.weight}</b><small>kg</small></div>
            </div>
          </section>
        )}

        <section className="card" data-accent="ink">
          <div className="card__head"><h3 className="card__title">Your visits</h3></div>
          <ul className="pvisits">
            {[...r.changes].reverse().map(c => { const rx = r.documents.find(d => d.kind === 'prescription' && d.visit === c.visit)!; return (
              <li key={c.visit}><time>{fmtDate(c.date)}</time><span className={cx('grow')}>{rx.complaint}</span></li>
            ); })}
          </ul>
        </section>
        <p className="hint" style={{ textAlign: 'center', marginBottom: 28 }}>Prototype with synthetic data. This is not medical advice — talk to your doctor.</p>
      </main>
    </div>
  );
}
