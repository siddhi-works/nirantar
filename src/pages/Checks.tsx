import { CircleCheck, CircleDashed } from 'lucide-react';
import type { AbsenceEvidence, Fact, Recall } from '@/domain/types';
import { fmtDate } from '@/domain/format';
import { bmi } from '@/domain/observations';
import { latestRecorded, shownValue } from '@/domain/profile';
import { AbsenceChip, SourceChip, cx } from '@/ui/primitives';
import { Tx, useT } from '@/i18n';

interface Row { label: string; present: boolean; value?: string; sub?: string; node?: React.ReactNode }
export interface Section { title: string; rows: Row[] }

/** What is on record and what is not, with the report each value came from. No advice. */
export function buildChecks(r: Recall): Section[] {
  const pid = r.patient.id;
  const T = Object.fromEntries(r.trends.map(t => [t.code, t]));
  const m = (code: string) => r.missingMeasures.find(x => x.code === code)!;
  const gapAbs = (key: string): AbsenceEvidence | undefined => r.gaps.find(g => g.id === `${pid}:${key}`)?.triggers.find(t => t.absence)?.absence;
  const val = (code: 'hba1c' | 'fbs' | 'ppbs') => { const l = T[code].latest!; return `${l.value!.toFixed(T[code].decimals)} ${T[code].unit === '%' ? '%' : T[code].unit}`; };

  const absent = (label: string, why: string, abs?: AbsenceEvidence): Row =>
    ({ label, present: false, sub: why, node: abs ? <AbsenceChip absence={abs} patientId={pid} title={`${label}: nothing on record`} /> : undefined });
  const fromFact = (label: string, f: Fact, extra?: string): Row => ({
    label, present: true, value: shownValue(f),
    sub: `${fmtDate(f.date)} · ${f.citation.source?.kind === 'upload' ? 'from an uploaded document' : 'entered'} by ${f.verifiedBy ?? 'staff'}${extra ? ` · ${extra}` : ''}`,
    node: <SourceChip citation={f.citation} patientId={pid} />,
  });
  const recorded = (code: string, label: string, why: string, abs?: AbsenceEvidence): Row => {
    const f = latestRecorded(r, code);
    return f ? fromFact(label, f) : absent(label, why, abs);
  };

  const sugar: Row[] = (['hba1c', 'fbs', 'ppbs'] as const).map(c => ({
    label: c === 'hba1c' ? 'HbA1c' : c === 'fbs' ? 'Fasting glucose (FBS)' : 'Post-meal glucose (PPBS)', present: true, value: val(c),
    sub: `Visit ${T[c].latest!.visit}, ${fmtDate(T[c].latest!.date)}`, node: <SourceChip citation={T[c].latest!.citation!} patientId={pid} />,
  }));

  /* examination logs */
  const exam: Row[] = [
    recorded('foot', 'Foot and ulcer exam', 'No result in any slip or report', gapAbs('foot')),
    recorded('neuropathy', 'Neuropathy exam', 'No result in any slip or report'),
  ];
  const renal = r.findings.filter(f => f.group === 'renal');
  if (renal.length) {
    const f = renal.at(-1)!;
    exam.push({ label: 'Urine protein', present: true, value: f.state === 'present' ? 'Positive' : 'Within range (in words)', sub: `Visit ${f.visit} only, no number written`, node: <SourceChip citation={f.citation} patientId={pid} /> });
  } else exam.push(recorded('urine-protein', 'Urine protein', 'No result in any slip or report'));
  for (const code of ['egfr', 'uacr'] as const) {
    const x = m(code); const rd = x.readings?.[0];
    exam.push(rd ? { label: `Kidney: ${x.label}`, present: true, value: rd.display.replace(/^\w+\s/, ''), sub: `${fmtDate(rd.date)}`, node: <SourceChip citation={rd.citation} patientId={pid} /> }
      : absent(`Kidney: ${x.label}`, x.why, x.absence));
  }
  exam.push(recorded('retina', 'Retinopathy (eye exam)', 'No result in any slip or report', gapAbs('eye')));

  /* comorbidity logs */
  const bp = m('bp'); const bpr = bp.readings?.[0];
  const w = latestRecorded(r, 'weight'); const h = latestRecorded(r, 'height');
  const hisW = T.weight.latest;
  const kg = w ? Number(w.value) : hisW?.value ?? undefined;
  const cm = h ? Number(h.value) : undefined;
  const como: Row[] = [
    bpr ? { label: 'Hypertension: blood pressure', present: true, value: bpr.display.replace('BP ', ''), sub: fmtDate(bpr.date), node: <SourceChip citation={bpr.citation} patientId={pid} /> }
      : absent('Hypertension: blood pressure', bp.why, bp.absence),
    recorded('alt', 'Liver tests (LFT)', 'No result in any slip or report', gapAbs('liver')),
    (() => { const f = latestRecorded(r, 'ldl'); return f ? fromFact('Lipid profile', f, [latestRecorded(r, 'hdl'), latestRecorded(r, 'tg')].filter(Boolean).map(x => shownValue(x!)).join(', ') || undefined) : absent('Lipid profile', m('ldl').why, m('ldl').absence); })(),
    kg && cm
      ? { label: 'Obesity: weight and BMI', present: true, value: `${kg} kg · BMI ${bmi(kg, cm)}`, sub: w ? `Weight and height recorded ${fmtDate(w.date)}` : 'Height recorded, weight from the slip', node: (w ?? h) ? <SourceChip citation={(w ?? h)!.citation} patientId={pid} /> : undefined }
      : hisW && !w ? { label: 'Obesity: weight and BMI', present: false, value: `${kg} kg`, sub: 'Height is not on record, so BMI cannot be shown', node: <SourceChip citation={hisW.citation!} patientId={pid} /> }
        : absent('Obesity: weight and BMI', 'Weight and height are not on record'),
    recorded('osa-screen', 'Sleep apnoea screening', 'No result in any slip or report'),
  ];

  const sections: Section[] = [
    { title: 'Blood sugar', rows: sugar },
    { title: 'Examination logs', rows: exam },
    { title: 'Comorbidity logs', rows: como },
  ];
  const fu = r.gaps.find(g => g.id === `${pid}:followup`);
  if (fu) sections.push({ title: 'Follow-up', rows: [{ label: 'Next review date', present: false, sub: 'Latest slip says “follow-up as advised”', node: fu.triggers[0].citation ? <SourceChip citation={fu.triggers[0].citation} patientId={pid} /> : undefined }] });
  return sections;
}

export function ChecksList({ sections, plain }: { sections: Section[]; plain?: boolean }) {
  const t = useT();
  return (
    <div>
      {sections.map(s => (
        <div key={s.title}>
          <h3 className="chk__group">{t(s.title)}</h3>
          <ul className="chk">
            {s.rows.map(c => (
              <li key={c.label} className={cx(!c.present && 'is-miss')}>
                <span className="chk__i">{c.present ? <CircleCheck size={18} /> : <CircleDashed size={18} />}</span>
                <span className="grow"><b>{t(c.label)}</b>{c.value && <span className="chk__v num"> {c.value}</span>}<small>{plain && c.sub ? <Tx text={c.sub} /> : c.sub}</small></span>
                <span className={cx('chip', c.present ? 'chip--sage' : 'chip--dashed')}>{c.present ? t('On record') : t('Not on record')}</span>
                {!plain && c.node}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
