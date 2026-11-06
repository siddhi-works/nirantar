import { useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, ClipboardPlus, Download, FileUp, Info, Trash2, X } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { useSession } from '@/session';
import type { RegisteredPatient } from '@/domain/api';
import { Button, Card, CardHead, SkeletonCard, cx } from '@/ui/primitives';
import { Modal } from '@/ui/primitives';
import { useUi } from '@/ui/store';
import { Tabs } from '@/ui/Tabs';
import { LoadError, TopBar } from './Chrome';
import { ObsOverview, ObsTable, fmtWhen, type Obs } from './ReceivedDashboard';
import { RecordDialog } from './RecordResult';
import { ReviewCard } from './Review';
import { CorrectionCard, CounsellingCard, SummaryBlock } from './Care';
import { UploadDialog } from './UploadDocument';

/** A patient registered at this hospital: no follow-up slips yet, so the page is built only from confirmed values. */
export default function RegisteredPatientPage() {
  const close = useSession(s => s.closePatient);
  const role = useSession(s => s.user!.role) as 'doctor' | 'nurse';
  const id = useSession(s => s.openId)!;
  const [tab, setTab] = useState<'values' | 'review' | 'care' | 'rights'>('values');
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const profile = useApi(() => api.getProfile(id), [id]);
  const values = useApi(() => api.listObservations(id), [id]);

  const obs: Obs[] = useMemo(() => (values.data ?? []).filter(o => o.status === 'verified' || o.status === 'corrected').map(o => ({
    code: o.code, label: o.label, date: o.date, value: typeof o.current === 'number' ? o.current : null,
    display: `${o.current ?? ''}${o.unit ? (o.unit === '%' ? '%' : ' ' + o.unit) : ''}`.trim(), note: o.status === 'corrected' ? 'Corrected by staff' : undefined, status: 'final',
  })), [values.data]);

  const p = profile.data;
  if (profile.error && !p) return <LoadError message={profile.error} onRetry={profile.refetch} onBack={close} />;
  if (!p) return <div className="screen"><TopBar /><main className="wrap"><SkeletonCard h={140} /><SkeletonCard h={260} /></main></div>;
  const initials = p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="screen">
      <TopBar right={<Button variant="secondary" size="sm" onClick={close} icon={<ArrowLeft size={14} />}>Exit to dashboard</Button>} />
      <main className="wrap wrap--wide">
        <Card accent="ink" className="phead">
          <div className="phead__row">
            <span className="avatar">{initials}</span>
            <div className="grow">
              <h1 translate="no">{p.name}</h1>
              <div className="phead__meta">
                <span>{p.age} years · {p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : 'Other'}</span>
                {p.place && <span translate="no">{p.place}</span>}
                {p.phone && <span translate="no">+91 {p.phone}</span>}
                <span translate="no">ABHA {p.abha}</span>
              </div>
              <div className="phead__cx">
                <span className="chip chip--sage"><BadgeCheck size={12} /> Identity verified by mobile code · {fmtWhen(p.verifiedAt)}</span>
                <span className={cx('chip', p.abhaSource === 'created' ? 'chip--dashed' : 'chip--outline')}>{p.abhaSource === 'created' ? 'Sample ABHA made by the sandbox' : 'ABHA matched to its profile'}</span>
                <span className={cx('chip', p.consentPurposes.includes('share-abdm') ? 'chip--outline' : 'chip--dashed')}>{p.consentPurposes.includes('share-abdm') ? 'Agreed to share through ABDM' : 'Has not agreed to share through ABDM'}</span>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>Registered {fmtWhen(p.registeredAt)} by <span translate="no">{p.registeredBy}</span> · consent taken {p.consentMode === 'in-person-signed' ? 'in person, on a signed form' : 'in person, said aloud'} · {fmtWhen(p.consentAt)}</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button onClick={() => setUploading(true)} icon={<FileUp size={15} />}>Upload document</Button>
              <Button variant="secondary" onClick={() => setRecording(true)} icon={<ClipboardPlus size={14} />}>Record a result</Button>
            </div>
          </div>
        </Card>

        {obs.length === 0 && (
          <div className="xban" role="status"><Info size={16} /><span><b>This is a new patient, so the record is empty.</b> Record a result, or upload a lab report or prescription. Values read from an upload count after a doctor or nurse confirms them. Charts and tiles appear here as confirmed values arrive.</span></div>
        )}

        <Tabs label="Parts of the record" value={tab} onChange={setTab} tabs={[
          { k: 'values', label: 'Values' }, { k: 'review', label: 'Reports to review' }, { k: 'care', label: 'Summary and care' }, { k: 'rights', label: 'Patient rights' },
        ]} />
        {tab === 'values' && <><ObsOverview obs={obs} /><ObsTable obs={obs} /></>}
        {tab === 'review' && <ReviewCard patientId={id} onUpload={() => setUploading(true)} />}
        {tab === 'care' && <div className="cols cols--even"><SummaryBlock patientId={id} /><div className="stack" style={{ gap: 18 }}><CounsellingCard patientId={id} role={role} /><CorrectionCard patientId={id} role={role} /></div></div>}
        {tab === 'rights' && <RightsCard p={p} onChanged={profile.refetch} onErased={close} />}
        <p className="hint" style={{ textAlign: 'center', margin: '8px 0 24px' }}>Prototype with synthetic data. Only values a person has recorded or confirmed appear above.</p>
      </main>
      {uploading && <UploadDialog patientId={id} onClose={() => setUploading(false)} />}
      {recording && <RecordDialog patientId={id} onClose={() => setRecording(false)} />}
    </div>
  );
}

