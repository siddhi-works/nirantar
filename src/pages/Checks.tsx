import { CircleCheck, CircleDashed } from 'lucide-react';
import type { Recall } from '@/domain/types';
import { fmtDate } from '@/domain/format';
import { AbsenceChip, SourceChip, cx } from '@/ui/primitives';
import type { Vitals } from '@/session';

interface Row { label: string; present: boolean; value?: string; sub?: string; node?: React.ReactNode }

/** What is on record and what is not — with the report each value came from. No advice. */
export function buildChecks(r: Recall, vitals: Vitals | null): Row[] {
  const pid = r.patient.id;
  const T = Object.fromEntries(r.trends.map(t => [t.code, t]));
  const rows: Row[] = [];
  const m = (code: string) => r.missingMeasures.find(x => x.code === code)!;
  const gapAbs = (key: string) => r.gaps.find(g => g.id === `${pid}:${key}`)?.triggers.find(t => t.absence)?.absence;
  const val = (code: 'hba1c' | 'fbs' | 'ppbs' | 'weight') => { const l = T[code].latest!; return `${l.value!.toFixed(T[code].decimals)} ${T[code].unit === '%' ? '%' : T[code].unit}`; };

  rows.push({ label: 'HbA1c', present: true, value: val('hba1c'), sub: `Visit ${T.hba1c.latest!.visit}, ${fmtDate(T.hba1c.latest!.date)}`, node: <SourceChip citation={T.hba1c.latest!.citation!} patientId={pid} /> });
  rows.push({ label: 'Fasting glucose (FBS)', present: true, value: val('fbs'), sub: `Visit ${T.fbs.latest!.visit}, ${fmtDate(T.fbs.latest!.date)}`, node: <SourceChip citation={T.fbs.latest!.citation!} patientId={pid} /> });
  rows.push({ label: 'Post-meal glucose (PPBS)', present: true, value: val('ppbs'), sub: `Visit ${T.ppbs.latest!.visit}, ${fmtDate(T.ppbs.latest!.date)}`, node: <SourceChip citation={T.ppbs.latest!.citation!} patientId={pid} /> });
  rows.push({ label: 'Weight', present: true, value: val('weight'), sub: 'From the slip header', node: <SourceChip citation={T.weight.latest!.citation!} patientId={pid} /> });

  const renal = r.findings.filter(f => f.group === 'renal');
  if (renal.length) {
    const f = renal.at(-1)!;
    rows.push({ label: 'Urine protein / renal function', present: true, value: f.state === 'present' ? 'Positive' : 'Within range (in words)', sub: `Visit ${f.visit} only — no number written`, node: <SourceChip citation={f.citation} patientId={pid} /> });
  }
  for (const code of ['egfr', 'uacr'] as const) {
    const x = m(code);
    const rd = x.readings?.[0];
    rows.push(rd ? { label: x.label, present: true, value: rd.display, node: <SourceChip citation={rd.citation} patientId={pid} /> }
      : { label: x.label, present: false, sub: x.why, node: <AbsenceChip absence={x.absence} patientId={pid} title={`${x.label} — nothing on record`} /> });
  }
  const bp = m('bp');
  rows.push(vitals?.patientId === pid
    ? { label: 'Blood pressure', present: true, value: `${vitals.sbp}/${vitals.dbp} mmHg`, sub: `Recorded today by ${vitals.by}` }
    : { label: 'Blood pressure', present: false, sub: bp.why, node: <AbsenceChip absence={bp.absence} patientId={pid} title="Blood pressure — nothing on record" /> });
  const ldl = m('ldl');
  rows.push({ label: 'Cholesterol (lipid profile)', present: false, sub: ldl.why, node: <AbsenceChip absence={ldl.absence} patientId={pid} title="Lipid profile — nothing on record" /> });
  for (const [key, label] of [['eye', 'Eye (retina) exam'], ['foot', 'Foot exam'], ['liver', 'Liver tests']] as const) {
    const a = gapAbs(key);
    if (a) rows.push({ label, present: false, sub: 'No result in any slip or report', node: <AbsenceChip absence={a} patientId={pid} title={`${label} — nothing on record`} /> });
  }
  const fu = r.gaps.find(g => g.id === `${pid}:followup`);
  if (fu) rows.push({ label: 'Next review date', present: false, sub: 'Latest slip says “follow-up as advised”', node: fu.triggers[0].citation ? <SourceChip citation={fu.triggers[0].citation} patientId={pid} /> : undefined });
  return rows;
}

export function ChecksList({ rows, plain }: { rows: Row[]; plain?: boolean }) {
  return (
    <ul className="chk">
      {rows.map(c => (
        <li key={c.label} className={cx(!c.present && 'is-miss')}>
          <span className="chk__i">{c.present ? <CircleCheck size={18} /> : <CircleDashed size={18} />}</span>
          <span className="grow"><b>{c.label}</b>{c.value && <span className="chk__v num"> {c.value}</span>}<small>{c.sub}</small></span>
          <span className={cx('chip', c.present ? 'chip--sage' : 'chip--dashed')}>{c.present ? 'On record' : 'Not on record'}</span>
          {!plain && c.node}
        </li>
      ))}
    </ul>
  );
}
