import { useState } from 'react';
import { Building2, FileJson, Inbox, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import type { ExchangeConsent, ReceivedRecordView } from '@/domain/exchange';
import { fmtDate } from '@/domain/format';
import { formatAbha } from '@/session';
import { Button, Card, CardHead, Modal, cx } from '@/ui/primitives';
import { useUi } from '@/ui/store';
import { useT } from '@/i18n';

const STATUS: Record<ExchangeConsent['status'], { label: string; tone: string }> = {
  requested: { label: 'Waiting for the patient', tone: 'chip--cerulean' },
  granted: { label: 'Allowed', tone: 'chip--sage' },
  denied: { label: 'Declined', tone: 'chip--dashed' },
  revoked: { label: 'Withdrawn', tone: 'chip--dashed' },
  expired: { label: 'Expired', tone: 'chip--dashed' },
};

/** What the patient sees: who is asking to see their record, and the answer. */
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
        {open.map(c => (
          <div key={c.id} className="xc">
            {t('{hospital} wants to see your diabetes record.', { hospital: c.hiuName })}
            <small>{t('Purpose: {purpose} · access for {days} days · asked {date}', { purpose: t(c.purpose), days: c.validityDays, date: fmtDate(c.requestedAt) })}</small>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <Button size="sm" onClick={() => run(() => api.decideConsent(c.id, 'grant'), 'Allowed. They can fetch your record now.')}>{t('Allow')}</Button>
              <Button size="sm" variant="secondary" onClick={() => run(() => api.decideConsent(c.id, 'deny'), 'Declined')}>{t('Decline')}</Button>
            </div>
          </div>
        ))}
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
        <p className="hint" style={{ marginTop: 10 }}><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> {t('Withdrawing stops new transfers. A copy already received stays with that hospital until its permission ends.')}</p>
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
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const { data } = useApi(() => api.listRequests(), []);
  const list = data ?? [];

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('ask');
    try { await api.requestConsent(abha, purpose, days); setSent(true); setAbha(''); } catch (e2) { toast(e2 instanceof Error ? e2.message : 'Could not send the request.', 'error'); } finally { setBusy(null); }
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
          <Button icon={busy === 'ask' ? <Loader2 size={15} className="spin" /> : <Send size={15} />} disabled={busy === 'ask' || abha.replace(/\D/g, '').length !== 14}>Ask for consent</Button>
        </form>
        {sent && <p className="hint" role="status" style={{ marginTop: 8 }}>Request sent. If this ABHA number belongs to a patient, they will see it and can answer.</p>}
        {list.length > 0 && (
          <ul className="xlist" style={{ marginTop: 14 }}>
            {list.map(c => (
              <li key={c.id}>
                <span className="grow"><b className="num">ABHA {c.abha}</b><small>{c.purpose} · asked {fmtDate(c.requestedAt)}{c.expiresAt ? ` · until ${fmtDate(c.expiresAt)}` : ''}</small></span>
                <span className={cx('chip', STATUS[c.status].tone)}>{STATUS[c.status].label}</span>
                {c.receivedId && <Button size="sm" variant="secondary" onClick={() => setView(c.receivedId)}>Open record</Button>}
                {c.status === 'granted' && <Button size="sm" onClick={() => fetchIt(c)} disabled={busy === c.id} icon={busy === c.id ? <Loader2 size={14} className="spin" /> : undefined}>{c.receivedId ? 'Fetch again' : 'Fetch record'}</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {view && <ReceivedDialog id={view} onClose={() => setView(null)} />}
    </Card>
  );
}

type Res = Record<string, any> & { resourceType: string };
const text = (r: Res) => (r.code?.text ?? r.medicationCodeableConcept?.text ?? '') as string;
const shownValue = (r: Res) => (r.valueQuantity ? `${r.valueQuantity.value} ${r.valueQuantity.unit}`.trim() : r.valueString ?? '');

function ReceivedBody({ v }: { v: ReceivedRecordView }) {
  const toast = useUi(s => s.toast);
  const [note, setNote] = useState('');
  const [json, setJson] = useState(false);
  const res = v.bundle.entry.map(e => e.resource as Res);
  const of = (t: string) => res.filter(r => r.resourceType === t);
  const patient = of('Patient')[0];
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.annotate(v.id, note); setNote(''); toast('Note added'); } catch (e2) { toast(e2 instanceof Error ? e2.message : 'Could not save the note.', 'error'); }
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="xban"><ShieldCheck size={16} /><span><b>Received from {v.fromName}</b> on {fmtDate(v.receivedAt)}. Read-only: you can add a note beside it, but not change it.{v.consentStatus !== 'granted' && <> The patient's permission is now <b>{STATUS[v.consentStatus].label.toLowerCase()}</b>, so no new copy can be fetched.</>}</span></div>
      <div><b style={{ fontSize: 17 }}>{patient?.name?.[0]?.text}</b><small className="muted" style={{ display: 'block' }}>ABHA {patient?.identifier?.[0]?.value}</small></div>
      {of('Condition').map((c, i) => <div key={i}><span className="eyebrow">Condition</span><div>{text(c)}</div></div>)}
      {of('MedicationStatement').length > 0 && <div><span className="eyebrow">Medicines</span><ul className="advice-s">{of('MedicationStatement').map((m, i) => <li key={i}>{text(m)}{m.dosage?.[0]?.text ? `, ${m.dosage[0].text}` : ''}</li>)}</ul></div>}
      <div>
        <span className="eyebrow">Results and examinations</span>
        <div style={{ overflowX: 'auto' }}>
          <table className="table"><thead><tr><th>Date</th><th>Measure</th><th>Value</th><th>Status</th></tr></thead>
            <tbody>{of('Observation').sort((a, b) => String(b.effectiveDateTime).localeCompare(String(a.effectiveDateTime))).map((o, i) => (
              <tr key={i}><td>{fmtDate(o.effectiveDateTime)}</td><td>{text(o)}</td><td className="num"><b>{shownValue(o)}</b>{o.note?.[0]?.text && <small className="muted" style={{ display: 'block' }}>{o.note[0].text}</small>}</td><td>{o.status === 'final' ? 'Final' : 'Preliminary'}</td></tr>
            ))}</tbody></table>
        </div>
      </div>
      <div>
        <span className="eyebrow">Notes from your hospital</span>
        {v.annotations.length === 0 ? <p className="hint">No notes yet.</p> : <ul className="advice-s">{v.annotations.map(a => <li key={a.id}>{a.text} <small className="muted">· {a.by}, {fmtDate(a.at)}</small></li>)}</ul>}
        <form className="row" style={{ gap: 8, marginTop: 6 }} onSubmit={save}>
          <input className="input grow" aria-label="Add a note" placeholder="Add a note beside this record" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
          <Button size="sm" disabled={note.trim().length < 2}>Add note</Button>
        </form>
      </div>
      <div>
        <Button type="button" size="sm" variant="secondary" icon={<FileJson size={14} />} onClick={() => setJson(!json)}>{json ? 'Hide FHIR' : 'View FHIR'}</Button>
        {json && <pre className="xjson" tabIndex={0} aria-label="FHIR bundle as received">{JSON.stringify(v.bundle, null, 2)}</pre>}
        <p className="hint" style={{ marginTop: 6 }}>FHIR R4 document bundle, built by the sending hospital and decrypted here. Not yet checked against the NHA profiles.</p>
      </div>
    </div>
  );
}

export function ReceivedDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useApi(() => api.getReceived(id), [id]);
  return (
    <Modal label="Record from another hospital" onClose={onClose} wide>
      <div className="modal__form">
        <div className="spread"><h2 style={{ fontSize: 20 }}>Record from another hospital</h2><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={18} /></Button></div>
        {error && <div className="error-text" role="alert">{error}</div>}
        {!data && !error && <p className="hint">Opening…</p>}
        {data && <ReceivedBody v={data} />}
      </div>
    </Modal>
  );
}