/** What the patient is entitled to, carried out by staff at their request: a copy of their data, a change to the sharing consent, erasure. */
function RightsCard({ p, onChanged, onErased }: { p: RegisteredPatient; onChanged: () => void; onErased: () => void }) {
  const toast = useUi(s => s.toast);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'' | 'in-person-signed' | 'in-person-verbal'>('');
  const [erasing, setErasing] = useState(false);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const shares = p.consentPurposes.includes('share-abdm');

  const change = async (action: 'grant' | 'withdraw') => {
    setBusy(true);
    try { await api.changeShareConsent(p.id, action, action === 'grant' ? (mode || undefined) : undefined, action === 'withdraw' ? 'Patient asked' : undefined); toast(action === 'grant' ? 'Consent to share recorded' : 'Consent to share withdrawn'); setMode(''); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not save.', 'error'); } finally { setBusy(false); }
  };
  const erase = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.erasePatient(p.id, name, reason); toast('The record was erased'); setErasing(false); onErased(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not erase.'); setBusy(false); }
  };

  return (
    <Card accent="terracotta">
      <CardHead title="The patient’s rights" icon={<BadgeCheck size={16} />} />
      <div className="card__body">
        <p className="hint">The patient can ask at any time for a copy of their data, to stop sharing through ABDM, or to have the record erased. Each is done here and written to the access log.</p>
        <ul className="xlist" style={{ marginTop: 10 }}>
          <li><span className="grow"><b>A copy of their data</b><small>Details, consent history, recorded values and the list of documents, as a file.</small></span>
            <a className="btn btn--secondary btn--sm" href={`/api/patients/${p.id}/export`} download><Download size={14} />Download</a></li>
          <li><span className="grow"><b>Sharing through ABDM</b><small>{shares ? 'The patient has agreed. Withdrawing stops any further pushing.' : 'The patient has not agreed. Nothing is pushed.'}</small></span>
            {shares
              ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => change('withdraw')}>Withdraw consent</Button>
              : <><select className="select" style={{ maxWidth: 190 }} aria-label="How was the consent taken?" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="">How was it taken?</option><option value="in-person-signed">In person, signed form</option><option value="in-person-verbal">In person, said aloud</option></select><Button size="sm" disabled={busy || !mode} onClick={() => change('grant')}>Record consent</Button></>}</li>
          <li><span className="grow"><b>Erase this record</b><small>Removes the patient, their values and their documents for good. Only a note that it was done is kept, with no personal details.</small></span>
            <Button size="sm" variant="secondary" onClick={() => { setErasing(true); setName(''); setReason(''); setErr(''); }} icon={<Trash2 size={14} />}>Erase…</Button></li>
        </ul>
      </div>
      {erasing && (
        <Modal label="Erase this record" onClose={() => setErasing(false)} locked={busy}>
          <form className="modal__form" onSubmit={erase}>
            <div className="spread"><h2 style={{ fontSize: 20 }}>Erase this record</h2><Button type="button" variant="ghost" size="icon" onClick={() => setErasing(false)} aria-label="Close"><X size={18} /></Button></div>
            <p>This removes <b translate="no">{p.name}</b> and everything held about them. It cannot be undone.</p>
            <div className="field"><label htmlFor="en">Type the patient’s full name to confirm</label><input id="en" className="input" autoComplete="off" value={name} onChange={e => { setName(e.target.value); setErr(''); }} /></div>
            <div className="field"><label htmlFor="er">Reason</label><input id="er" className="input" maxLength={200} placeholder="For example: the patient asked for erasure" value={reason} onChange={e => { setReason(e.target.value); setErr(''); }} /></div>
            {err && <div className="error-text" role="alert">{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="button" variant="secondary" onClick={() => setErasing(false)}>Cancel</Button><Button disabled={busy || name.trim().length < 2 || reason.trim().length < 3} icon={<Trash2 size={15} />}>{busy ? 'Erasing…' : 'Erase for good'}</Button></div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
