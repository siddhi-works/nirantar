import { useEffect, useRef, useState } from 'react';
import { Clock, Hourglass, QrCode, UserPlus, Users } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import type { OpdMine, OpdQueue, OpdVisit } from '@/domain/api';
import { FACILITY, OTHER_FACILITY } from '@/data/demo';
import { hfrFromScan, hospitalName } from './HospitalQr';
import { formatAbha, useSession } from '@/session';
import { Button, Card, CardHead, Modal, cx } from '@/ui/primitives';
import { useUi } from '@/ui/store';

export const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
const RUSH = { light: 'Light', moderate: 'Moderate', busy: 'Busy' } as const;
const SOURCE = { 'scan-and-share': 'Joined by QR', desk: 'Added at the desk' } as const;

/** What the waiting time rests on, said plainly. */
export function basisNote(q: Pick<OpdQueue, 'avgMinutes' | 'basis' | 'basedOn'>) {
  if (q.basis === 'measured') return `About ${q.avgMinutes} minutes per patient, measured from the last ${q.basedOn} consultations.`;
  if (q.basis === 'entered') return `${q.avgMinutes} minutes per patient, as entered by staff. It switches to measured times after two consultations are finished.`;
  return 'Waiting time is unavailable: no consultation has been timed yet. Enter how long one takes, or finish two consultations.';
}

function WaitCell({ v }: { v: OpdVisit }) {
  if (v.status !== 'waiting') return null;
  return v.waitMinutes === null || v.waitMinutes === undefined
    ? <span className="chip chip--dashed" title="Needs input">Wait unavailable</span>
    : <span className="chip chip--outline"><Clock size={12} /> {clock(v.startsAt)} · ~{v.waitMinutes} min</span>;
}

/** Today's OPD queue for the hospital: appointments, who is being seen, who is waiting, and the likely waiting time. */
export function OpdQueueCard() {
  const toast = useUi(s => s.toast);
  const open = useSession(s => s.openPatient);
  const q = useApi(() => api.opdQueue(), []);
  const [abha, setAbha] = useState('');
  const [mins, setMins] = useState('');
  const [busy, setBusy] = useState(false);
  const data = q.data;
  const run = async (fn: () => Promise<void>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast(ok); } catch (e) { toast(e instanceof Error ? e.message : 'Could not do that.', 'error'); } finally { setBusy(false); } };

  return (
    <Card accent="sage" className="opd">
      <CardHead title="OPD queue today" icon={<Users size={16} />} right={data && <span className={cx('chip', data.rush === 'busy' ? 'chip--terracotta' : 'chip--outline')}>Rush: {RUSH[data.rush]}</span>} />
      <div className="card__body">
        {!data ? <p className="hint">Loading…</p> : (
          <>
            <p className="hint"><Hourglass size={12} style={{ verticalAlign: -2 }} /> {basisNote(data)}</p>
            {data.basis !== 'measured' && (
              <form className="row" style={{ gap: 8, margin: '8px 0' }} onSubmit={e => { e.preventDefault(); const n = Number(mins); if (n) void run(async () => { await api.opdSetMinutes(n); setMins(''); q.refetch(); }, 'Saved'); }}>
                <input className="input" style={{ maxWidth: 190 }} inputMode="numeric" placeholder="Minutes per patient" aria-label="Minutes one consultation takes" value={mins} onChange={e => setMins(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <Button size="sm" variant="secondary" disabled={busy || !mins}>Save</Button>
              </form>
            )}
            {data.items.length === 0 ? <p className="hint">No patient is in today’s queue yet. A patient joins by scanning the hospital QR in their app, or you can add them below.</p> : (
              <ul className="xlist opd__list">
                {data.items.map(v => (
                  <li key={v.id} className={cx(v.status === 'ongoing' && 'is-now')}>
                    <span className="opd__token num">#{v.token}</span>
                    <span className="grow"><b translate="no">{v.name}</b><small>{SOURCE[v.source]}{v.priority === 'urgent' ? ' · urgent' : ''} · {v.status}</small></span>
                    <WaitCell v={v} />
                    {v.held === false
                      ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.requestConsent(formatAbha(v.abha ?? ''), 'Treatment', 30, { hiTypes: ['OPConsultation', 'Prescription', 'DiagnosticReport'], keepDays: 30 }); }, 'Request sent. The patient must allow it.')}>Request access</Button>
                      : <Button size="sm" variant="ghost" onClick={() => open(v.patientId)}>Open record</Button>}
                    {v.status === 'waiting' && <><Button size="sm" disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'call'); q.refetch(); })}>Call</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'priority'); q.refetch(); })}>{v.priority === 'urgent' ? 'Routine' : 'Urgent'}</Button></>}
                    {v.status === 'ongoing' && <Button size="sm" disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'done'); q.refetch(); })}>Finish</Button>}
                    {(v.status === 'waiting' || v.status === 'ongoing') && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'cancel'); q.refetch(); })}>Cancel</Button>}
                  </li>
                ))}
              </ul>
            )}
            <form className="row" style={{ gap: 8, marginTop: 10 }} onSubmit={e => { e.preventDefault(); void run(async () => { await api.opdWalkIn(abha); setAbha(''); q.refetch(); }, 'Added to the queue'); }}>
              <input className="input grow" inputMode="numeric" placeholder="Add a patient by ABHA number: XX-XXXX-XXXX-XXXX" aria-label="ABHA number of the patient to add" value={abha} onChange={e => setAbha(formatAbha(e.target.value))} />
              <Button disabled={busy || abha.replace(/\D/g, '').length !== 14} icon={<UserPlus size={15} />}>Add to queue</Button>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}

