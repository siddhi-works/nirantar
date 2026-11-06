/**
 * A pretend ABHA registry for the sandbox, standing in for ABDM's. Real ABDM verifies an ABHA by sending an OTP to the
 * mobile number held in the ABHA profile, and a hospital matches the patient's details against that profile with a fuzzy
 * name match, an age within 2 years and an exact gender. This follows the same rules. Every person here is made up.
 */
export interface AbhaProfile { abha: string; name: string; age: number; sex: 'M' | 'F'; mobile: string; place: string }

export const SANDBOX_ABHA: AbhaProfile[] = [
  { abha: '93110022345567', name: 'Ramesh Chandra Tiwari', age: 58, sex: 'M', mobile: '9876500011', place: 'Deoria, Uttar Pradesh' },
  { abha: '93220033456678', name: 'Sunita Devi Verma', age: 47, sex: 'F', mobile: '9876500022', place: 'Kushinagar, Uttar Pradesh' },
  { abha: '93330044567789', name: 'Mohammad Arif Ansari', age: 39, sex: 'M', mobile: '9876500033', place: 'Gorakhpur, Uttar Pradesh' },
  { abha: '93440055678890', name: 'Lakshmi Narayanan Iyer', age: 66, sex: 'M', mobile: '9876500044', place: 'Varanasi, Uttar Pradesh' },
  { abha: '93550066789901', name: 'Anita Kumari Gupta', age: 33, sex: 'F', mobile: '9876500055', place: 'Maharajganj, Uttar Pradesh' },
  { abha: '93660077890012', name: 'Gurpreet Kaur Sandhu', age: 61, sex: 'F', mobile: '9876500066', place: 'Lucknow, Uttar Pradesh' },
];

export const profileByAbha = (abha: string) => SANDBOX_ABHA.find(p => p.abha === abha);

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'shri', 'shree', 'smt', 'sri', 'kumari', 'master', 'baby']);
const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(t => t && !TITLES.has(t));

function edit(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Same person, allowing for titles, word order, an initial instead of a name, and one letter of spelling in a longer word. */
export function nameMatches(a: string, b: string): boolean {
  const [short, long] = [tokens(a), tokens(b)].sort((x, y) => x.length - y.length);
  if (!short.length || long.length - short.length > 1 || (short.length < 2 && long.length > 1)) return false;
  const pool = [...long];
  for (const t of short) {
    const i = pool.findIndex(u => u === t || (t.length === 1 && u[0] === t) || (u.length === 1 && t[0] === u) || (t.length >= 5 && u.length >= 5 && edit(t, u) <= 1));
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

/** The fields that do not agree with the ABHA profile. Empty means the details match. */
export function mismatches(entered: { name: string; age: number; sex: string; mobile: string }, p: AbhaProfile): ('name' | 'age' | 'sex' | 'mobile')[] {
  const out: ('name' | 'age' | 'sex' | 'mobile')[] = [];
  if (!nameMatches(entered.name, p.name)) out.push('name');
  if (Math.abs(entered.age - p.age) > 2) out.push('age');
  if (entered.sex !== p.sex) out.push('sex');
  if (entered.mobile !== p.mobile) out.push('mobile');
  return out;
}
