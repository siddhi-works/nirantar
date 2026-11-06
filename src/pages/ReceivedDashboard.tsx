import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CalendarClock, FileJson, Pill, ShieldCheck, Stethoscope } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import type { ReceivedRecordView } from '@/domain/exchange';
import type { TargetBand, TrendPoint, TrendSeries } from '@/domain/types';
import { fmtDate } from '@/domain/format';
import { useSession } from '@/session';
import { Button, Card, CardHead, SkeletonCard, SourceChip, cx } from '@/ui/primitives';
import { TrendChart } from '@/ui/charts/TrendChart';
import { domainOf } from '@/ui/charts/scale';
import { useUi } from '@/ui/store';
import { LangToggle } from '@/i18n/controls';
import { useT } from '@/i18n';
import { Logo } from './Chrome';
import { STATUS } from './exchange-status';

type Res = Record<string, any> & { resourceType: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
const text = (r: Res) => (r.code?.text ?? r.medicationCodeableConcept?.text ?? '') as string;
const shownValue = (r: Res) => (r.valueQuantity ? `${r.valueQuantity.value} ${r.valueQuantity.unit}`.trim() : r.valueString ?? '');

/** "6 Nov 2026, 3:42 pm" in Indian time: when something was received or prepared. */
export const fmtWhen = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';

const LOINC: Record<string, string> = { '4548-4': 'hba1c', '1558-6': 'fbs', '1521-4': 'ppbs', '29463-7': 'weight', '8302-2': 'height', '8480-6': 'sbp', '8462-4': 'dbp', '8867-4': 'pulse', '33914-3': 'egfr', '9318-7': 'uacr', '18262-6': 'ldl', '2085-9': 'hdl', '2571-8': 'tg', '1742-6': 'alt' };
const CHARTS: { code: string; label: string; unit: string; decimals: number; lowerIsBetter: boolean; target: TargetBand }[] = [
  { code: 'hba1c', label: 'HbA1c', unit: '%', decimals: 1, lowerIsBetter: true, target: { max: 7, maxExclusive: true, label: '< 7.0 %', note: 'Usual goal for most adults with diabetes' } },
  { code: 'fbs', label: 'Fasting sugar (FBS)', unit: 'mg/dL', decimals: 0, lowerIsBetter: true, target: { min: 80, max: 130, label: '80–130 mg/dL', note: 'Usual fasting goal' } },
  { code: 'ppbs', label: 'After-meal sugar (PPBS)', unit: 'mg/dL', decimals: 0, lowerIsBetter: true, target: { max: 180, maxExclusive: true, label: '< 180 mg/dL', note: 'Usual after-meal goal' } },
];

/** Where a value came from: an uploaded report (opens the page it was read from) or an entry by a named person. */
export interface ObsSource { text: string; docId?: string | null; patientId?: string; quote?: string | null }
export interface Obs { code: string; label: string; date: string; value: number | null; display: string; note?: string; status: string; source?: ObsSource }

/** The evidence for one number. Every value on screen says where it came from, or says that the source was not sent. */
export function SourceNote({ o }: { o: Obs }) {
  const s = o.source;
  if (!s) return <small className="muted">Source not included in this copy</small>;
  if (s.docId && s.patientId) return <SourceChip citation={{ id: `obs:${s.docId}`, docId: s.docId, field: 'investigations', quote: s.quote ?? '' }} patientId={s.patientId} label="Uploaded report" title={`${o.label} ${o.display}`} />;
  return <small className="muted">{s.text}</small>;
}

function readObservations(bundle: ReceivedRecordView['bundle']): { obs: Obs[]; res: Res[] } {
  const res = bundle.entry.map(e => e.resource as Res);
  const obs = res.filter(r => r.resourceType === 'Observation').map(o => ({
    code: LOINC[o.code?.coding?.[0]?.code as string] ?? '',
    label: text(o), date: String(o.effectiveDateTime ?? ''), value: typeof o.valueQuantity?.value === 'number' ? (o.valueQuantity.value as number) : null,
    display: shownValue(o), status: String(o.status ?? ''),
    note: (o.note as { text: string }[] | undefined)?.find(n => !n.text.startsWith('Source:'))?.text,
    source: ((n) => n ? { text: n.text.slice(8).trim() } : undefined)((o.note as { text: string }[] | undefined)?.find(n => n.text.startsWith('Source:'))),
  }));
  return { obs, res };
}

function seriesFor(def: (typeof CHARTS)[number], obs: Obs[]): TrendSeries | null {
  const rows = obs.filter(o => o.code === def.code && o.value !== null).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return null;
  const inBand = (v: number) => { const t = def.target; return (t.min === undefined || v >= t.min) && (t.max === undefined || (t.maxExclusive ? v < t.max : v <= t.max)); };
  const points: TrendPoint[] = rows.map((o, i) => ({
    visit: i + 1, date: o.date, value: o.value, deltaPrev: i ? o.value! - rows[i - 1].value! : null, deltaBase: i ? o.value! - rows[0].value! : null,
    band: inBand(o.value!) ? 'in' : (def.target.max !== undefined && o.value! >= def.target.max ? 'above' : 'below'),
  }));
  return {
    code: def.code as TrendSeries['code'], label: def.label, unit: def.unit, decimals: def.decimals, lowerIsBetter: def.lowerIsBetter, target: def.target,
    points, recorded: [], latest: points.at(-1)!, firstReading: points[0],
    inBand: { in: points.filter(p => p.band === 'in').length, of: points.length },
    summary: `${def.label}: ${points.map(p => `${p.value!.toFixed(def.decimals)} on ${fmtDate(p.date)}`).join(', ')}.`,
  };
}

function Tile({ label, unit, latest, first, decimals = 0, lowerIsBetter = true }: { label: string; unit: string; latest: Obs; first?: Obs; decimals?: number; lowerIsBetter?: boolean }) {
  const t = useT();
  const delta = first && first !== latest && latest.value !== null && first.value !== null ? latest.value - first.value : null;
  const good = delta === null || delta === 0 ? null : (delta < 0) === lowerIsBetter;
  return (
    <div className="rtile">
      <span className="eyebrow">{label}</span>
      <b className="num">{latest.value !== null ? latest.value.toFixed(decimals) : latest.display}<small> {unit}</small></b>
      <span className="muted">{fmtDate(latest.date)}</span>
      <SourceNote o={latest} />
      {delta !== null && (Math.abs(delta) < 0.05 * 10 ** -decimals * 10
        ? <span className="delta delta--neutral">{t('No change since {date}', { date: fmtDate(first!.date) })}</span>
        : <span><span className={cx('delta', good ? 'delta--good' : 'delta--neutral')}>{delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(decimals)}</span> <span className="muted">{t('since {date}', { date: fmtDate(first!.date) })}</span></span>)}
    </div>
  );
}


/** Tiles with the latest value of each measure, and a trend chart for each sugar measure. */
export function ObsOverview({ obs }: { obs: Obs[] }) {
  if (!obs.length) return null; // a new patient has nothing to chart yet
  const series = CHARTS.map(d => seriesFor(d, obs));
  const dates = [...new Set(obs.map(o => o.date).filter(Boolean))].sort();
  const domain = domainOf(dates, 22);
  const visitDates = dates.map((d, i) => ({ visit: i + 1, date: d }));
  const latest = (code: string) => obs.filter(o => o.code === code && o.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const first = (code: string) => obs.filter(o => o.code === code && o.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  const bp = latest('sbp') && latest('dbp') ? `${latest('sbp').value}/${latest('dbp').value}` : null;
  return (
    <>
      <div className="rtiles">
        {latest('hba1c') && <Tile label="HbA1c" unit="%" latest={latest('hba1c')} first={first('hba1c')} decimals={1} />}
        {latest('fbs') && <Tile label="Fasting sugar" unit="mg/dL" latest={latest('fbs')} first={first('fbs')} />}
        {latest('ppbs') && <Tile label="After-meal sugar" unit="mg/dL" latest={latest('ppbs')} first={first('ppbs')} />}
        {latest('weight') && <Tile label="Weight" unit="kg" latest={latest('weight')} first={first('weight')} />}
        {bp && <div className="rtile"><span className="eyebrow">Blood pressure</span><b className="num">{bp}<small> mmHg</small></b><span className="muted">{fmtDate(latest('sbp').date)}</span></div>}
        {latest('egfr') && <Tile label="eGFR" unit="" latest={latest('egfr')} lowerIsBetter={false} />}
        {latest('ldl') && <Tile label="LDL" unit="mg/dL" latest={latest('ldl')} />}
      </div>

      <Card accent="ink">
        <CardHead title="Trends" icon={<Stethoscope size={16} />} right={<span className="hint">Dates are the days the slips were written.</span>} />
        <div className="trio">
          {series.map((s, i) => s && (
            <div key={CHARTS[i].code}>
              <div className="trio__h"><b>{s.label}</b><span className="muted">{s.unit} · target {s.target?.label}</span></div>
              <TrendChart series={s} domain={domain} visitDates={visitDates} height={170} />
            </div>
          ))}
        </div>
      </Card>

    </>
  );
}

/** Every value, grouped by the day it is dated. */
export function ObsTable({ obs }: { obs: Obs[] }) {
  const dates = [...new Set(obs.map(o => o.date).filter(Boolean))].sort();
  const byDate = [...dates].reverse().map(d => ({ date: d, rows: obs.filter(o => o.date === d) }));
  if (!obs.length) return null;
  return (
      <Card accent="cerulean">
        <CardHead title="Results and examinations, by date" />
        <div style={{ overflowX: 'auto' }}>
          <table className="table"><thead><tr><th>Date</th><th>Measure</th><th>Value</th><th>Source</th><th>Status</th></tr></thead>
            <tbody>{byDate.flatMap(g => g.rows.map((o, i) => (
              <tr key={g.date + o.label + i}>
                <td>{i === 0 ? <b>{fmtDate(g.date)}</b> : ''}</td><td>{o.label}</td>
                <td className="num"><b>{o.display}</b>{o.note && <small className="muted" style={{ display: 'block' }}>{o.note}</small>}</td>
                <td><SourceNote o={o} /></td>
                <td>{o.status === 'final' ? 'Final' : 'Preliminary'}</td>
              </tr>
            )))}</tbody></table>
        </div>
        <p className="hint" style={{ padding: '0 16px 12px' }}>The slips carry dates, not times of day. The time shown at the top is when this copy arrived.</p>
      </Card>
  );
}

function Body({ v }: { v: ReceivedRecordView }) {
  const toast = useUi(s => s.toast);
  const [note, setNote] = useState('');
  const [json, setJson] = useState(false);
  const [notes, setNotes] = useState(v.annotations);
  const { obs, res } = useMemo(() => readObservations(v.bundle), [v]);
  const of = (t: string) => res.filter(r => r.resourceType === t);
  const patient = of('Patient')[0];
  const composition = of('Composition')[0];
  const prepared = (v.bundle as { timestamp?: string }).timestamp ?? composition?.date;
  const name = patient?.name?.[0]?.text as string | undefined;
  const initials = (name ?? '?').replace(/^(Mrs?|Dr)\.?\s*/, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.annotate(v.id, note); setNotes(n => [...n, { id: Date.now(), text: note, by: 'You', at: new Date().toISOString() }]); setNote(''); toast('Note added'); }
    catch (e2) { toast(e2 instanceof Error ? e2.message : 'Could not save the note.', 'error'); }
  };

  return (
    <main className="wrap wrap--wide">
      <Card accent="ink" className="phead">
        <div className="phead__row">
          <span className="avatar">{initials}</span>
          <div className="grow">
            <h1>{name}</h1>
            <div className="phead__meta"><span>ABHA {patient?.identifier?.[0]?.value}</span><span>{patient?.gender === 'female' ? 'Female' : 'Male'}</span>{of('Condition').map((c, i) => <span key={i}>{text(c)}</span>)}</div>
            <div className="phead__cx"><span className="chip chip--outline"><ShieldCheck size={12} /> Read-only copy</span><span className={cx('chip', STATUS[v.consentStatus].tone)}>Patient's permission: {STATUS[v.consentStatus].label.toLowerCase()}</span></div>
          </div>
          <div className="rmeta">
            <div><span className="eyebrow"><Building2 size={12} /> From</span><b>{v.fromName}</b></div>
            <div><span className="eyebrow"><CalendarClock size={12} /> Received</span><b>{fmtWhen(v.receivedAt)}</b></div>
            <div><span className="eyebrow">Patient allowed</span><b>{v.allowed.hiTypes.map(k => ({ OPConsultation: 'Consultation notes', Prescription: 'Prescriptions', DiagnosticReport: 'Test results' } as Record<string, string>)[k] ?? k).join(', ') || 'Unavailable'}</b></div>
            <div><span className="eyebrow">Must be erased by</span><b>{v.allowed.dataEraseAt ? fmtWhen(v.allowed.dataEraseAt) : 'Unavailable'}</b></div>
            {prepared && Math.abs(new Date(String(prepared)).getTime() - new Date(v.receivedAt).getTime()) > 120_000 && <div><span className="eyebrow">Prepared by sender</span><b>{fmtWhen(String(prepared))}</b></div>}
          </div>
        </div>
      </Card>
      {v.consentStatus !== 'granted' && <div className="xban" role="status"><ShieldCheck size={16} /><span>The patient's permission is now <b>{STATUS[v.consentStatus].label.toLowerCase()}</b>, so no new copy can be fetched. You may keep this read-only copy only until the erase date shown above.</span></div>}

      <ObsOverview obs={obs} />

      <div className="cols cols--even">
        <Card accent="sage">
          <CardHead title="Medicines" icon={<Pill size={16} />} />
          <div className="card__body">
            {of('MedicationStatement').length === 0 ? <p className="hint">No medicines in this record.</p>
              : <ul className="meds">{of('MedicationStatement').map((m, i) => <li key={i}><b>{text(m)}</b>{m.dosage?.[0]?.text ? ` · ${m.dosage[0].text}` : ''}</li>)}</ul>}
          </div>
        </Card>
        <Card accent="cerulean">
          <CardHead title="Notes from your hospital" />
          <div className="card__body">
            {notes.length === 0 ? <p className="hint">No notes yet.</p> : <ul className="advice-s">{notes.map(a => <li key={a.id}>{a.text} <small className="muted">· {a.by}, {fmtWhen(a.at)}</small></li>)}</ul>}
            <form className="row" style={{ gap: 8, marginTop: 8 }} onSubmit={save}>
              <input className="input grow" aria-label="Add a note" placeholder="Add a note beside this record" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
              <Button size="sm" disabled={note.trim().length < 2}>Add note</Button>
            </form>
            <p className="hint" style={{ marginTop: 6 }}>Your notes stay beside this copy. They never change the sending hospital's record.</p>
          </div>
        </Card>
      </div>

      <ObsTable obs={obs} />

      <div style={{ margin: '4px 0 28px' }}>
        <Button type="button" size="sm" variant="secondary" icon={<FileJson size={14} />} onClick={() => setJson(!json)}>{json ? 'Hide FHIR' : 'View FHIR'}</Button>
        {json && <pre translate="no" className="xjson" tabIndex={0} aria-label="FHIR bundle as received">{JSON.stringify(v.bundle, null, 2)}</pre>}
        <p className="hint" style={{ marginTop: 6 }}>FHIR R4 document bundle, built by the sending hospital and decrypted here. Not yet checked against the NHA profiles.</p>
      </div>
    </main>
  );
}

/** A received record, opened as a full page: the same kind of dashboard a doctor sees at the hospital that holds it. */
export function ReceivedPage({ id, onClose }: { id: string; onClose: () => void }) {
  const user = useSession(s => s.user);
  const { data, error } = useApi(() => api.getReceived(id), [id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="xpage" role="dialog" aria-label="Record from another hospital">
      <header className="bar">
        <div className="bar__brand"><Logo size={30} /><span>Nirantar</span></div>
        <div className="grow" />
        <Button variant="secondary" size="sm" onClick={onClose} icon={<ArrowLeft size={14} />}>Back to dashboard</Button>
        <LangToggle />
        <div className="bar__user"><span className="avatar avatar--sm">{user?.name.replace(/^(Mrs?|Dr|Nurse)\.?\s*/, '')[0]}</span><span><b>{user?.name}</b><small>{user?.line}</small></span></div>
      </header>
      {error && <main className="wrap"><div className="error-text" role="alert">{error}</div></main>}
      {!data && !error && <main className="wrap wrap--wide"><SkeletonCard h={140} /><SkeletonCard h={300} /></main>}
      {data && <Body v={data} />}
    </div>
  );
}
