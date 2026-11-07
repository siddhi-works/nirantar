import { useState } from 'react';
import { GraduationCap, HandHeart, HeartHandshake, MessageSquareWarning, Sparkles } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { Button, Card, CardHead, cx } from '@/ui/primitives';
import { useUi } from '@/ui/store';
import { ReadAloud } from '@/i18n/controls';
import type { EditRequest } from '@/domain/api';
import { ASHA_REASONS } from '@/domain/asha';
import { ScopeNote } from '@/ui/ScopeNote';

/** A short summary in sentences, written from the record and from nothing else. */
export function SummaryBlock({ patientId }: { patientId: string }) {
  const { data, error } = useApi(() => api.getSummary(patientId), [patientId]);
  return (
    <Card accent="cerulean">
      <CardHead title="Summary" icon={<Sparkles size={16} />} right={data && !data.complete ? <span className="chip chip--dashed">Needs input</span> : undefined} />
      <div className="card__body">
        {error ? <p className="error-text" role="alert">The summary is unavailable: {error}</p> : !data ? <p className="hint">Writing the summary…</p> : (
          <>
            <p className="summary">{data.text}</p>
            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <ReadAloud sentences={[data.text]} />
              <span className="hint">{data.words} words, written automatically from what is on the record. A draft for the clinician to review.</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Lifestyle advice as the doctor wrote it, each with a plain explanation. Where nothing is written the card says so and who has
 * to supply it. A nurse or doctor can mark which topics the patient has been counselled on.
 */
export function CounsellingCard({ patientId, role }: { patientId: string; role: 'doctor' | 'nurse' | 'patient' }) {
  const toast = useUi(s => s.toast);
  const { data, refetch } = useApi(() => api.getCounselling(patientId), [patientId]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, ok: string) => { setBusy(true); try { await fn(); toast(ok); refetch(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.', 'error'); } finally { setBusy(false); } };
  const lastFor = (topic: string) => data?.education.find(e => e.topic === topic);

  return (
    <Card accent="sage">
      <CardHead title={role === 'patient' ? 'Your lifestyle advice' : 'Lifestyle advice and patient education'} icon={<HeartHandshake size={16} />} />
      <div className="card__body">
        {!data ? <p className="hint">Loading…</p> : (
          <>
            {data.unavailable ? <p className="hint"><span className="chip chip--dashed">Needs input</span> {data.unavailable}</p> : (
              <ul className="advice-list">
                {data.advice.map((a, i) => (
                  <li key={i}><b>{a.text.replace(/[.;]+$/, '')}</b><small>{a.source === 'slip' ? 'Written on the latest slip' : 'Added by'} · {a.by}{a.source === 'doctor' ? ` · ${fmtDate(a.at)}` : ''}</small>
                    {a.topics.map(id => { const t = data.topics.find(x => x.id === id)!; return <details key={id} className="advice-more"><summary>{t.title}</summary><ul>{t.steps.map(s => <li key={s}>{s}</li>)}</ul></details>; })}
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">General explanations of the advice above. They add no new instruction. Ask your doctor or nurse about anything else.</p>
            {role === 'doctor' && (
              <form className="row" style={{ gap: 8, marginTop: 8 }} onSubmit={e => { e.preventDefault(); void run(async () => { await api.addAdvice(patientId, text); setText(''); }, 'Advice added'); }}>
                <input className="input grow" maxLength={200} placeholder="Add lifestyle advice for this patient" aria-label="Add lifestyle advice" value={text} onChange={e => setText(e.target.value)} />
                <Button size="sm" disabled={busy || text.trim().length < 3}>Add advice</Button>
              </form>
            )}
            {role !== 'patient' && (
              <>
                <div className="eyebrow" style={{ margin: '14px 0 6px' }}><GraduationCap size={12} style={{ verticalAlign: -2 }} /> Patient education: what has been explained</div>
                <ul className="xlist">
                  {data.topics.map(t => { const l = lastFor(t.id); return (
                    <li key={t.id}><span className="grow"><b>{t.title}</b><small>{l ? `Explained by ${l.by} on ${fmtDate(l.at)}` : 'Not recorded yet'}</small></span>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => api.recordEducation(patientId, t.id), 'Recorded')}>{l ? 'Explained again' : 'Mark as explained'}</Button></li>
                  ); })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/** Patients ask for a correction; staff look at the original and answer. Nobody edits a patient's record for them. */
export function CorrectionCard({ patientId, role, choices }: { patientId: string; role: 'doctor' | 'nurse' | 'patient'; choices?: string[] }) {
  const toast = useUi(s => s.toast);
  const { data, refetch } = useApi(() => api.listEdits(patientId), [patientId]);
  const [f, setF] = useState({ subject: '', proposed: '', reason: '' });
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, ok: string) => { setBusy(true); try { await fn(); toast(ok); refetch(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.', 'error'); } finally { setBusy(false); } };
  const list: EditRequest[] = data ?? [];
  const shown = role === 'patient' ? list : list.filter(x => x.status === 'pending' || true);

  return (
    <Card accent="terracotta">
      <CardHead title={role === 'patient' ? 'Ask for a correction' : 'Correction requests'} icon={<MessageSquareWarning size={16} />} />
      <div className="card__body">
        {role === 'patient' && (
          <>
            <p className="hint">Your record is kept by the hospital, and you cannot edit it yourself. If something is wrong, tell us. Staff will look at the original paper or report and answer you here.</p>
            <form className="stack" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); void run(async () => { await api.raiseEdit(patientId, f); setF({ subject: '', proposed: '', reason: '' }); }, 'Your request was sent'); }}>
              <div className="field"><label htmlFor="cs">What is wrong?</label>
                {choices?.length ? <select id="cs" className="select" value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })}><option value="">Choose…</option>{choices.map(c => <option key={c}>{c}</option>)}</select>
                  : <input id="cs" className="input" maxLength={200} value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} />}</div>
              <div className="row" style={{ gap: 8 }}>
                <div className="field grow"><label htmlFor="cp">What should it be?</label><input id="cp" className="input" maxLength={100} value={f.proposed} onChange={e => setF({ ...f, proposed: e.target.value })} /></div>
              </div>
              <div className="field"><label htmlFor="cr">Why do you think so?</label><input id="cr" className="input" maxLength={300} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></div>
              <div><Button disabled={busy || f.subject.length < 3 || !f.proposed.trim() || f.reason.trim().length < 5}>Send request</Button></div>
            </form>
          </>
        )}
        {shown.length === 0 ? <p className="hint" style={{ marginTop: role === 'patient' ? 10 : 0 }}>{role === 'patient' ? 'You have not asked for any correction.' : 'No correction has been requested for this patient.'}</p> : (
          <ul className="xlist" style={{ marginTop: 10 }}>
            {shown.map(x => (
              <li key={x.id} style={{ alignItems: 'flex-start' }}>
                <span className="grow"><b>{x.subject}</b><small>Should be: {x.proposed} · “{x.reason}” · {fmtDate(x.at)}</small>
                  {x.status !== 'pending' && <small>{x.status === 'accepted' ? 'Accepted' : 'Not changed'} by {x.decidedBy}: {x.decisionNote}</small>}
                  {role !== 'patient' && x.status === 'pending' && (
                    <span className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <input className="input" style={{ maxWidth: 260 }} placeholder="Your reason (after checking the original)" aria-label="Reason for the decision" value={note[x.id] ?? ''} onChange={e => setNote({ ...note, [x.id]: e.target.value })} />
                      <Button size="sm" disabled={busy || (note[x.id] ?? '').trim().length < 3} onClick={() => run(() => api.decideEdit(x.id, 'accepted', note[x.id]), 'Recorded')}>Accept</Button>
                      <Button size="sm" variant="secondary" disabled={busy || (note[x.id] ?? '').trim().length < 3} onClick={() => run(() => api.decideEdit(x.id, 'rejected', note[x.id]), 'Recorded')}>Do not change</Button>
                    </span>
                  )}</span>
                <span className={cx('chip', x.status === 'pending' ? 'chip--cerulean' : x.status === 'accepted' ? 'chip--sage' : 'chip--dashed')}>{x.status === 'pending' ? 'Waiting' : x.status === 'accepted' ? 'Accepted' : 'Not changed'}</span>
              </li>
            ))}
          </ul>
        )}
        {role !== 'patient' && list.some(x => x.status === 'pending') && <p className="hint">If you accept, make the change yourself with “Correct value” on the original slip. The original stays on record. Then record your decision here so the patient can read it.</p>}
      </div>
    </Card>
  );
}

const WORKER = { asha: 'ASHA worker', usha: 'USHA worker' } as const;

/** Send the patient to the community health worker for follow-up at home. The patient sees the same list. */
export function AshaCard({ patientId, role }: { patientId: string; role: 'doctor' | 'nurse' | 'patient' }) {
  const toast = useUi(s => s.toast);
  const { data, refetch } = useApi(() => api.listAsha(patientId), [patientId]);
  const [worker, setWorker] = useState<'asha' | 'usha'>('asha');
  const [reason, setReason] = useState<string>(ASHA_REASONS[0].id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.referToAsha(patientId, { worker, reason, note: note.trim() || undefined }); setNote(''); toast(`Sent to the ${WORKER[worker]}`); refetch(); }
    catch (err) { toast(err instanceof Error ? err.message : 'Could not send.', 'error'); } finally { setBusy(false); }
  };
  const label = (id: string) => ASHA_REASONS.find(x => x.id === id)?.label ?? id;
  return (
    <Card accent="sage">
      <CardHead title="ASHA / USHA worker follow-up" icon={<HandHeart size={16} />} />
      <div className="card__body">
        {role !== 'patient' && (
          <form className="stack" style={{ gap: 10 }} onSubmit={send}>
            <p className="hint">Send the patient to the community health worker (ASHA in villages, USHA in cities) for follow-up at home.</p>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div className="field"><label htmlFor="aw">Worker</label><select id="aw" className="select" value={worker} onChange={e => setWorker(e.target.value as 'asha' | 'usha')}><option value="asha">ASHA worker (village)</option><option value="usha">USHA worker (city)</option></select></div>
              <div className="field grow"><label htmlFor="ar">Reason</label><select id="ar" className="select" value={reason} onChange={e => setReason(e.target.value)}>{ASHA_REASONS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
            </div>
            <div className="field"><label htmlFor="an">A short note (optional)</label><input id="an" className="input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></div>
            <div><Button disabled={busy}>Send to the worker</Button></div>
          </form>
        )}
        {(data ?? []).length === 0 ? <p className="hint" style={{ marginTop: 8 }}>{role === 'patient' ? 'No follow-up has been arranged yet.' : 'Nothing sent yet.'}</p> : (
          <ul className="xlist" style={{ marginTop: 10 }}>{(data ?? []).map(x => <li key={x.id}><span className="grow"><b>{WORKER[x.worker]}</b>: {label(x.reason)}<small>{x.note ? `${x.note} · ` : ''}by {x.by} · {fmtDate(x.at)}</small></span></li>)}</ul>
        )}
        <ScopeNote kind="future">The worker is not notified by any system yet. This records the referral so it can be handed over, and it will connect to the ASHA app later.</ScopeNote>
      </div>
    </Card>
  );
}