/** Reads a QR code with the phone's camera where the browser can (BarcodeDetector); returns the first facility id it sees. */
function CameraScan({ onFound, onClose }: { onFound: (hfr: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const found = useRef(onFound);
  found.current = onFound;
  const [err, setErr] = useState('');
  useEffect(() => {
    let stop = false; let stream: MediaStream | null = null; let timer = 0;
    (async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (!Detector) { setErr('This browser cannot read QR codes from the camera. Open the QR link with your phone camera app instead.'); return; }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stop || !video.current) return;
        video.current.srcObject = stream; await video.current.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stop || !video.current) return;
          try { for (const code of await detector.detect(video.current)) { const h = hfrFromScan(code.rawValue); if (h) { found.current(h); return; } } } catch { /* try again on the next frame */ }
          timer = window.setTimeout(tick, 350);
        };
        void tick();
      } catch { setErr('The camera could not be opened. Allow camera access, or use the demo buttons.'); }
    })();
    return () => { stop = true; window.clearTimeout(timer); stream?.getTracks().forEach(tr => tr.stop()); };
  }, []);
  return (
    <Modal label="Scan the hospital QR" onClose={onClose}>
      <div className="modal__form">
        <h2 style={{ fontSize: 20 }}>Scan the hospital QR</h2>
        {err ? <p className="error-text" role="alert">{err}</p> : <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

/** The patient's side: scan a hospital's QR code (Scan & Share) and see the token and the likely wait. */
export function ScanShareCard() {
  const toast = useUi(s => s.toast);
  const mine = useApi<OpdMine>(() => api.opdMine(), []);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [opened, setOpened] = useState<string | null>(() => hfrFromScan(window.location.href));
  const v = mine.data?.visit;
  const join = async (hfr: string) => {
    setBusy(true); setCamera(false);
    try { await api.opdScan(hfr); setOpened(null); window.history.replaceState({}, '', window.location.pathname); mine.refetch(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not join the queue.', 'error'); } finally { setBusy(false); }
  };
  const active = v && (v.status === 'waiting' || v.status === 'ongoing');
  return (
    <section className="card" data-accent="terracotta">
      <div className="card__head"><h2 className="card__title"><QrCode size={16} />Your OPD visit</h2></div>
      <div className="card__body">
        {!mine.data ? <p className="hint">Loading…</p> : !active ? (
          <>
            {v && <p className="hint">Your last visit today is {v.status}.</p>}
            {opened && <div className="xban" role="status"><QrCode size={16} /><span><b>You opened the QR of {hospitalName(opened)}.</b> Share your profile to get a token. <Button size="sm" disabled={busy} onClick={() => join(opened)}>Share my profile</Button></span></div>}
            <p className="hint">At the hospital, scan the QR code at the desk. Your profile is shared with the hospital, only with your consent, and you get a token number.</p>
            <div className="qrbox"><QrCode size={40} />
              <div><b>Scan a hospital QR</b><small>With your camera, or try a demo QR below.</small></div>
              <Button onClick={() => setCamera(true)} disabled={busy} icon={<QrCode size={15} />}>Scan with the camera</Button></div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {[FACILITY, OTHER_FACILITY].map(f => <Button key={f.hfr} size="sm" variant="secondary" disabled={busy} onClick={() => join(f.hfr)}>{busy ? 'Scanning…' : `Demo: scan the QR of ${f.name}`}</Button>)}
            </div>
          </>
        ) : (
          <>
            <div className="token"><span className="eyebrow">Your token</span><b className="num">#{v.token}</b></div>
            <p className="hint">{mine.data.hospitalName ?? hospitalName(mine.data.hospital)}</p>
            <p>{v.status === 'ongoing' ? 'It is your turn. Please go in.' : v.waitMinutes === null || v.waitMinutes === undefined
              ? `You are number ${v.position} in the queue. The waiting time is unavailable because the hospital has not entered or measured it yet.`
              : `You are number ${v.position} in the queue. Please come at about ${clock(v.startsAt)}, in about ${v.waitMinutes} minutes.`}</p>
            <p className="hint">The OPD is {mine.data.rush === 'light' ? 'quiet' : mine.data.rush === 'moderate' ? 'moderately busy' : 'busy'} now.{v.held === false ? ' This hospital does not hold your record yet. It can ask you for permission to see it.' : ''}</p>
            <div className="row" style={{ gap: 8 }}><Button size="sm" variant="secondary" onClick={() => mine.refetch()}>Refresh</Button>
              {v.status === 'waiting' && <Button size="sm" variant="ghost" onClick={async () => { await api.opdCancelMine(); mine.refetch(); }}>Leave the queue</Button>}</div>
          </>
        )}
      </div>
      {camera && <CameraScan onFound={join} onClose={() => setCamera(false)} />}
    </section>
  );
}

/** What needs a person's attention now, read from the real data. When nothing does, it says so. */
export function AttentionCard() {
  const open = useSession(s => s.openPatient);
  const { data } = useApi(() => api.attention(), []);
  return (
    <section className="card" data-accent="terracotta">
      <div className="card__head"><h2 className="card__title">Needs your attention</h2></div>
      <div className="card__body">
        {!data ? <p className="hint">Loading…</p> : data.length === 0 ? <p className="hint">Nothing needs attention right now.</p> : (
          <ul className="xlist">
            {data.map((a, i) => (
              <li key={i}><span className="grow"><b>{a.title}</b>{a.name && <small translate="no">{a.name}</small>}</span>
                {a.patientId && <Button size="sm" variant="secondary" onClick={() => open(a.patientId!)}>Open record</Button>}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
