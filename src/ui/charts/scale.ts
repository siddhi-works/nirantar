import { useEffect, useRef, useState } from 'react';
import { diffDays } from '@/domain/format';

export function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { const cw = Math.round(entries[0].contentRect.width); if (cw > 0) setW(cw); });
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width) || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

export interface XScale { (date: string): number; domain: [string, string] }
export function timeScale(domain: [string, string], x0: number, x1: number): XScale {
  const span = Math.max(1, diffDays(domain[0], domain[1]));
  const f = ((d: string) => x0 + (diffDays(domain[0], d) / span) * (x1 - x0)) as XScale;
  f.domain = domain;
  return f;
}

export function domainOf(dates: string[], padDays = 0): [string, string] {
  const s = [...dates].sort();
  const pad = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  return [pad(s[0], -padDays), pad(s.at(-1)!, padDays)];
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
