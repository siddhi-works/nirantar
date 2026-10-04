import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, CircleDashed, Equal, FileSearch, FileText, PencilLine, Sparkles } from 'lucide-react';
import type { AbsenceEvidence, ChangeItem, Citation, GapStatus, OrganState, Severity, VerificationState } from '@/domain/types';
import { SEVERITY_LABEL } from '@/domain/forms';
import { useUi } from './store';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

/* ───────── Card ───────── */
export function Card({ accent, className, children, style, onClick, as: As = 'section', ...rest }: {
  accent?: 'terracotta' | 'sage' | 'cerulean' | 'ink'; className?: string; children: ReactNode; style?: CSSProperties; onClick?: () => void; as?: 'section' | 'div' | 'article';
} & Record<string, unknown>) {
  return <As className={cx('card', className)} data-accent={accent} style={style} onClick={onClick} {...rest}>{children}</As>;
}
export function CardHead({ title, icon, right }: { title: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="card__head">
      <h3 className="card__title">{icon}{title}</h3>
      {right}
    </div>
  );
}

/* ───────── Chips ───────── */
export function SeverityChip({ severity, lg }: { severity: Severity; lg?: boolean }) {
  return <span className={cx('chip', `chip--${severity}`, lg && 'chip--lg')}>{SEVERITY_LABEL[severity]}</span>;
}

const GAP_STATUS: Record<GapStatus, { label: string; cls: string }> = {
  open: { label: 'No action yet', cls: 'chip--moderate' },
  tasked: { label: 'Task open', cls: 'chip--cerulean' },
  in_progress: { label: 'Action recorded', cls: 'chip--cerulean' },
  evidence: { label: 'Evidence attached', cls: 'chip--sage' },
  closed: { label: 'Closed with evidence', cls: 'chip--sage' },
};
export function GapStatusChip({ status }: { status: GapStatus }) {
  const s = GAP_STATUS[status];
  return <span className={cx('chip', s.cls)}>{status === 'closed' && <CheckCircle2 size={12} />}{s.label}</span>;
}

/** PRD three-state model — never merged; every badge carries a text label, not colour alone. */
export function StateBadge({ state, label, lg }: { state: OrganState | 'clear'; label?: string; lg?: boolean }) {
  if (state === 'confirmed') return <span className={cx('chip chip--ink', lg && 'chip--lg')}><CheckCircle2 size={12} />{label ?? 'Confirmed condition'}</span>;
  if (state === 'at-risk') return <span className={cx('chip chip--risk', lg && 'chip--lg')}><AlertTriangle size={12} />{label ?? 'At risk'}</span>;
  if (state === 'missing') return <span className={cx('chip chip--dashed', lg && 'chip--lg')}><CircleDashed size={12} />{label ?? 'Missing assessment'}</span>;
  return <span className={cx('chip chip--sage', lg && 'chip--lg')}><CheckCircle2 size={12} />{label ?? 'No signal'}</span>;
}

export function VerifyChip({ state, by }: { state: VerificationState; by?: string }) {
  if (state === 'verified' || state === 'corrected') return <span className="chip chip--sage" title={by ? `Confirmed by ${by}` : undefined}><CheckCircle2 size={12} />{state === 'corrected' ? 'Corrected' : 'Verified'}</span>;
  return <span className="chip chip--outline" title="Read from the HIS record; not yet confirmed by a clinician"><PencilLine size={12} />Imported · unverified</span>;
}

export function DraftChip({ accepted }: { accepted?: boolean }) {
  return accepted
    ? <span className="chip chip--sage"><CheckCircle2 size={12} />Accepted by clinician</span>
    : <span className="chip chip--cerulean"><Sparkles size={12} />Draft · not clinical advice</span>;
}

