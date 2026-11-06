import { Pill } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { useSession } from '@/session';
import { SkeletonCard, cx } from '@/ui/primitives';
import { SparkLine } from '@/ui/charts/Mini';
import { LoadError, TopBar } from './Chrome';
import { ChecksList, buildChecks } from './Checks';
import { vitalsNote } from '@/domain/profile';
import { ReviewCard } from './Review';
import { ConsentInbox } from './Exchange';
import { UploadDialog } from './UploadDocument';
import { useState } from 'react';
import { useSection } from '@/ui/nav';
import { NextVisitCard, PatientNotifications } from './SampleCards';
import { Tx, useT } from '@/i18n';
import { ReadAloud } from '@/i18n/controls';
import { AskRecord } from './AskRecord';
import { ScanShareCard } from './Opd';
import { NetworkLog } from './NavMenu';
import { CorrectionCard, CounsellingCard } from './Care';

export default function PatientHome() {
  const user = useSession(s => s.user)!;
  const t = useT();
  const sec = useSection();
  const [uploading, setUploading] = useState(false);
  const { data: r, error, refetch } = useApi(() => api.getRecall(user.patientId!), [user.patientId]);
  if (error && !r) return <LoadError message={error} onRetry={refetch} />;
  if (!r) return <div className="screen"><TopBar /><main className="wrap wrap--narrow"><SkeletonCard h={200} /></main></div>;
  const T = Object.fromEntries(r.trends.map(t => [t.code, t]));
  const hb = T.hba1c;
  const sugar = t('Your HbA1c was {value}% at your last visit. The first value written in your record was {first}%.', { value: hb.latest!.value!.toFixed(1), first: hb.firstReading!.value!.toFixed(1) });
  const speech = [
    t('Namaste, {name}', { name: r.patient.name.replace(/^Mrs?\. /, '') }), sugar,
    `${t('Fasting sugar')} ${T.fbs.latest!.value}`, `${t('After-meal sugar')} ${T.ppbs.latest!.value}`,
    `${t('Your medicines')}: ${r.medications.map(m => m.drug).join(', ')}`,
  ];
  return (
    <div className="screen screen--patient">
      <TopBar />
      <main className="wrap wrap--narrow">
        <div className="hello"><div><div className="eyebrow">{t('Your health record · ABHA {abha}', { abha: r.patient.abhaId })}</div><h1>{t('Namaste, {name}', { name: r.patient.name.replace(/^Mrs?\. /, '') })}</h1></div><div className="row" style={{ gap: 8 }}><ReadAloud sentences={speech} /></div></div>

        {sec === 'home' && <div className="cols cols--even">
<div className="stack" style={{ gap: 18 }}>
<section className="card pcard2" data-accent="sage">
          <div className="eyebrow">{t('Your sugar control')}</div>
          <div className="pcard2__big"><span className="num">{hb.latest!.value!.toFixed(1)}<small>%</small></span><SparkLine values={hb.points.map(p => p.value)} w={150} h={46} /></div>
          <p>{sugar}</p>
          <div className="glance">
            {(['fbs', 'ppbs'] as const).map(c => <div key={c}><span className="eyebrow">{c === 'fbs' ? t('Fasting sugar') : t('After-meal sugar')}</span><b className="num">{T[c].latest!.value}</b><small>{t('mg/dL · was {first}', { first: T[c].firstReading!.value! })}</small></div>)}
          </div>
          <small className="muted">{t('As of your visit on {date}', { date: fmtDate(r.patient.lastVisitDate) })}</small>
        </section>
<NextVisitCard /><PatientNotifications /></div>


          <div className="stack" style={{ gap: 18 }}><section className="card" data-accent="terracotta">
          <div className="card__head"><h2 className="card__title">{t('Your checks')}</h2></div>
          <ChecksList plain sections={buildChecks(r)} />
        </section>

        {(() => { const v = vitalsNote(r); return v && (
          <section className="card" data-accent="ink">
            <div className="card__head"><h2 className="card__title">{t('Last measured')}</h2></div>
            <div className="glance" style={{ padding: '4px 18px 16px' }}>
              {v.bp && <div><span className="eyebrow">{t('Blood pressure')}</span><b className="num">{v.bp.replace(' mmHg', '')}</b><small>mmHg</small></div>}
              {v.weight && <div><span className="eyebrow">{t('Weight')}</span><b className="num">{v.weight.replace(' kg', '')}</b><small>kg</small></div>}
              {v.bmi && <div><span className="eyebrow">BMI</span><b className="num">{v.bmi}</b><small>{fmtDate(v.date)}</small></div>}
            </div>
          </section>
        ); })()}

</div>
        </div>}

        {sec === 'care' && <div className="cols cols--even">
          <div className="stack" style={{ gap: 18 }}><AskRecord patientId={user.patientId!} />
<section className="card" data-accent="cerulean">
          <div className="card__head"><h2 className="card__title"><Pill size={16} />{t('Your medicines')}</h2></div>
          <ul className="pmeds">
            {r.medications.map(m => <li key={m.drug}><b>{m.drug}</b><span>{m.strength} · <Tx text={m.regimen} /></span></li>)}
          </ul>
        </section>

</div>
          <CounsellingCard patientId={user.patientId!} role="patient" />
        </div>}

        {sec === 'reports' && <div className="cols cols--even">
          <div className="stack" style={{ gap: 18 }}><ReviewCard patientId={r.patient.id} onUpload={() => setUploading(true)} />
<section className="card" data-accent="ink">
          <div className="card__head"><h2 className="card__title">{t('Your visits')}</h2></div>
          <ul className="pvisits">
            {[...r.changes].reverse().map(c => { const rx = r.documents.find(d => d.kind === 'prescription' && d.visit === c.visit)!; return (
              <li key={c.visit}><time>{fmtDate(c.date)}</time><span className={cx('grow')}><Tx text={rx.complaint} /></span></li>
            ); })}
          </ul>
        </section>
</div>
        <CorrectionCard patientId={user.patientId!} role="patient" choices={(['hba1c', 'fbs', 'ppbs'] as const).flatMap(c => T[c].points.filter(p => p.value !== null).map(p => `${T[c].label} ${p.value!.toFixed(T[c].decimals)}${T[c].unit === '%' ? '%' : ' ' + T[c].unit} on ${fmtDate(p.date)}`))} />

        </div>}

        {sec === 'sharing' && <div className="cols cols--even">
          <div className="stack" style={{ gap: 18 }}><ScanShareCard /><ConsentInbox /></div>
          <NetworkLog />
        </div>}
        {uploading && <UploadDialog patientId={r.patient.id} patient onClose={() => setUploading(false)} />}
      </main>
    </div>
  );
}
