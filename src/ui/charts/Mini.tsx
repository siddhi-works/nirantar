import { useMemo } from 'react';
import type { Medication } from '@/domain/types';
import { ML, MR } from './TrendChart';
import { timeScale, useWidth } from './scale';

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
      <svg width={W} height={H} role="group" aria-label={`Medicine lane: ${meds.map(m => `${m.drug} ${m.strength ?? ''}`).join(', ')}, no dose change on any slip.`}>
        {visitDates.map(v => <line key={v.visit} x1={x(v.date)} x2={x(v.date)} y1={0} y2={H} stroke={hoverVisit === v.visit ? 'var(--cerulean)' : '#D6DFE8'} strokeDasharray={hoverVisit === v.visit ? undefined : '2 4'} />)}
        {meds.map((m, i) => {
          const cy = i * rowH + 40;
          const first = x(dateOf(m.mentions[0].visit)); const last = x(dateOf(m.mentions.at(-1)!.visit));
          return (
            <g key={m.drug}>
              <text x={ML} y={cy - 22} className="medlane__name">{m.drug}</text>
              <text x={ML + m.drug.length * 7.6 + 10} y={cy - 22} className="medlane__sub">{[m.strength, m.regimen].filter(Boolean).join(' · ')}</text>
              <rect x={first - 8} y={cy - 8} width={Math.max(16, last - first + 16)} height={16} rx={8} fill="var(--tint)" stroke="#C3CFDB" />
              <text x={W - MR + 8} y={cy + 4} className="medlane__flag">{m.changed ? 'dose changed' : 'no dose change'}</text>
              {m.mentions.map(me => {
                const cx = x(dateOf(me.visit));
                const solid = me.mode === 'dose-stated'; const named = me.mode === 'named';
                return (
                  <g key={me.visit} className="tchart__pt" tabIndex={0} role="button"
                    aria-label={`${m.drug}, visit ${me.visit}: ${me.mode === 'by-reference' ? 'continued as “existing treatment”' : me.mode === 'named' ? 'named, dose not restated' : 'dose written'}. Open source.`}
                    onClick={() => onSelect(me)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(me); } }}>
                    <circle cx={cx} cy={cy} r={22} fill="transparent" />
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
