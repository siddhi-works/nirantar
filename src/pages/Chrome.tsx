import { useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Bell, CalendarClock, CheckCircle2, FlaskConical, Loader2, LogOut, MessageSquare, Search, UserSearch } from 'lucide-react';
import { api } from '@/api';
import { digits, formatAbha, useSession } from '@/session';
import { useUi } from '@/ui/store';
import { KIND_LABEL, SAMPLE_PATIENTS, type Slot } from '@/data/demo';
import { cx } from '@/ui/primitives';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#F7F5F0" />
      <path d="M5 19c4-9 7-9 11 0s7 9 11 0" fill="none" stroke="#1A2F33" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="19" r="2.5" fill="#C26D5C" />
    </svg>
  );
}

const FEEDBACK_URL: string = import.meta.env.VITE_FEEDBACK_URL ?? '';

/** Clears this tester's own uploads and changes. Other testers' sample spaces are not touched. */
function FreshStart() {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useUi(s => s.toast);
  const go = async () => {
    setBusy(true);
    try { await api.freshWorkspace(); location.reload(); } catch { toast('Could not start fresh. Try again in a minute.', 'error'); setBusy(false); setAsk(false); }
  };
  if (!ask) return <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAsk(true)} title="Your uploads and changes are private to this browser. This clears them.">Start with fresh sample data</button>;
  return (
    <span className="row" style={{ gap: 6 }} role="group" aria-label="Confirm starting fresh">
      <small>Clear your uploads and changes?</small>
      <button type="button" className="btn btn--sm" onClick={go} disabled={busy}>{busy ? 'Clearing…' : 'Yes, clear them'}</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAsk(false)} disabled={busy}>No</button>
    </span>
  );
}

export const FeedbackLink = () => FEEDBACK_URL
  ? <a className="btn btn--ghost btn--sm" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give feedback</a>
  : null;

export function TopBar({ right }: { right?: ReactNode }) {
  const { user, logout } = useSession();
  return (
    <header className="bar">
      <div className="bar__brand"><Logo size={30} /><span>Nirantar</span></div>
      <div className="grow" />
      {right}
      <FeedbackLink />
      <FreshStart />
      <div className="bar__user">
        <span className="avatar avatar--sm">{user?.name.replace(/^(Mrs?|Dr|Nurse)\.?\s*/, '')[0]}</span>
        <span><b>{user?.name}</b><small>{user?.line}</small></span>
      </div>
      <button className="btn btn--secondary btn--sm" onClick={logout}><LogOut size={14} />Log out</button>
    </header>
  );
}

export function Toasts() {
  const toasts = useUi(s => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={cx('toast', t.tone === 'error' && 'toast--error')}>{t.tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{t.msg}</div>)}
    </div>
  );
}

export const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** The one way into a patient record: enter the unique ABHA number. */
export function LookupPanel({ title }: { title: string }) {
  const openPatient = useSession(s => s.openPatient);
  const [name, setName] = useState('');
  const [abha, setAbha] = useState('');
  const [state, setState] = useState<'idle' | 'fetching' | 'notfound'>('idle');
  const [found, setFound] = useState<string | null>(null);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digits(abha).length !== 14) { setState('notfound'); setFound(null); return; }
    setState('fetching');
    try {
      const hit = await api.lookup(abha);
      setFound(hit.name); setName(hit.name);
      setTimeout(() => { setState('idle'); openPatient(hit.patientId); }, 650);
    } catch {
      setState('notfound'); setFound(null);
    }
  };

  return (
    <section className="card lookup" data-accent="ink">
      <div className="lookup__head"><UserSearch size={20} /><div><h2>{title}</h2><p>Enter the patient’s ABHA number to fetch their record from the national health exchange.</p></div></div>
      <form onSubmit={go} className="lookup__form">
        <div className="field"><label htmlFor="pn">Patient name</label>
          <input id="pn" className="input" placeholder="Fills in after lookup" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="pa">ABHA number</label>
          <input id="pa" className="input" inputMode="numeric" placeholder="XX-XXXX-XXXX-XXXX" value={abha} onChange={e => { setAbha(formatAbha(e.target.value)); setState('idle'); setFound(null); }} /></div>
        <button className="btn" disabled={state === 'fetching' || !abha}>
          {state === 'fetching' ? <><Loader2 size={15} className="spin" />Fetching record…</> : <><Search size={15} />Open record</>}
        </button>
      </form>
      <div className="samples" aria-label="Sample patients for testing">
        <span className="eyebrow">Sample patients for testing</span>
        {SAMPLE_PATIENTS.map(p => (
          <div key={p.abha} className="samples__row">
            <span><b>{p.name}</b> <code>{p.abha}</code></span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setAbha(p.abha); setName(''); setState('idle'); setFound(null); }}>Use this number</button>
          </div>
        ))}
      </div>
      {found && <div className="lookup__ok"><CheckCircle2 size={16} />Record found — {found}. Opening…</div>}
      {state === 'notfound' && <div className="lookup__err"><AlertTriangle size={16} />No record found for this ABHA number. Check the 14 digits and try again.</div>}
    </section>
  );
}

const NOTE_ICON = { lab: FlaskConical, msg: MessageSquare, alert: AlertTriangle, cal: CalendarClock } as const;
export function Notifications({ items }: { items: { icon: keyof typeof NOTE_ICON; title: string; sub: string; time: string }[] }) {
  return (
    <section className="card" data-accent="terracotta">
      <div className="card__head"><h2 className="card__title"><Bell size={16} />Notifications</h2><span className="chip chip--outline">{items.length} new</span></div>
      <ul className="notes">
        {items.map(n => { const I = NOTE_ICON[n.icon]; return (
          <li key={n.title} className={cx(n.icon === 'alert' && 'is-alert')}><span className="notes__i"><I size={16} /></span><span className="grow"><b>{n.title}</b><small>{n.sub}</small></span><time>{n.time}</time></li>
        ); })}
      </ul>
    </section>
  );
}

export function Schedule({ title, rows }: { title: string; rows: Slot[] }) {
  return (
    <section className="card" data-accent="cerulean">
      <div className="card__head"><h2 className="card__title"><CalendarClock size={16} />{title}</h2><span className="chip chip--outline">{today()}</span></div>
      <ul className="sched">
        {rows.map(r => (
          <li key={r.time + r.title}>
            <time className="num">{r.time}</time>
            <span className="grow"><b>{r.title}</b><small>{r.sub}</small></span>
            <span className={cx('chip', `kind kind--${r.kind}`)}>{KIND_LABEL[r.kind]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}


/** What a screen shows when its data could not be loaded: the reason, a retry, and a way back. */
export function LoadError({ message, onRetry, onBack }: { message: string; onRetry: () => void; onBack?: () => void }) {
  return (
    <div className="screen">
      <TopBar />
      <main className="wrap wrap--narrow">
        <section className="card" data-accent="terracotta" role="alert">
          <div className="card__head"><h2 className="card__title"><AlertTriangle size={16} />This page could not be opened</h2></div>
          <div className="card__body">
            <p>{message}</p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={onRetry}>Try again</button>
              {onBack && <button className="btn btn--secondary" onClick={onBack}>Back to the dashboard</button>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
