import { useEffect, useRef, useState } from 'react';
import { Clock, Hourglass, QrCode, UserPlus, Users } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import type { OpdMine, OpdQueue, OpdVisit } from '@/domain/api';
import { FACILITY, OTHER_FACILITY } from '@/data/demo';
import { hfrFromScan, hospitalName } from './facility';
import { formatAbha, useSession } from '@/session';
import { Button, Card, CardHead, cx } from '@/ui/primitives';
import { useUi } from '@/ui/store';

export const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
const RUSH = { light: 'Light', moderate: 'Moderate', busy: 'Busy' } as const;
const SOURCE = { 'scan-and-share': 'Joined from the patient’s app', desk: 'Added at the desk' } as const;

/** What the waiting time rests on, said plainly. */
export function basisNote(q: Pick<OpdQueue, 'avgMinutes' | 'basis' | 'basedOn'>) {
  if (q.basis === 'measured') return `About ${q.avgMinutes} minutes per patient, measured from the last ${q.basedOn} consultations.`;
  if (q.basis === 'entered') return `${q.avgMinutes} minutes per patient, as entered by staff. It switches to measured times after two consultations are finished.`;
  return 'Waiting time is unavailable: it needs two consultations to be timed first.';
}

function WaitCell({ v }: { v: OpdVisit }) {
  if (v.status !== 'waiting') return null;
  // When no waiting time has been measured the card above says so once; repeating it on every row was noise.
  return v.waitMinutes === null || v.waitMinutes === undefined ? null : <span className="chip chip--outline"><Clock size={12} /> about {v.waitMinutes} min</span>;
}

/** Today's OPD queue for the hospital: appointments, who is being seen, who is waiting, and the likely waiting time. */
export function OpdQueueCard() {
  const toast = useUi(s => s.toast);
  const open = useSession(s => s.openPatient);
  const q = useApi(() => api.opdQueue(), []);
  const [abha, setAbha] = useState('');
  const [busy, setBusy] = useState(false);
  const [mins, setMins] = useState('');
  const data = q.data;
  const nextId = data?.items.find(v => v.status === 'waiting')?.id;
  const tried = useRef(false);
  // A first-time visitor should see a working OPD, not an empty screen. The demo patients are named "(demo)"; the server loads them once.
  useEffect(() => {
    if (!data || tried.current) return;
    tried.current = true;
    if (data.items.length === 0) void api.opdDemoDay().then(() => q.refetch()).catch(() => undefined);
  }, [data, q]);
  const run = async (fn: () => Promise<void>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast(ok); } catch (e) { toast(e instanceof Error ? e.message : 'Could not do that.', 'error'); } finally { setBusy(false); } };

  return (
    <Card accent="sage" className="opd">
      <CardHead title="OPD queue" icon={<Users size={16} />} right={data && <span className={cx('chip', data.rush === 'busy' ? 'chip--terracotta' : 'chip--outline')}>Rush: {RUSH[data.rush]}</span>} />
      <div className="card__body">
        {!data ? <p className="hint">Loading…</p> : (
          <>
            <p className="hint"><Hourglass size={12} style={{ verticalAlign: -2 }} /> {basisNote(data)}</p>
            {data.basis !== 'measured' && (
              <form className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); void run(async () => { await api.opdSetMinutes(Number(mins)); q.refetch(); setMins(''); }, 'The waiting time now uses the minutes you entered.'); }}>
                <label htmlFor="mins" className="hint">Average minutes per consultation</label>
                <input id="mins" className="input" style={{ width: 84 }} type="number" min={2} max={60} inputMode="numeric" value={mins} onChange={e => setMins(e.target.value)} placeholder="2 to 60" />
                <Button size="sm" variant="secondary" type="submit" disabled={busy || !mins}>Set</Button>
              </form>
            )}
            {data.items.length === 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="hint">No one is in the queue yet. Add a patient by ABHA number below, or load the demo day to see a full OPD.</p>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(async () => {
                  const held = (await api.directory({ held: true, limit: 50 })).items.filter(p => p.access === 'held');
                  for (const p of held) await api.opdWalkIn(p.abha);
                  q.refetch();
                }, 'The sample patients are in the queue.')}>Add the sample patients</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(async () => { await api.opdDemoDay(); q.refetch(); }, 'A demo OPD day is loaded: six demo patients with records.')}>Load a demo OPD day</Button>
              </div>
            ) : (
              <div className="tablewrap">
                <table className="table opdtable">
                  <thead><tr><th scope="col">Token</th><th scope="col">Patient</th><th scope="col">Status</th><th scope="col" className="opdtable__act">Actions</th></tr></thead>
                  <tbody>
                    {data.items.map(v => (
                      <tr key={v.id} className={cx(v.status === 'ongoing' && 'is-now')}>
                        <td><b className="num">#{v.token}</b></td>
                        <td><b translate="no">{v.name.replace(/ \(demo\)$/, '')}</b>{/\(demo\)$/.test(v.name) && <span className="chip chip--dashed">Demo</span>}<small className="muted block">{SOURCE[v.source]}</small></td>
                        <td>
                          <span className={cx('chip', v.status === 'ongoing' ? 'chip--sage' : 'chip--outline')}>{v.status === 'ongoing' ? 'With the doctor' : v.status === 'waiting' ? 'Waiting' : v.status === 'done' ? 'Seen' : 'Cancelled'}</span>
                          {v.priority === 'urgent' && <span className="chip chip--high">Urgent</span>}
                          <WaitCell v={v} />
                        </td>
                        <td className="opdtable__act">
                          {v.status === 'waiting' && <Button size="sm" variant={v.id === nextId ? undefined : 'secondary'} disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'call'); q.refetch(); })}>Call in</Button>}
                          {v.status === 'ongoing' && <Button size="sm" disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'done'); q.refetch(); })}>Finish</Button>}
                          {v.held === false
                            ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(async () => { await api.requestConsent(formatAbha(v.abha ?? ''), 'Treatment', 30, { hiTypes: ['OPConsultation', 'Prescription', 'DiagnosticReport'], keepDays: 30 }); }, 'Request sent. The patient must allow it.')}>Ask for access</Button>
                            : <Button size="sm" variant="secondary" onClick={() => open(v.patientId)}>Open record</Button>}
                          {v.status === 'waiting' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'priority'); q.refetch(); })}>{v.priority === 'urgent' ? 'Make routine' : 'Mark urgent'}</Button>}
                          {(v.status === 'waiting' || v.status === 'ongoing') && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.opdAct(v.id, 'cancel'); q.refetch(); })}>Remove</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

