import { OBS_BY_CODE, checkValue } from '../../src/domain/observations';

export interface Candidate {
  code: string;
  value: number | string;
  quote: string;
  page: number;
  date: string | null;
  /** Set when the value is outside the plausible range for its measure. It is kept so a person can look at the page. */
  flagged?: string;
}

const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,2})?)`;
const SEP = String.raw`[^\dA-Za-z]{0,6}`; // dash, colon, arrow, spaces between a label and its number

type Rule = { code: string; re: RegExp; pick?: (m: RegExpExecArray) => number | string };

const num = (s: string) => Number(s.replace(',', '.'));
const RULES: Rule[] = [
  { code: 'hba1c', re: new RegExp(String.raw`\b(?:hb\s?a1c|glyc(?:o|a)sylated\s+h(?:a)?emoglobin|a1c)\b${SEP}${NUM}\s*%?`, 'i') },
  { code: 'fbs', re: new RegExp(String.raw`\b(?:fbs|fbg|fasting\s+(?:blood\s+)?(?:sugar|glucose))\b${SEP}${NUM}`, 'i') },
  { code: 'ppbs', re: new RegExp(String.raw`\b(?:ppbs|pp\s?bs|ppg|post[\s-]?(?:prandial|meal)\s+(?:blood\s+)?(?:sugar|glucose))\b${SEP}${NUM}`, 'i') },
  { code: 'ldl', re: new RegExp(String.raw`\bldl(?:[\s-]?c)?(?:\s+cholesterol)?\b${SEP}${NUM}`, 'i') },
  { code: 'hdl', re: new RegExp(String.raw`\bhdl(?:[\s-]?c)?(?:\s+cholesterol)?\b${SEP}${NUM}`, 'i') },
  { code: 'tg', re: new RegExp(String.raw`\b(?:triglycerides?|tg)\b${SEP}${NUM}`, 'i') },
  { code: 'egfr', re: new RegExp(String.raw`\begfr\b${SEP}${NUM}`, 'i') },
  { code: 'uacr', re: new RegExp(String.raw`\b(?:uacr|acr|urine\s+albumin[\s/-]*creatinine\s+ratio)\b${SEP}${NUM}`, 'i') },
  { code: 'alt', re: new RegExp(String.raw`\b(?:alt|sgpt)\b${SEP}${NUM}`, 'i') },
  { code: 'pulse', re: new RegExp(String.raw`\b(?:pulse|heart\s+rate)\b${SEP}${NUM}`, 'i') },
  { code: 'weight', re: new RegExp(String.raw`\b(?:wt|weight)\b${SEP}${NUM}\s*kg`, 'i') },
  { code: 'height', re: new RegExp(String.raw`\b(?:ht|height)\b${SEP}${NUM}\s*cm`, 'i') },
  { code: 'retina', re: /\b(non[\s-]?proliferative(?:\s+diabetic)?\s+retinopathy|proliferative(?:\s+diabetic)?\s+retinopathy|no\s+(?:diabetic\s+)?retinopathy)\b/i,
    pick: m => /^non/i.test(m[1]) ? 'non-proliferative retinopathy' : /^no\s/i.test(m[1]) ? 'no retinopathy' : 'proliferative retinopathy' },
];
const BP = new RegExp(String.raw`\b(?:bp|blood\s+pressure)\b${SEP}(\d{2,3})\s*/\s*(\d{2,3})`, 'i');
const DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/;

/** First date written on a page (day first, as Indian slips and reports write it), as YYYY-MM-DD. */
export function pageDate(text: string): string | null {
  const m = DATE.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const snippet = (text: string, m: RegExpExecArray) => {
  let a = Math.max(0, m.index - 14); let b = Math.min(text.length, m.index + m[0].length + 16);
  while (a > 0 && a < m.index && /\w/.test(text[a - 1]) && /\w/.test(text[a])) a++; // do not start or end in the middle of a word
  while (b < text.length && b > m.index + m[0].length && /\w/.test(text[b - 1]) && /\w/.test(text[b])) b--;
  return text.slice(a, b).replace(/\s+/g, ' ').trim();
};

/**
 * Finds recognisable measurements in the text of one page. It only reads what is written: a value that is not
 * there is never guessed, and an implausible value is kept but flagged so a person looks at the original.
 */
export function extractValues(text: string, page: number): Candidate[] {
  const date = pageDate(text);
  const out: Candidate[] = [];
  const push = (code: string, value: number | string, quote: string) => {
    const c = checkValue(code, value);
    out.push({ code, value, quote, page, date, flagged: c.ok ? undefined : c.error });
  };
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    const seen = new Set<string>();
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const value = rule.pick ? rule.pick(m) : num(m[1]);
      const key = String(value);
      if (seen.has(key)) continue;
      seen.add(key);
      push(rule.code, value, snippet(text, m));
    }
  }
  const bp = BP.exec(text);
  if (bp) {
    const q = snippet(text, bp);
    push('sbp', Number(bp[1]), q);
    push('dbp', Number(bp[2]), q);
  }
  return out.filter(c => OBS_BY_CODE[c.code]).slice(0, 40);
}