/* ───────── Delta ───────── */
export function Delta({ item }: { item: Pick<ChangeItem, 'direction' | 'tone' | 'delta' | 'unit'> & { decimals?: number } }) {
  const Icon = item.direction === 'down' ? ArrowDown : item.direction === 'up' ? ArrowUp : Equal;
  if (item.direction === 'first') return <span className="delta delta--new">First reading</span>;
  if (item.direction === 'new') return <span className="delta delta--new">New</span>;
  if (item.direction === 'none') return <span className="delta delta--neutral">Not written</span>;
  const dec = item.decimals ?? (item.unit === '%' ? 1 : 0);
  return (
    <span className={`delta delta--${item.tone}`}>
      <Icon size={11} strokeWidth={2.6} />
      {item.direction === 'same' ? 'No change' : Math.abs(item.delta ?? 0).toFixed(dec)}
    </span>
  );
}

/* ───────── Button ───────── */
export function Button({ variant, size, icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'secondary' | 'ghost' | 'terracotta' | 'cerulean'; size?: 'sm' | 'icon'; icon?: ReactNode;
}) {
  return (
    <button className={cx('btn', variant && `btn--${variant}`, size && `btn--${size}`, className)} {...rest}>
      {icon}{children}
    </button>
  );
}

/* ───────── Loading / empty ───────── */
export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className="skel" style={{ height: h, width: w, ...style }} aria-hidden />;
}
export function SkeletonCard({ lines = 3, h = 120 }: { lines?: number; h?: number }) {
  return (
    <div className="card" style={{ padding: 18, minHeight: h }} aria-busy="true">
      <Skeleton h={14} w="40%" />
      <div className="stack" style={{ marginTop: 14, gap: 9 }}>{Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={12} w={`${92 - i * 14}%`} />)}</div>
    </div>
  );
}
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon}<h4>{title}</h4>{children && <p>{children}</p>}</div>;
}

/* ───────── Source / citation chips ───────── */
export function docShort(docId: string): string {
  const m = /^P\d+-(RX|DX)-V(\d+)$/.exec(docId);
  if (!m) return 'Entered';
  return `${m[1] === 'RX' ? 'Rx slip' : 'Dx report'} · V${m[2]}`;
}

export function SourceChip({ citation, patientId, title, label }: { citation: Citation; patientId: string; title?: string; label?: string }) {
  const open = useUi(s => s.openSource);
  const staff = !!citation.closureRef;
  return (
    <button
      type="button" className={cx('src', staff && 'src--staff')}
      title={`Open source: “${citation.quote.slice(0, 90)}${citation.quote.length > 90 ? '…' : ''}”`}
      aria-label={`Open source: ${label ?? docShort(citation.docId)}${title ? `, ${title}` : ''}`}
      onClick={e => { e.stopPropagation(); open({ kind: 'citation', citation, patientId, title }); }}
    >
      <FileText size={11} />{label ?? (staff ? 'Staff-entered' : docShort(citation.docId))}
    </button>
  );
}

export function AbsenceChip({ absence, patientId, title }: { absence: AbsenceEvidence; patientId: string; title: string }) {
  const open = useUi(s => s.openSource);
  return (
    <button type="button" className="src src--absent" aria-label={`Show what was searched: ${title}`}
      onClick={e => { e.stopPropagation(); open({ kind: 'absence', absence, patientId, title }); }}>
      <FileSearch size={11} />Searched {absence.searchedDocIds.length} docs · 0 found
    </button>
  );
}

/** A cited value: dotted underline, click opens the source. */
export function CiteValue({ citation, patientId, children, title }: { citation?: Citation; patientId: string; children: ReactNode; title?: string }) {
  const open = useUi(s => s.openSource);
  if (!citation) return <>{children}</>;
  return (
    <button type="button" className="cite" title={`Open source: ${docShort(citation.docId)}`}
      onClick={e => { e.stopPropagation(); open({ kind: 'citation', citation, patientId, title }); }}>
      {children}
    </button>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'sage' | 'terracotta' | 'cerulean' | 'ink' }) {
  return <span className={cx('chip', tone === 'sage' && 'chip--sage', tone === 'terracotta' && 'chip--moderate', tone === 'cerulean' && 'chip--cerulean', tone === 'ink' && 'chip--ink')}>{children}</span>;
}