/** The patient's side: scan a hospital's QR code (Scan & Share) and see the token and the likely wait. */
export function ScanShareCard() {
  const toast = useUi(s => s.toast);
  const mine = useApi<OpdMine>(() => api.opdMine(), []);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<string | null>(() => hfrFromScan(window.location.href));
  const v = mine.data?.visit;
  const join = async (hfr: string) => {
    setBusy(true);
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
            <p className="hint">Choose the hospital you are visiting. Your profile is shared with that hospital, only with your consent, and you get a token number.</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {[FACILITY, OTHER_FACILITY].map(f => <Button key={f.hfr} size="sm" variant="secondary" disabled={busy} onClick={() => join(f.hfr)}>{busy ? 'Scanning…' : `Join the queue at ${f.name}`}</Button>)}
            </div>
          </>
        ) : (
          <>
            <div className="token"><span className="eyebrow">Your token</span><b className="num">#{v.token}</b></div>
            <p className="hint">{mine.data.hospitalName ?? hospitalName(mine.data.hospital)}</p>
            <p>{v.status === 'ongoing' ? 'It is your turn. Please go in.' : v.waitMinutes === null || v.waitMinutes === undefined
              ? `You are number ${v.position} in the queue. The waiting time is unavailable because it has not been measured yet.`
              : `You are number ${v.position} in the queue. Please come at about ${clock(v.startsAt)}, in about ${v.waitMinutes} minutes.`}</p>
            <p className="hint">The OPD is {mine.data.rush === 'light' ? 'quiet' : mine.data.rush === 'moderate' ? 'moderately busy' : 'busy'} now.{v.held === false ? ' This hospital does not hold your record yet. It can ask you for permission to see it.' : ''}</p>
            <div className="row" style={{ gap: 8 }}><Button size="sm" variant="secondary" onClick={() => mine.refetch()}>Refresh</Button>
              {v.status === 'waiting' && <Button size="sm" variant="ghost" onClick={async () => { await api.opdCancelMine(); mine.refetch(); }}>Leave the queue</Button>}</div>
          </>
        )}
      </div>
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
