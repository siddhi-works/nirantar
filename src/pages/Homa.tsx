import { AlertOctagon } from 'lucide-react';
import { fmtDate } from '@/domain/format';
import { homaRows, homaSeries } from '@/domain/homa';
import { riskFlags, roughPeriod } from '@/domain/profile';
import type { Recall } from '@/domain/types';
import { TrendChart } from '@/ui/charts/TrendChart';
import { domainOf } from '@/ui/charts/scale';
import { Button, Card, CardHead, SourceChip } from '@/ui/primitives';
import { useUi } from '@/ui/store';

/** Written in red whenever it is on record: HIV, HCV, a past heart attack. Nothing is shown when nothing is recorded. */
export function RiskFlags({ r }: { r: Recall }) {
  const flags = riskFlags(r);
  if (!flags.length) return null;
  return <div className="riskflags" role="note" aria-label="Risk history on record">{flags.map(f => <span key={f.code} className="riskflag"><AlertOctagon size={14} aria-hidden="true" />{f.label}</span>)}</div>;
}

/** HOMA-IR is used for pre-diabetes and type 2 diabetes. It needs fasting glucose and fasting insulin from the same day, so it is shown only when both are on record. */
export function HomaCard({ r, onRecord }: { r: Recall; onRecord?: () => void }) {
  const openSource = useUi(s => s.openSource);
  const series = homaSeries(r);
  const rows = homaRows(r);
  const byFact = new Map(r.facts.map(f => [f.id, f]));
  return (
    <Card accent="cerulean">
      <CardHead title="HOMA-IR (insulin resistance)" right={onRecord ? <Button size="sm" variant="secondary" onClick={onRecord}>Record fasting insulin</Button> : undefined} />
      <div className="card__body">
        <p className="hint">Used for pre-diabetes and type 2 diabetes. It uses plasma glucose and insulin drawn after an overnight fast. HOMA-IR = glucose (mg/dL) × insulin (mIU/L) ÷ 405. HbA1c, fasting and after-meal sugar are charted above for every patient.</p>
        {series ? (
          <>
            <TrendChart series={series} domain={domainOf(series.points.map(p => p.date), 22)} visitDates={series.points.map(p => ({ visit: p.visit, date: p.date }))} height={170}
              onSelect={p => p.citation && openSource({ kind: 'citation', citation: p.citation, patientId: r.patient.id, title: `HOMA-IR ${p.value!.toFixed(1)} on ${fmtDate(p.date)}` })} />
            <table className="table homa__tbl"><thead><tr><th>Date</th><th>Fasting glucose</th><th>Fasting insulin</th><th>HOMA-IR</th><th>Source</th></tr></thead>
              <tbody>{rows.map(x => (
                <tr key={x.date}><td>{fmtDate(x.date)}</td><td className="num">{x.glucose} mg/dL</td><td className="num">{x.insulin} µU/mL</td><td className="num"><b>{x.value.toFixed(1)}</b></td>
                  <td>{byFact.get(x.insulinId) && <SourceChip citation={byFact.get(x.insulinId)!.citation} patientId={r.patient.id} label="Insulin" />}</td></tr>
              ))}</tbody></table>
          </>
        ) : <p><b>Not available.</b> Fasting insulin is not on record for any date that also has a fasting glucose, so HOMA-IR cannot be calculated. It is never estimated.</p>}
      </div>
    </Card>
  );
}

/* ───── the same ideas for values that arrive as a flat list (registered patients, records received from another hospital) ───── */
import type { Obs } from './ReceivedDashboard';
import { homaOf } from '@/domain/homa';
import type { TrendPoint, TrendSeries } from '@/domain/types';

const isYes = (o: Obs) => /^(positive|yes)/i.test(o.display.trim());

export function obsRiskFlags(obs: Obs[]): { code: string; label: string }[] {
  const newest = (code: string) => obs.filter(o => o.code === code).sort((a, b) => b.date.localeCompare(a.date))[0];
  const out: { code: string; label: string }[] = [];
  if (newest('hiv') && isYes(newest('hiv'))) out.push({ code: 'hiv', label: 'HIV positive' });
  if (newest('hcv') && isYes(newest('hcv'))) out.push({ code: 'hcv', label: 'HCV positive' });
  if (newest('prior-mi') && isYes(newest('prior-mi'))) out.push({ code: 'prior-mi', label: 'Past heart attack (MI)' });
  return out;
}

