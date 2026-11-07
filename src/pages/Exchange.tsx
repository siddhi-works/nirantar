import { useEffect, useState } from 'react';
import { Building2, Inbox, Loader2, Send, ShieldCheck } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import type { ExchangeConsent } from '@/domain/exchange';
import { fmtDate } from '@/domain/format';
import { formatAbha, useSession } from '@/session';
import { STATUS } from './exchange-status';
import { ReceivedPage } from './ReceivedDashboard';
import { Button, Card, CardHead, cx } from '@/ui/primitives';
import { useUi } from '@/ui/store';
import { useT } from '@/i18n';


/** One request, with what the patient may change before answering: the kinds of record, how long access lasts, and the erase date. */
function ConsentRequestCard({ c, run }: { c: ExchangeConsent; run: (fn: () => Promise<void>, ok: string) => Promise<void> }) {
  const t = useT();
  const [types, setTypes] = useState<string[]>(c.hiTypes.length ? c.hiTypes : Object.keys(KIND_LABEL));
  const [validity, setValidity] = useState(c.validityDays);
  const [keep, setKeep] = useState(c.keepDays ?? c.validityDays);
  const choices = (max: number) => [1, 7, 30, 90, 365].filter(d => d <= max);
  const asked = c.hiTypes.length ? c.hiTypes : Object.keys(KIND_LABEL);
  return (
    <div className="xc">
      {t('{hospital} wants to see your diabetes record.', { hospital: c.hiuName })}
      <small>{t('Purpose: {purpose} · access for {days} days · asked {date}', { purpose: t(c.purpose), days: c.validityDays, date: fmtDate(c.requestedAt) })}</small>
      <small>Asked by {c.requesterName || 'a doctor'} · purpose code {c.purposeCode}{c.dateFrom ? ` · records from ${fmtDate(c.dateFrom)}` : ''}</small>
      <fieldset className="rconsent" style={{ marginTop: 8 }}>
        <legend>You choose what to allow</legend>
        {asked.map(k => <label key={k} className="check"><input type="checkbox" checked={types.includes(k)} onChange={e => setTypes(e.target.checked ? [...types, k] : types.filter(x => x !== k))} /> {KIND_LABEL[k]}</label>)}
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="field"><label htmlFor={`v${c.id}`}>Access lasts</label><select id={`v${c.id}`} className="select" value={validity} onChange={e => setValidity(Number(e.target.value))}>{choices(c.validityDays).map(d => <option key={d} value={d}>{d} days</option>)}</select></div>
          <div className="field"><label htmlFor={`k${c.id}`}>They must erase their copy after</label><select id={`k${c.id}`} className="select" value={keep} onChange={e => setKeep(Number(e.target.value))}>{choices(c.keepDays ?? c.validityDays).map(d => <option key={d} value={d}>{d} days</option>)}</select></div>
        </div>
      </fieldset>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <Button size="sm" disabled={!types.length} onClick={() => run(() => api.decideConsent(c.id, 'grant', { hiTypes: types, validityDays: validity, keepDays: keep }), 'Allowed. They can fetch your record now.')}>{t('Allow access')}</Button>
        <Button size="sm" variant="secondary" onClick={() => run(() => api.decideConsent(c.id, 'deny'), 'Request declined')}>{t('Say no')}</Button>
      </div>
    </div>
  );
}

/** What the patient sees: who is asking to see their record, and the answer. */
const KIND_LABEL: Record<string, string> = { OPConsultation: 'Consultation notes', Prescription: 'Prescriptions', DiagnosticReport: 'Test results' };

