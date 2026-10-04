import { useMemo } from 'react';
import type { Medication, TrendPoint, TrendSeries } from '@/domain/types';
import { fmtDate } from '@/domain/format';
import { ML, MR } from './TrendChart';
import { timeScale, useWidth } from './scale';

/** Compact sparkline for trend-strip tiles: line + target band + clickable, keyboard-reachable points. */
export function Spark({ series, height = 64, onSelect }: { series: TrendSeries; height?: number; onSelect?: (p: TrendPoint) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>(220);
  const pts = series.points;
  const read = pts.filter(p => p.value !== null);
  const t = series.target;
  const cand = read.map(p => p.value!);
  if (t?.min !== undefined) cand.push(t.min);
  if (t?.max !== undefined) cand.push(t.max);
  const lo = Math.min(...cand); const hi = Math.max(...cand); const pad = (hi - lo) * 0.18 || 1;
  const y0 = lo - pad; const y1 = hi + pad;
  const px = 10; const h = height;
  const x = (i: number) => (pts.length === 1 ? W / 2 : px + (i / (pts.length - 1)) * (W - px * 2));
  const y = (v: number) => 6 + (1 - (v - y0) / (y1 - y0)) * (h - 12);
  const bandTop = t ? y(Math.min(t.max ?? y1, y1)) : 0; const bandBot = t ? y(Math.max(t.min ?? y0, y0)) : 0;
  const segs: { p: TrendPoint; i: number }[][] = []; let cur: { p: TrendPoint; i: number }[] = [];
  pts.forEach((p, i) => { if (p.value === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push({ p, i }); });
  if (cur.length) segs.push(cur);
  return (
    <div ref={ref} style={{ height }}>
      <svg width={W} height={h} role="img" aria-label={series.summary}>
        {t && <rect x={0} y={bandTop} width={W} height={Math.max(2, bandBot - bandTop)} fill="var(--sage)" opacity={0.14} />}
        {segs.map((s, k) => s.length > 1 && <polyline key={k} fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinejoin="round" points={s.map(q => `${x(q.i)},${y(q.p.value!)}`).join(' ')} />)}
        {pts.map((p, i) => p.value === null
          ? <circle key={i} cx={x(i)} cy={h - 8} r={3.2} fill="none" stroke="var(--cerulean)" strokeDasharray="2 2"><title>{`Visit ${p.visit}: not written`}</title></circle>
          : (
            <g key={i} className="tchart__pt" tabIndex={0} role="button" aria-label={`${series.label} ${p.value.toFixed(series.decimals)} ${series.unit}, visit ${p.visit}, ${fmtDate(p.date)}. Open source.`}
              onClick={() => onSelect?.(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(p); } }}>
              <circle cx={x(i)} cy={y(p.value)} r={11} fill="transparent" />
              <circle cx={x(i)} cy={y(p.value)} r={i === pts.length - 1 ? 4.6 : 3.2} fill={i === pts.length - 1 ? 'var(--ink)' : '#fff'} stroke={p.band === 'above' ? 'var(--terracotta-ink)' : 'var(--ink)'} strokeWidth={1.8}>
                <title>{`V${p.visit} · ${p.value.toFixed(series.decimals)} ${series.unit} · ${fmtDate(p.date)}`}</title>
              </circle>
            </g>
          ))}
      </svg>
    </div>
  );
}

/** Plain line for overview cards. */
export function SparkLine({ values, w = 120, h = 36, color = 'var(--ink)' }: { values: (number | null)[]; w?: number; h?: number; color?: string }) {
  const read = values.filter((v): v is number => v !== null);
  const lo = Math.min(...read); const hi = Math.max(...read); const rng = hi - lo || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (w - 6);
  const y = (v: number) => 4 + (1 - (v - lo) / rng) * (h - 8);
  const pts = values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter(Boolean) as (readonly [number, number])[];
  return (
    <svg width={w} height={h} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" points={pts.map(p => p.join(',')).join(' ')} />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.6 : 2} fill={i === pts.length - 1 ? color : '#fff'} stroke={color} strokeWidth={1.4} />)}
    </svg>
  );
}

/** Medicine lane aligned to the trend charts' time axis. Solid dot = dose written; filled ring = drug named; hollow = “existing treatment”. */
export function MedLane({ meds, domain, onSelect, visitDates, hoverVisit }: {
  meds: Medication[]; domain: [string, string]; visitDates: { visit: number; date: string }[]; hoverVisit?: number | null;
  onSelect: (m: Medication['mentions'][number]) => void;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const x = useMemo(() => timeScale(domain, ML, W - MR), [domain, W]);
  const rowH = 64;
  const H = meds.length * rowH + 8;
  const dateOf = (v: number) => visitDates.find(d => d.visit === v)!.date;
  return (
    <div ref={ref} style={{ height: H }}>
      <svg width={W} height={H} role="img" aria-label={`Medicine lane: ${meds.map(m => `${m.drug} ${m.strength ?? ''}`).join(', ')}, no dose change on any slip.`}>
        {visitDates.map(v => <line key={v.visit} x1={x(v.date)} x2={x(v.date)} y1={0} y2={H} stroke={hoverVisit === v.visit ? 'var(--cerulean)' : '#E3E6E3'} strokeDasharray={hoverVisit === v.visit ? undefined : '2 4'} />)}
        {meds.map((m, i) => {
          const cy = i * rowH + 40;
          const first = x(dateOf(m.mentions[0].visit)); const last = x(dateOf(m.mentions.at(-1)!.visit));
          return (
            <g key={m.drug}>
              <text x={ML} y={cy - 22} className="medlane__name">{m.drug}</text>
              <text x={ML + m.drug.length * 7.6 + 10} y={cy - 22} className="medlane__sub">{[m.strength, m.regimen].filter(Boolean).join(' · ')}</text>
              <rect x={first - 8} y={cy - 8} width={Math.max(16, last - first + 16)} height={16} rx={8} fill="var(--tint)" stroke="#D3DAD8" />
              <text x={W - MR + 8} y={cy + 4} className="medlane__flag">{m.changed ? 'dose changed' : 'no dose change'}</text>
              {m.mentions.map(me => {
                const cx = x(dateOf(me.visit));
                const solid = me.mode === 'dose-stated'; const named = me.mode === 'named';
                return (
                  <g key={me.visit} className="tchart__pt" tabIndex={0} role="button"
                    aria-label={`${m.drug}, visit ${me.visit}: ${me.mode === 'by-reference' ? 'continued as “existing treatment”' : me.mode === 'named' ? 'named, dose not restated' : 'dose written'}. Open source.`}
                    onClick={() => onSelect(me)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(me); } }}>
                    <circle cx={cx} cy={cy} r={14} fill="transparent" />
                    <circle cx={cx} cy={cy} r={6.5} fill={solid ? 'var(--ink)' : named ? 'var(--cerulean)' : '#fff'} stroke={solid ? 'var(--ink)' : 'var(--cerulean-ink)'} strokeWidth={2} />
                    <title>{`V${me.visit} · ${me.text}`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Cohort pulse: both patients on one visit-indexed axis for a single measure. */
export function CohortChart({ lines, unit, decimals = 0 }: { lines: { id: string; name: string; values: (number | null)[]; color: string }[]; unit: string; decimals?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const H = 230; const ml = 44; const mr = 24; const mt = 20; const mb = 34;
  const all = lines.flatMap(l => l.values).filter((v): v is number => v !== null);
  const lo = Math.min(...all); const hi = Math.max(...all); const pad = (hi - lo) * 0.18 || 1;
  const y0 = lo - pad; const y1 = hi + pad;
  const n = Math.max(...lines.map(l => l.values.length));
  const x = (i: number) => ml + (i / (n - 1)) * (W - ml - mr);
  const y = (v: number) => mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb);
  const ticks = [0, 1, 2, 3].map(k => y0 + ((y1 - y0) * k) / 3);
  return (
    <div ref={ref} style={{ height: H }}>
      <svg width={W} height={H} role="img" aria-label={`${lines.map(l => `${l.name}: ${l.values.filter(v => v !== null).join(', ')} ${unit}`).join('. ')}`}>
        {ticks.map(t => <g key={t}><line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke="#ECEEEC" /><text x={ml - 8} y={y(t) + 4} textAnchor="end" className="tchart__tick">{t.toFixed(decimals)}</text></g>)}
        {Array.from({ length: n }, (_, i) => <g key={i}><line x1={x(i)} x2={x(i)} y1={mt - 6} y2={H - mb} stroke="#E3E6E3" strokeDasharray="2 4" /><text x={x(i)} y={H - 12} textAnchor="middle" className="tchart__vlabel">Visit {i + 1}</text></g>)}
        {lines.map(l => {
          const pts = l.values.map((v, i) => (v === null ? null : { v, i })).filter(Boolean) as { v: number; i: number }[];
          return (
            <g key={l.id}>
              <polyline fill="none" stroke={l.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" points={pts.map(p => `${x(p.i)},${y(p.v)}`).join(' ')} />
              {pts.map(p => (
                <g key={p.i}>
                  <circle cx={x(p.i)} cy={y(p.v)} r={4.6} fill="#fff" stroke={l.color} strokeWidth={2.2}><title>{`${l.name} · visit ${p.i + 1} · ${p.v.toFixed(decimals)} ${unit}`}</title></circle>
                  <text x={x(p.i)} y={y(p.v) - 10} textAnchor="middle" className="tchart__val" style={{ fill: l.color }}>{p.v.toFixed(decimals)}</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
