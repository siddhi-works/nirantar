import type { Recall, TrendPoint, TrendSeries } from './types';

/** HOMA-IR = fasting glucose (mg/dL) × fasting insulin (µU/mL) ÷ 405. Only calculated for a date with both values on record. */
export const homaOf = (glucose: number, insulin: number) => Math.round((glucose * insulin / 405) * 10) / 10;

export interface HomaRow { date: string; glucose: number; insulin: number; value: number; glucoseId: string; insulinId: string }

export function homaRows(r: Recall): HomaRow[] {
  const ins = r.facts.filter(f => f.code === 'insulin' && typeof f.value === 'number');
  const glu = r.facts.filter(f => f.code === 'fbs' && typeof f.value === 'number');
  return ins.flatMap(i => {
    const g = glu.find(x => x.date === i.date);
    return g ? [{ date: i.date, glucose: Number(g.value), insulin: Number(i.value), value: homaOf(Number(g.value), Number(i.value)), glucoseId: g.id, insulinId: i.id }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** A chart-ready series, or null when no date has both fasting glucose and fasting insulin. */
export function homaSeries(r: Recall): TrendSeries | null {
  const rows = homaRows(r);
  if (!rows.length) return null;
  const byFact = new Map(r.facts.map(f => [f.id, f]));
  const points: TrendPoint[] = rows.map((x, i) => ({
    visit: i + 1, date: x.date, value: x.value, factId: x.insulinId, citation: byFact.get(x.insulinId)?.citation,
    deltaPrev: i ? x.value - rows[i - 1].value : null, deltaBase: i ? x.value - rows[0].value : null, band: x.value < 2.5 ? 'in' : 'above',
  }));
  return {
    code: 'hba1c' as TrendSeries['code'], label: 'HOMA-IR', unit: '', decimals: 1, lowerIsBetter: true,
    target: { max: 2.5, maxExclusive: true, label: '< 2.5', note: 'A common cut-off for insulin resistance. It differs between labs and populations.' },
    points, recorded: [], latest: points.at(-1)!, firstReading: points[0], inBand: { in: points.filter(p => p.band === 'in').length, of: points.length },
    summary: `HOMA-IR: ${points.map(p => `${p.value!.toFixed(1)} on ${p.date}`).join(', ')}.`,
  };
}