export function ConsentInbox() {
  const toast = useUi(s => s.toast);
  const t = useT();
  const { data } = useApi(() => api.listConsents(), []);
  const list = data ?? [];
  const run = async (fn: () => Promise<void>, ok: string) => { try { await fn(); toast(ok); } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.', 'error'); } };
  const open = list.filter(c => c.status === 'requested');
  const rest = list.filter(c => c.status !== 'requested');
  return (
    <section className="card" data-accent="cerulean">
      <div className="card__head"><h2 className="card__title"><Inbox size={16} />{t('Who can see your record')}</h2>{open.length > 0 && <span className="chip chip--cerulean">{t('{n} waiting', { n: open.length })}</span>}</div>
      <div className="card__body">
        {list.length === 0 && <p className="hint">{t('No hospital has asked to see your record. When one does, you decide here.')}</p>}
        {open.map(c => <ConsentRequestCard key={c.id} c={c} run={run} />)}
        {rest.length > 0 && (
          <ul className="xlist">
            {rest.map(c => (
              <li key={c.id}>
                <span className="grow"><b>{c.hiuName}</b><small>{t(c.purpose)}{c.expiresAt ? ` · until ${fmtDate(c.expiresAt)}` : ''}{c.fetched ? ' · record received' : ''}</small></span>
                <span className={cx('chip', STATUS[c.status].tone)}>{t(STATUS[c.status].label)}</span>
                {c.status === 'granted' && <Button size="sm" variant="ghost" onClick={() => run(() => api.revokeConsent(c.id), 'Permission withdrawn')}>{t('Withdraw')}</Button>}
              </li>
            ))}
          </ul>
        )}
        <p className="hint" style={{ marginTop: 10 }}><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> {t('Withdrawing stops new transfers and the hospital must erase the copy it already received.')}</p>
      </div>
    </section>
  );
}

/** For a doctor or nurse: ask another hospital's patient for consent, then fetch the record once they agree. */
export function OtherHospitals() {
  const toast = useUi(s => s.toast);
  const [abha, setAbha] = useState('');
  const [purpose, setPurpose] = useState('Treatment');
  const [days, setDays] = useState(30);
  const [kinds, setKinds] = useState<string[]>(['OPConsultation', 'Prescription', 'DiagnosticReport']);
  const [from, setFrom] = useState('');
  const [keep, setKeep] = useState(30);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const { data } = useApi(() => api.listRequests(), []);
  const list = data ?? [];

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('ask');
    try { await api.requestConsent(abha, purpose, days, { hiTypes: kinds, from: from || undefined, keepDays: keep }); setSent(true); setAbha(''); } catch (e2) { toast(e2 instanceof Error ? e2.message : 'Could not send the request.', 'error'); } finally { setBusy(null); }
  };
  const fetchIt = async (c: ExchangeConsent) => {
    setBusy(c.id);
    try { const id = await api.fetchRecord(c.id); toast('Record received'); setView(id); } catch (e) { toast(e instanceof Error ? e.message : 'The record could not be fetched.', 'error'); } finally { setBusy(null); }
  };

  return (
    <Card accent="terracotta">
      <CardHead title="Records from other hospitals" icon={<Building2 size={16} />} />
      <div className="card__body">
        <p className="hint" style={{ marginBottom: 10 }}>If a patient's record is held at another hospital, ask the patient for permission. You see it only after they agree.</p>
        <form className="xform" onSubmit={ask}>
          <div className="field"><label htmlFor="xa">ABHA number</label><input id="xa" className="input" inputMode="numeric" placeholder="XX-XXXX-XXXX-XXXX" value={abha} onChange={e => { setAbha(formatAbha(e.target.value)); setSent(false); }} /></div>
          <div className="field"><label htmlFor="xp">Purpose</label><select id="xp" className="select" value={purpose} onChange={e => setPurpose(e.target.value)}><option>Treatment</option><option>Follow-up care</option><option>Second opinion</option></select></div>
          <div className="field"><label htmlFor="xd">Access for</label><select id="xd" className="select" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map(d => <option key={d} value={d}>{d} days</option>)}</select></div>
          <Button icon={busy === 'ask' ? <Loader2 size={15} className="spin" /> : <Send size={15} />} disabled={busy === 'ask' || abha.replace(/\D/g, '').length !== 14 || !kinds.length}>Ask for consent</Button>
          <fieldset className="rconsent xfull">
            <legend>What you are asking for</legend>
            {(['OPConsultation', 'Prescription', 'DiagnosticReport'] as const).map(k => (
              <label key={k} className="check"><input type="checkbox" checked={kinds.includes(k)} onChange={e => setKinds(e.target.checked ? [...kinds, k] : kinds.filter(x => x !== k))} /> {KIND_LABEL[k]}</label>
            ))}
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div className="field"><label htmlFor="xf">Records from (optional)</label><input id="xf" className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div className="field"><label htmlFor="xk">I will keep my copy for</label><select id="xk" className="select" value={keep} onChange={e => setKeep(Number(e.target.value))}>{[7, 30, 90, 365].map(d => <option key={d} value={d}>{d} days</option>)}</select></div>
            </div>
            <span className="hint">Purpose code CAREMGT (care management). The patient may allow less. You must erase your copy by the date shown, or when they withdraw.</span>
          </fieldset>
        </form>
        {sent && <p className="hint" role="status" style={{ marginTop: 8 }}>Request sent. If this ABHA number belongs to a patient, they will see it and can answer.</p>}
        {list.length > 0 && (
          <ul className="xlist" style={{ marginTop: 14 }}>
            {list.map(c => (
              <li key={c.id}>
                <span className="grow"><b className="num">ABHA {c.abha}</b><small>{c.purpose} · asked {fmtDate(c.requestedAt)}{c.expiresAt ? ` · until ${fmtDate(c.expiresAt)}` : ''}</small></span>
                <span className={cx('chip', STATUS[c.status].tone)}>{STATUS[c.status].label}</span>
                {c.receivedId && <Button size="sm" variant="secondary" onClick={() => setView(c.receivedId)}>Open record</Button>}
                {c.status === 'granted' && <Button size="sm" onClick={() => fetchIt(c)} disabled={busy === c.id} icon={busy === c.id ? <Loader2 size={14} className="spin" /> : undefined}>{c.receivedId ? 'Get again' : 'Get record'}</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {view && <ReceivedPage id={view} onClose={() => setView(null)} />}
    </Card>
  );
}

/**
 * Every patient known in this space, at either hospital, and what this hospital can do with each: open the record it holds,
 * ask for access, wait for the patient to answer, or fetch a copy once they have allowed it. A record is kept only at the
 * hospital that registered the patient; another hospital gets a read-only copy only through the patient's consent.
 */
export function PatientDirectory() {
  const toast = useUi(s => s.toast);
  const open = useSession(s => s.openPatient);
  const [find, setFind] = useState('');
  const [typed, setTyped] = useState('');
  const [offset, setOffset] = useState(0);
  const PAGE = 4;
  useEffect(() => { const id = setTimeout(() => { setFind(typed.trim()); setOffset(0); }, 300); return () => clearTimeout(id); }, [typed]);
  const { data: page, refetch } = useApi(() => api.directory({ q: find, limit: PAGE, offset }), [find, offset]);
  const data = page?.items;
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>, ok: string) => { setBusy(key); try { await fn(); toast(ok); refetch(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not do that.', 'error'); } finally { setBusy(null); } };
  const list = data ?? [];
  return (
    <Card accent="cerulean">
      <CardHead title="Patients" icon={<Building2 size={16} />} />
      <div className="card__body">
        <p className="hint">Records stay at the hospital that registered the patient. For a patient held elsewhere, ask for access: the patient must allow it first.</p>
        <div className="field" style={{ margin: '10px 0' }}>
          <label htmlFor="dirq">Find a patient</label>
          <input id="dirq" className="input" type="search" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Name, or the first digits of the ABHA number" />
        </div>
        {!page ? <p className="hint">Loading…</p> : list.length === 0 ? <p className="hint">No patient matches “{find}”.</p> : (
          <div className="tablewrap">
            <table className="table">
              <thead><tr><th scope="col">Patient</th><th scope="col">ABHA number</th><th scope="col">Record held at</th><th scope="col" className="opdtable__act">Access</th></tr></thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.patientId}>
                    <td><b translate="no">{p.name.replace(/ \(demo\)$/, '')}</b>{/\(demo\)$/.test(p.name) && <span className="chip chip--dashed">Demo</span>}</td>
                    <td><code translate="no">{p.abha}</code></td>
                    <td><span translate="no">{p.holderName}</span></td>
                    <td className="opdtable__act">
                      {p.access === 'held' && <Button size="sm" variant="secondary" onClick={() => open(p.patientId)}>Open record</Button>}
                      {(p.access === 'none' || p.access === 'denied' || p.access === 'revoked' || p.access === 'expired') && <>
                        {p.access !== 'none' && <span className="chip chip--dashed">{STATUS[p.access].label}</span>}
                        <Button size="sm" disabled={busy === p.patientId} onClick={() => run(p.patientId, () => api.requestConsent(p.abha, 'Treatment', 30, { hiTypes: ['OPConsultation', 'Prescription', 'DiagnosticReport'], keepDays: 30 }), 'Request sent. The patient must allow it.')}>Ask for access</Button></>}
                      {p.access === 'requested' && <span className={cx('chip', STATUS.requested.tone)}>{STATUS.requested.label}</span>}
                      {p.access === 'granted' && <>
                        <span className={cx('chip', STATUS.granted.tone)}>Allowed</span>
                        {p.receivedId && <Button size="sm" variant="secondary" onClick={() => setView(p.receivedId)}>Open copy</Button>}
                        <Button size="sm" disabled={busy === p.patientId} onClick={() => run(p.patientId, async () => { const id = await api.fetchRecord(p.consentId!); setView(id); }, 'Record received')}>{p.receivedId ? 'Get again' : 'Get record'}</Button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page && page.total > PAGE && (
          <nav className="row" style={{ justifyContent: 'space-between', marginTop: 10 }} aria-label="Pages of patients">
            <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
            <small className="muted">{offset + 1}–{Math.min(offset + PAGE, page.total)} of {page.total}</small>
            <Button size="sm" variant="secondary" disabled={offset + PAGE >= page.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
          </nav>
        )}
      </div>
      {view && <ReceivedPage id={view} onClose={() => setView(null)} />}
    </Card>
  );
}
