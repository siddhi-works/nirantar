import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Camera, CheckCircle2, Loader2, LogOut, Search, UserSearch } from 'lucide-react';
import { api } from '@/api';
import { digits, formatAbha, useSession } from '@/session';
import { useUi } from '@/ui/store';
import { cx } from '@/ui/primitives';
import { LangToggle } from '@/i18n/controls';
import { useT } from '@/i18n';
import { NavMenu } from './NavMenu';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#4FA8A0" />
      <path d="M5 18h5l3-7 4 13 3-9 2 3h5" fill="none" stroke="#173140" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
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

export const VIEWS = {
  staff: [{ view: 'main' as const, label: 'Workspace' }, { view: 'share' as const, label: 'Network and sharing' }],
  patient: [{ view: 'main' as const, label: 'My record' }, { view: 'share' as const, label: 'Sharing' }],
};
const SHARE_PARTS = new Set(['network', 'qr', 'updates', 'sharing']);

/** Scrolls to a part of the app, switching to the other view first when that part lives there. */
export function jumpTo(id: string) {
  useSession.getState().setView(SHARE_PARTS.has(id) ? 'share' : 'main');
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

/** A person's photo if they added one, otherwise their initial. */
export function Avatar({ name, photo, size = 'sm' }: { name?: string; photo?: string | null; size?: 'sm' | 'md' }) {
  const initial = name?.replace(/^(Mrs?|Dr|Nurse)\.?\s*/, '')[0] ?? '';
  return photo
    ? <img className={cx('avatar', size === 'sm' && 'avatar--sm', 'avatar--img')} src={photo} alt="" />
    : <span className={cx('avatar', size === 'sm' && 'avatar--sm')} aria-hidden="true">{initial}</span>;
}

/** Shrinks a chosen picture to a small square JPEG in the browser, so the server only ever stores a small file. */
async function squareJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return c.toDataURL('image/jpeg', 0.85);
}

function ProfileMenu() {
  const { user, logout, setPhotoVersion } = useSession();
  const toast = useUi(s => s.toast);
  const t = useT();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const photo = user?.photoVersion ? `/api/me/photo?v=${user.photoVersion}` : null;
  const pick = async (f?: File) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast(t('Choose a JPG, PNG or WebP picture.'), 'error'); return; }
    if (f.size > 8_000_000) { toast(t('That picture is too large. Choose one under 8 MB.'), 'error'); return; }
    setBusy(true);
    try { const v = await api.setPhoto(await squareJpeg(f)); setPhotoVersion(v); toast(t('Photo saved.')); }
    catch (e) { toast(e instanceof Error ? e.message : t('Could not save the photo.'), 'error'); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [on]);
  return (
    <div className="pmenu">
      <button type="button" className="pmenu__btn" aria-expanded={on} aria-haspopup="true" onClick={() => setOn(!on)} aria-label={t('Your profile')}>
        <Avatar name={user?.name} photo={photo} />
        <span className="pmenu__who"><b translate="no">{user?.name}</b><small translate="no">{user?.line}</small></span>
      </button>
      {on && (
        <div className="pmenu__pop" role="menu">
          <div className="pmenu__head"><Avatar name={user?.name} photo={photo} size="md" /><span><b translate="no">{user?.name}</b><small translate="no">{user?.line}</small></span></div>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => file.current?.click()}><Camera size={14} />{photo ? t('Change photo') : t('Add a photo')}</button>
          {photo && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={async () => { await api.removePhoto(); setPhotoVersion(null); }}>{t('Remove photo')}</button>}
          <hr className="hr" />
          <FeedbackLink />
          <FreshStart />
          <button type="button" className="btn btn--sm" onClick={logout}><LogOut size={14} />{t('Log out')}</button>
        </div>
      )}
    </div>
  );
}

/** The one header on every signed-in screen: the brand, the two views, language, and the profile menu. */
export function TopBar({ right }: { right?: ReactNode }) {
  const { user, view, setView, openId } = useSession();
  const t = useT();
  const views = user?.role === 'patient' ? VIEWS.patient : VIEWS.staff;
  return (
    <header className="bar">
      <div className="bar__row">
        {user && user.role !== 'patient' && <NavMenu />}
        <div className="bar__brand"><Logo size={36} /><span>Nirantar<small>{t('Diabetes record')}</small></span></div>
        <nav className="bar__links" aria-label={t('Views')}>
          {views.map(v => <button key={v.view} type="button" aria-current={!openId && view === v.view ? 'page' : undefined} className={!openId && view === v.view ? 'is-on' : ''} onClick={() => { setView(v.view); window.scrollTo({ top: 0 }); }}>{t(v.label)}</button>)}
        </nav>
        <div className="grow" />
        {right}
        <LangToggle />
        <ProfileMenu />
      </div>
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
