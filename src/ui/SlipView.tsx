import { Fragment, type ReactNode } from 'react';
import type { Citation, SlipField, SourceDocument } from '@/domain/types';
import { fmtSlipDate } from '@/domain/format';
import { headerLine } from '@/domain/slip';
import { cx } from './primitives';

export interface Highlight {
  id: string;
  field: SlipField;
  adviceIndex?: number;
  span?: [number, number];
  tone: 'active' | 'soft';
  label?: string;
}

export const highlightOf = (c: Citation, tone: Highlight['tone'], id = c.id, label?: string): Highlight =>
  ({ id, field: c.field, adviceIndex: c.adviceIndex, span: c.span, tone, label });

function Marked({ text, marks, onMark }: { text: string; marks: Highlight[]; onMark?: (h: Highlight) => void }) {
  if (!marks.length) return <>{text}</>;
  const spans = marks.map(m => ({ ...m, s: m.span?.[0] ?? 0, e: m.span?.[1] ?? text.length })).sort((a, b) => a.s - b.s || a.e - b.e);
  const out: ReactNode[] = []; let at = 0;
  for (const m of spans) {
    if (m.e <= at) continue;
    const s = Math.max(m.s, at);
    if (s > at) out.push(<Fragment key={`t${at}`}>{text.slice(at, s)}</Fragment>);
    out.push(
      <mark key={m.id + s} className={cx('slip__mark', `slip__mark--${m.tone}`)} data-hl={m.id} onClick={onMark ? () => onMark(m) : undefined} title={m.label}>
        {text.slice(s, m.e)}
      </mark>,
    );
    at = m.e;
  }
  if (at < text.length) out.push(<Fragment key="tail">{text.slice(at)}</Fragment>);
  return <>{out}</>;
}

/** The source document, drawn like the slip it came from, with cited regions highlighted. */
export function SlipView({ doc, highlights = [], onMark, scrollToActive }: {
  doc: SourceDocument; highlights?: Highlight[]; onMark?: (h: Highlight) => void; scrollToActive?: boolean;
}) {
  const marksFor = (field: SlipField, adviceIndex?: number) => highlights.filter(h => h.field === field && (field !== 'advice' || h.adviceIndex === adviceIndex));
  const isDx = doc.kind === 'diagnostic';
  return (
    <article className={cx('slip', isDx && 'slip--dx')} aria-label={`${doc.title}, visit ${doc.visit}`} ref={el => { if (scrollToActive && el) el.querySelector('[data-hl].slip__mark--active')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>
      <header className="slip__top">
        <span className="slip__kind">{isDx ? 'Diagnostic report' : 'Prescription'}</span>
        <span className="slip__date">{fmtSlipDate(doc.date)}</span>
        <span className="slip__abha">ABHA&nbsp;&nbsp;{doc.header.abha}</span>
      </header>
      <div className="slip__id"><Marked text={headerLine(doc)} marks={marksFor('header')} onMark={onMark} /></div>
      <dl className="slip__rows">
        <div><dt>C/O</dt><dd><Marked text={doc.complaint} marks={marksFor('complaint')} onMark={onMark} /></dd></div>
        <div><dt>I</dt><dd><Marked text={doc.investigations} marks={marksFor('investigations')} onMark={onMark} /></dd></div>
        <div><dt>Dx</dt><dd><Marked text={doc.diagnosis} marks={marksFor('diagnosis')} onMark={onMark} /></dd></div>
        <div>
          <dt>Adv</dt>
          <dd>
            <ol>
              {doc.advice.map((a, i) => <li key={i} value={i + 1}><Marked text={a} marks={marksFor('advice', i)} onMark={onMark} /></li>)}
            </ol>
          </dd>
        </div>
      </dl>
      <footer className="slip__foot"><span>{doc.doctor}</span><span>Reg. {doc.regNo}</span></footer>
      <div className="slip__banner">Synthetic / AI research data · not a real prescription</div>
    </article>
  );
}
