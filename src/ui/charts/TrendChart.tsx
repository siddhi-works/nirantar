import { useMemo, useState } from 'react';
import type { TrendPoint, TrendSeries } from '@/domain/types';
import { fmtDate, fmtMonth, signed } from '@/domain/format';
import { docShort } from '../primitives';
import { niceTicks, timeScale, useWidth, type XScale } from './scale';

export const ML = 58;
export const MR = 92;

const bandColor = (b: TrendPoint['band']) => (b === 'above' || b === 'below' ? 'var(--terracotta-ink)' : b === 'in' ? 'var(--sage-ink)' : 'var(--ink)');

interface Props {
  series: TrendSeries;
  domain: [string, string];
  height?: number;
  hoverVisit?: number | null;
  onHover?: (visit: number | null) => void;
  onSelect?: (p: TrendPoint) => void;
  showAxis?: boolean;
  visitDates: { visit: number; date: string }[];
}

/** Hand-built, time-scaled trend chart with an explicit target band. Every point opens its source. */
export function TrendChart({ series, domain, height = 190, hoverVisit, onHover, onSelect, showAxis = true, visitDates }: Props) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TrendPoint | null>(null);
  const mt = 26;
  const mb = showAxis ? 30 : 14;
  const x: XScale = useMemo(() => timeScale(domain, ML, W - MR), [domain, W]);
  const xs = visitDates.map(v => x(v.date)).sort((a, b) => a - b);
  const minGap = xs.length > 1 ? Math.min(...xs.slice(1).map((v, i) => v - xs[i])) : 999;
  const compact = minGap < 72;
  const read = series.points.filter(p => p.value !== null);
  const vals = read.map(p => p.value!);
  const t = series.target;
  const cand = [...vals];
  if (t?.min !== undefined) cand.push(t.min);
  if (t?.max !== undefined) cand.push(t.max);
  const lo = Math.min(...cand);
  const hi = Math.max(...cand);
  const pad = (hi - lo) * 0.14 || 1;
  const y0 = lo - pad; const y1 = hi + pad;
  const plotH = height - mt - mb;
  const y = (v: number) => mt + (1 - (v - y0) / (y1 - y0)) * plotH;
  const ticks = niceTicks(y0, y1, 4);
  const dec = series.decimals;
  const fmt = (v: number) => v.toFixed(dec);

  const segs: TrendPoint[][] = [];
  let cur: TrendPoint[] = [];
  for (const p of series.points) { if (p.value === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(p); }
  if (cur.length) segs.push(cur);

  const bandTop = t ? y(Math.min(t.max ?? y1, y1)) : 0;
  const bandBot = t ? y(Math.max(t.min ?? y0, y0)) : 0;

  return (
    <div ref={ref} className="tchart" style={{ height }} onMouseLeave={() => { setTip(null); onHover?.(null); }}>
      <svg width={W} height={height} role="img" aria-label={series.summary}>
        {/* grid */}
        {ticks.map(tk => (
          <g key={tk}>
            <line x1={ML} x2={W - MR} y1={y(tk)} y2={y(tk)} stroke="#ECEEEC" />
            <text x={ML - 10} y={y(tk) + 4} textAnchor="end" className="tchart__tick">{tk % 1 ? tk.toFixed(1) : tk}</text>
          </g>
        ))}
        {/* target band */}
        {t && (
          <g>
            <rect x={ML} y={bandTop} width={W - MR - ML} height={Math.max(2, bandBot - bandTop)} fill="var(--sage)" opacity={0.13} />
            {t.max !== undefined && <line x1={ML} x2={W - MR} y1={bandTop} y2={bandTop} stroke="var(--sage)" strokeDasharray="4 4" opacity={0.7} />}
            {t.min !== undefined && <line x1={ML} x2={W - MR} y1={bandBot} y2={bandBot} stroke="var(--sage)" strokeDasharray="4 4" opacity={0.7} />}
            <text x={W - MR + 8} y={(bandTop + bandBot) / 2 - 2} className="tchart__band">target</text>
            <text x={W - MR + 8} y={(bandTop + bandBot) / 2 + 11} className="tchart__band tchart__band--b">{t.label}</text>
          </g>
        )}
        {/* visit rails */}
        {visitDates.map(v => (
          <g key={v.visit}>
            <line x1={x(v.date)} x2={x(v.date)} y1={mt - 6} y2={mt + plotH} stroke={hoverVisit === v.visit ? 'var(--cerulean)' : '#E3E6E3'} strokeDasharray={hoverVisit === v.visit ? undefined : '2 4'} />
            {showAxis && (
              <>
                <text x={x(v.date)} y={height - 20} textAnchor="middle" className="tchart__vlabel">V{v.visit}</text>
                {!compact && <text x={x(v.date)} y={height - 6} textAnchor="middle" className="tchart__date">{fmtMonth(v.date)}</text>}
              </>
            )}
          </g>
        ))}
        {/* absent readings */}
        {series.points.filter(p => p.value === null).map(p => (
          <g key={`n${p.visit}`} onMouseEnter={() => onHover?.(p.visit)}>
            <title>{`Visit ${p.visit}: not written on the slip`}</title>
            <rect x={x(p.date) - (compact ? 11 : 30)} y={mt + plotH / 2 - 11} width={compact ? 22 : 60} height={22} rx={11} fill="var(--cerulean-tint)" stroke="var(--cerulean)" strokeDasharray="3 3" />
            <text x={x(p.date)} y={mt + plotH / 2 + 4} textAnchor="middle" className="tchart__absent">{compact ? '—' : 'not written'}</text>
          </g>
        ))}
        {/* line */}
        {segs.map((s, i) => s.length > 1 && (
          <polyline key={i} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            points={s.map(p => `${x(p.date)},${y(p.value!)}`).join(' ')} />
        ))}
        {/* points */}
        {read.map(p => {
          const active = hoverVisit === p.visit || tip?.visit === p.visit;
          const verified = p.verification === 'verified';
          return (
            <g key={p.visit} className="tchart__pt" tabIndex={0} role="button"
              aria-label={`${series.label} ${fmt(p.value!)} ${series.unit} on ${fmtDate(p.date)}, visit ${p.visit}. Open source.`}
              onMouseEnter={() => { setTip(p); onHover?.(p.visit); }} onFocus={() => { setTip(p); onHover?.(p.visit); }} onBlur={() => setTip(null)}
              onClick={() => onSelect?.(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(p); } }}>
              <circle cx={x(p.date)} cy={y(p.value!)} r={16} fill="transparent" />
              <circle cx={x(p.date)} cy={y(p.value!)} r={active ? 7.5 : 5.5} fill="#fff" stroke={bandColor(p.band)} strokeWidth={2.4} />
              {verified && <circle cx={x(p.date)} cy={y(p.value!)} r={2.2} fill="var(--sage-ink)" />}
              <text x={x(p.date)} y={y(p.value!) - 12} textAnchor="middle" className="tchart__val" style={{ fill: bandColor(p.band) }}>{fmt(p.value!)}</text>
            </g>
          );
        })}
      </svg>
      {tip && tip.value !== null && (
        <div className="tchart__tip" style={{ left: Math.min(Math.max(x(tip.date), 90), W - 100), top: Math.max(0, y(tip.value) - 92) }}>
          <b>{series.label} {fmt(tip.value)} {series.unit}</b>
          <span>Visit {tip.visit} · {fmtDate(tip.date)}</span>
          {tip.deltaPrev !== null && <span>{signed(tip.deltaPrev, dec)} vs previous reading</span>}
          {tip.deltaBase !== null && <span>{signed(tip.deltaBase, dec)} vs first reading</span>}
          {tip.citation && <span className="tchart__tip-src">{docShort(tip.citation.docId)} · click to open</span>}
        </div>
      )}
    </div>
  );
}