export function ObsRiskFlags({ obs }: { obs: Obs[] }) {
  const flags = obsRiskFlags(obs);
  if (!flags.length) return null;
  return <div className="riskflags" role="note" aria-label="Risk history on record">{flags.map(f => <span key={f.code} className="riskflag"><AlertOctagon size={14} aria-hidden="true" />{f.label}</span>)}</div>;
}

/** A rough period (nearest half year) since the earliest value on record. It says nothing about the date of diagnosis. */
export function obsPeriod(obs: Obs[]): string | null {
  const dates = obs.filter(o => ['hba1c', 'fbs', 'ppbs'].includes(o.code) && o.date).map(o => o.date).sort();
  if (!dates.length) return null;
  const months = Math.max(0, Math.round((Date.now() - new Date(dates[0]).getTime()) / (30.44 * 86_400_000)));
  return `about ${roughPeriod(months)} on record`;
}

export function ObsHomaCard({ obs }: { obs: Obs[] }) {
  const ins = obs.filter(o => o.code === 'insulin' && o.value !== null);
  const rows = ins.flatMap(i => { const g = obs.find(o => o.code === 'fbs' && o.date === i.date && o.value !== null); return g ? [{ date: i.date, glucose: g.value!, insulin: i.value!, value: homaOf(g.value!, i.value!), source: i.source?.text }] : []; }).sort((a, b) => a.date.localeCompare(b.date));
  const series: TrendSeries | null = rows.length ? {
    code: 'hba1c' as TrendSeries['code'], label: 'HOMA-IR', unit: '', decimals: 1, lowerIsBetter: true, target: { max: 2.5, maxExclusive: true, label: '< 2.5', note: 'A common cut-off for insulin resistance. It differs between labs and populations.' },
    points: rows.map((x, i): TrendPoint => ({ visit: i + 1, date: x.date, value: x.value, deltaPrev: i ? x.value - rows[i - 1].value : null, deltaBase: i ? x.value - rows[0].value : null, band: x.value < 2.5 ? 'in' : 'above' })),
    recorded: [], latest: null, firstReading: null, inBand: { in: rows.filter(x => x.value < 2.5).length, of: rows.length }, summary: `HOMA-IR: ${rows.map(x => `${x.value.toFixed(1)} on ${x.date}`).join(', ')}.`,
  } : null;
  if (series) { series.latest = series.points.at(-1)!; series.firstReading = series.points[0]; }
  return (
    <Card accent="cerulean">
      <CardHead title="HOMA-IR (insulin resistance)" />
      <div className="card__body">
        <p className="hint">Used for pre-diabetes and type 2 diabetes. It uses plasma glucose and insulin drawn after an overnight fast. HOMA-IR = glucose (mg/dL) × insulin (mIU/L) ÷ 405.</p>
        {series ? (
          <>
            <TrendChart series={series} domain={domainOf(series.points.map(p => p.date), 22)} visitDates={series.points.map(p => ({ visit: p.visit, date: p.date }))} height={170} />
            <table className="table homa__tbl"><thead><tr><th>Date</th><th>Fasting glucose</th><th>Fasting insulin</th><th>HOMA-IR</th><th>Source</th></tr></thead>
              <tbody>{rows.map(x => <tr key={x.date}><td>{fmtDate(x.date)}</td><td className="num">{x.glucose} mg/dL</td><td className="num">{x.insulin} µU/mL</td><td className="num"><b>{x.value.toFixed(1)}</b></td><td><small className="muted">{x.source ?? 'Source not included'}</small></td></tr>)}</tbody></table>
          </>
        ) : <p><b>Not available.</b> No date has both a fasting glucose and a fasting insulin on record, so HOMA-IR cannot be calculated. It is never estimated.</p>}
      </div>
    </Card>
  );
}
