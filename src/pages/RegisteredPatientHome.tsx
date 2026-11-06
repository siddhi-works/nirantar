import { useMemo, useState } from 'react';
import { BadgeCheck, FileUp, Info } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { useSession } from '@/session';
import { Button, Card, CardHead, SkeletonCard } from '@/ui/primitives';
import { LoadError, TopBar } from './Chrome';
import { CorrectionCard, CounsellingCard } from './Care';
import { AskRecord } from './AskRecord';
import { ConsentInbox } from './Exchange';
import { NetworkLog } from './NavMenu';
import { ScanShareCard } from './Opd';
import { HowItWorks } from './Purpose';
import { NextVisitCard } from './SampleCards';
import { ObsOverview, ObsTable, fmtWhen, type Obs } from './ReceivedDashboard';
import { ReviewCard } from './Review';
import { UploadDialog } from './UploadDocument';

const CONSENT = { 'create-record': 'A health record is kept for you', 'abha-link': 'The record is linked to your ABHA number', 'share-abdm': 'Sharing through ABDM, when you allow each request' } as const;

/**
 * The home page of a patient the hospital registered. It shows only what is on record: who they are, what they agreed to, and the
 * values staff have recorded or confirmed. Anything that does not exist yet is shown as such.
 */
export default function RegisteredPatientHome() {
  const user = useSession(s => s.user)!;
  const view = useSession(s => s.view);
  const id = user.patientId!;
  const home = useApi(() => api.getOwnHome(id), [id]);
  const [uploading, setUploading] = useState(false);
  const obs: Obs[] = useMemo(() => (home.data?.values ?? []).map(v => ({ code: v.code, label: v.label, date: v.date, value: v.value, display: v.display, status: 'final', source: { text: `${v.source.origin === 'upload' ? 'Read from an uploaded report' : 'Entered'} · ${v.source.by}`, docId: v.source.documentId, patientId: id, quote: v.source.quote } })), [home.data]);

  if (home.error && !home.data) return <LoadError message={home.error} onRetry={home.refetch} />;
  if (!home.data) return <div className="screen screen--patient"><TopBar /><main className="wrap wrap--fit"><SkeletonCard h={160} /></main></div>;
  const p = home.data.profile;
  return (
    <div className="screen screen--patient">
      <TopBar />
      <main className="wrap wrap--narrow">
        {view === 'main' ? (<>
        <section className="hero hero--patient">
          <div className="hero__text">
            <span className="hero__tag"><span>Your health record</span><time>ABHA {p.abha}</time></span>
            <h1>Namaste, {p.name}</h1>
            <p>Only what is on record is shown here. Anything missing says so.</p>
          </div>
          <img className="hero__img" src="/img/walk.jpg" alt="" width="1200" height="900" />
        </section>

        <HowItWorks role="patient" />

        <div className="cols" id="summary">
          <div className="stack" style={{ gap: 18 }}>{obs.length === 0
          ? <div className="xban" role="status"><Info size={16} /><span><b>Nothing has been recorded for you yet.</b> Values appear here after your doctor or nurse records them, or after you upload a report and they confirm what is read from it.</span></div>
          : <><ObsOverview obs={obs} /><ObsTable obs={obs} /></>}

</div>
<Card accent="ink">
          <CardHead title="About you" icon={<BadgeCheck size={16} />} />
          <div className="card__body">
            <p>{p.age} years · {p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : 'Other'}{p.place ? ` · ${p.place}` : ' · place: not provided'}</p>
            <p className="hint">Your identity was verified with a code sent to your mobile on {fmtWhen(p.verifiedAt)}. Registered by {p.registeredBy}.</p>
            <div className="eyebrow" style={{ margin: '8px 0 4px' }}>What you agreed to</div>
            <ul className="advice-s">{p.consentPurposes.map(k => <li key={k}>{CONSENT[k as keyof typeof CONSENT] ?? k}</li>)}
              {!p.consentPurposes.includes('share-abdm') && <li className="muted">Sharing through ABDM: you have not agreed</li>}</ul>
            <p className="hint">You can ask your hospital for a copy of your data, to stop sharing, or to erase your record.</p>
          </div>
        </Card>

        <ConsentInbox />

        </div>

        <h2 className="sect" id="care">Care</h2>
        <div className="cols cols--even">
          <div className="stack" style={{ gap: 18 }}>        <AskRecord patientId={id} />
        <CounsellingCard patientId={id} role="patient" />
</div>
          <div className="stack" style={{ gap: 18 }}>        <CorrectionCard patientId={id} role="patient" choices={obs.map(o => `${o.label} ${o.display} on ${fmtDate(o.date)}`)} />
<NextVisitCard /></div>
        </div>

        <h2 className="sect" id="reports">Reports</h2>
        <div className="cols cols--even">
<Card accent="cerulean">
          <CardHead title="Your reports" icon={<FileUp size={16} />} right={<Button size="sm" onClick={() => setUploading(true)} icon={<FileUp size={14} />}>Upload a report</Button>} />
          <div className="card__body"><p className="hint">Upload a report or prescription. A doctor or nurse checks what is read from it before it counts.</p></div>
        </Card>
        <ReviewCard patientId={id} onUpload={() => setUploading(true)} />


        </div>

        </>) : (<>
        <h2 className="sect" id="sharing">Sharing</h2>
        <div className="cols cols--even">
          <div className="stack" style={{ gap: 18 }}>        <ConsentInbox />
<ScanShareCard /></div>
                  <NetworkLog />

        </div>
        </>)}
      </main>
      {uploading && <UploadDialog patientId={id} onClose={() => setUploading(false)} patient />}
    </div>
  );
}
