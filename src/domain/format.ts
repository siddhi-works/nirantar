import type { ISODate } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Dec 2027" */
export function fmtDate(d: ISODate | string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}
/** "Dec 2027" */
export function fmtMonth(d: ISODate): string {
  const [y, m] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
/** "03/12/2027" — as printed on the slips (DD/MM/YYYY) */
export function fmtSlipDate(d: ISODate): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
export function fmtTime(iso: string): string {
  return iso.length > 10 ? iso.slice(11, 16) : '';
}
export function monthsBetween(a: ISODate, b: ISODate): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  let n = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) n -= 1;
  return Math.max(0, n);
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
export function signed(n: number, decimals = 0): string {
  const s = Math.abs(n).toFixed(decimals);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}
export function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
export function ordinalVisit(v: number): string {
  return `visit ${v}`;
}
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
/** "visit 3" or "visits 3, 4 and 5" */
export function visitsLabel(vs: number[]): string {
  return vs.length === 1 ? `visit ${vs[0]}` : `visits ${joinList(vs.map(String))}`;
}
export function addDaysISO(d: ISODate, n: number): ISODate {
  return new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
