import { useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FileText, HeartPulse, Home, LayoutDashboard, Loader2, LogOut, Network, QrCode, Search, Share2, UserPlus, UserSearch, Users, type LucideIcon } from 'lucide-react';
import { api } from '@/api';
import { digits, formatAbha, useSession } from '@/session';
import { useUi } from '@/ui/store';
import { cx } from '@/ui/primitives';
import { LangToggle } from '@/i18n/controls';
import { FACILITY, OTHER_FACILITY } from '@/data/demo';
import { useT } from '@/i18n';
import { navFor, useNav, useSection } from '@/ui/nav';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1B5FAA" />
      <path d="M5 18h5l3-7 4 13 3-9 2 3h5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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

const ICONS: Record<string, LucideIcon> = {
  layout: LayoutDashboard, users: Users, userplus: UserPlus, network: Network, qr: QrCode,
  home: Home, heart: HeartPulse, file: FileText, share: Share2,
};

/** The frame around every signed-in screen: a sidebar on laptops, a tab bar on phones, and a slim bar with the page context. */
export function TopBar({ right }: { right?: ReactNode }) {
  const { user, logout, closePatient, openId } = useSession();
  const t = useT();
  const section = useSection();
  const setSection = useNav(s => s.setSection);
  const items = navFor(user?.role);
  const here = items.find(i => i.k === section);
  const go = (k: string) => { setSection(k); if (openId) closePatient(); window.scrollTo({ top: 0 }); };
  const active = openId && user?.role !== 'patient' ? '' : section;
  const initial = user?.name.replace(/^(Mrs?|Dr|Nurse)\.?\s*/, '')[0];
  return (
    <>
      <aside className="side" aria-label={t('Main menu')}>
        <div className="side__brand"><Logo size={32} /><span>Nirantar</span></div>
        <div className="side__org">
          <small>{user?.role === 'patient' ? t('Your health record') : t('Signed in at')}</small>
          <b translate="no">{user?.role === 'patient' ? (user?.line ?? '') : (user?.hfrId === OTHER_FACILITY.hfr ? OTHER_FACILITY.name : FACILITY.name)}</b>
        </div>
        <nav className="side__nav">
          {items.map(i => { const Icon = ICONS[i.icon]; return (
            <button key={i.k} type="button" className={cx('side__item', active === i.k && 'is-on')} aria-current={active === i.k ? 'page' : undefined} onClick={() => go(i.k)}><Icon size={18} />{t(i.label)}</button>
          ); })}
        </nav>
        <div className="side__foot">
          <LangToggle />
          <FeedbackLink />
          <FreshStart />
          <div className="side__user"><span className="avatar avatar--sm">{initial}</span><span><b translate="no">{user?.name}</b><small translate="no">{user?.line}</small></span></div>
          <button className="side__out" onClick={logout}><LogOut size={15} />{t('Log out')}</button>
        </div>
      </aside>
      <header className="bar">
        <div className="bar__brand"><Logo size={26} /><span>Nirantar</span></div>
        <div className="bar__ctx"><h1 className="bar__title">{openId && user?.role !== 'patient' ? t('Patient record') : here ? t(here.label) : ''}</h1><small>{today()}</small></div>
        <div className="grow" />
        {right}
        <span className="bar__mob"><LangToggle /></span>
        <button className="bar__me" onClick={logout} aria-label={t('Log out')} title={t('Log out')}><span className="avatar avatar--sm">{initial}</span></button>
      </header>
      <nav className="tabbar" aria-label={t('Main menu')}>
        {items.map(i => { const Icon = ICONS[i.icon]; return (
          <button key={i.k} type="button" className={cx(active === i.k && 'is-on')} aria-current={active === i.k ? 'page' : undefined} onClick={() => go(i.k)}><Icon size={20} /><span>{t(i.label)}</span></button>
        ); })}
      </nav>
    </>
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
      {found && <div className="lookup__ok"><CheckCircle2 size={16} />Record found — {found}. Opening…</div>}
      {state === 'notfound' && <div className="lookup__err"><AlertTriangle size={16} />No record found for this ABHA number. Check the 14 digits and try again.</div>}
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
