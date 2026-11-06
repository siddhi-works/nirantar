import { useState } from 'react';
import { ArrowRight, FileSearch, HeartHandshake, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Tabs } from '@/ui/Tabs';
import { api } from '@/api';
import { CREDENTIALS, FACILITY, OTHER_DOCTOR, OTHER_FACILITY } from '@/data/demo';
import { formatAbha, useSession, type AppRole } from '@/session';
import { useUi } from '@/ui/store';
import { FeedbackLink, Logo } from './Chrome';
import { useLang, useT } from '@/i18n';
import { LangToggle } from '@/i18n/controls';

const TABS: { k: AppRole; label: string; icon: typeof Stethoscope }[] = [
  { k: 'doctor', label: 'Doctor', icon: Stethoscope },
  { k: 'nurse', label: 'Nurse', icon: HeartHandshake },
  { k: 'patient', label: 'Patient', icon: UserRound },
];

/** Anyone can ask what a term means. Answers are general information from a fixed glossary and never about a person. */
function GlossaryHelper() {
  const lang = useLang(s => s.lang);
  const [q, setQ] = useState('');
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = async (text: string) => {
    if (text.trim().length < 2 || busy) return;
    setBusy(true);
    try { const r = await api.askGeneral(text.trim(), lang); setA(r.answer); } catch (e) { setA(e instanceof Error ? e.message : 'Could not answer now.'); } finally { setBusy(false); }
  };
  return (
    <section className="login__pane" aria-label="What does this term mean?">
      <h2>What does a term mean?</h2>
      <p className="hint">General information only, for everyone, without signing in. It is not about you and is not medical advice.</p>
      <div className="ask__chips">{['What is HbA1c?', 'What is eGFR?', 'What is LDL?'].map(s => <button key={s} type="button" className="chip chip--outline" onClick={() => { setQ(s); void ask(s); }}>{s}</button>)}</div>
      <form className="row" style={{ gap: 8, marginTop: 8 }} onSubmit={e => { e.preventDefault(); void ask(q); }}>
        <input className="input grow" value={q} maxLength={200} onChange={e => setQ(e.target.value)} placeholder="Type a term, for example uACR" aria-label="Type a term" />
        <button className="btn" disabled={busy || q.trim().length < 2}>Ask</button>
      </form>
      {a && <p aria-live="polite" style={{ marginTop: 8 }}>{a}</p>}
    </section>
  );
}

export default function Login() {
  const t = useT();
  const login = useSession(s => s.login);
  const setRole = useUi(s => s.setRole);
  const [role, setTab] = useState<AppRole>('doctor');
  const [vals, setVals] = useState({
    doctorId: CREDENTIALS.doctor.id, nurseId: CREDENTIALS.nurse.id, facility: FACILITY.hfr,
    abha: CREDENTIALS.patient.abha,
  });
  const [pane, setPane] = useState<'in' | 'tour' | 'terms'>('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof vals, v: string) => setVals(s => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const user = await api.verifyOtp(role === 'patient'
        ? { role, abha: vals.abha }
        : { role, hprId: role === 'doctor' ? vals.doctorId : vals.nurseId, hfrId: vals.facility });
      if (role !== 'patient') setRole(role);
      login(user);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <aside className="login__brand">
        <div className="login__logo"><Logo size={40} /><span>Nirantar</span></div>
        <h1>{t('Care that doesn’t lose the thread between visits.')}</h1>
        <p>{t('One continuous, evidence-linked diabetes record for the clinic and the patient.')}</p>
        <div className="proof login__proof" aria-label="How a value is linked to its source">
          <div className="proof__row"><span className="proof__v num">7.4<small>%</small></span><span className="proof__l">HbA1c · illustration, not a patient record</span></div>
          <div className="proof__src"><FileSearch size={16} /><span>Read from <b>prescription slip, visit 3</b>. Select it to see the line.</span></div>
          <span className="proof__tag">{t('Every value traces back to the slip it came from')}</span>
        </div>
        <ul className="login__facts">
          <li><ShieldCheck size={18} />{t('Missing tests are shown, never left blank')}</li>
          <li><ShieldCheck size={18} />{t('Doctor, nurse and patient each see what they need')}</li>
        </ul>
        <small>Prototype · all names, IDs and numbers are synthetic dummy data</small>
      </aside>

      <main className="login__panel">
        <div className="login__box">
          <Tabs label="Sign in, tour or glossary" value={pane} onChange={setPane} tabs={[{ k: 'in', label: t('Sign in') }, { k: 'tour', label: t('Take the tour') }, { k: 'terms', label: t('What does a term mean?') }]} />
          {pane === 'in' && <form className="login__pane" onSubmit={submit}>
            <div className="spread"><h2>{t('Sign in')}</h2><LangToggle /></div>
            <p className="muted">{t('Choose how you are signing in.')}</p>
            <div className="login__tabs" role="tablist">
              {TABS.map(tab => (
                <button type="button" key={tab.k} role="tab" aria-selected={role === tab.k} className={role === tab.k ? 'is-on' : ''} onClick={() => setTab(tab.k)}>
                  <tab.icon size={16} />{t(tab.label)}
                </button>
              ))}
            </div>

            {role === 'doctor' && (
              <>
                <div className="field"><label htmlFor="hpr">HPR ID <span className="muted">(Healthcare Professionals Registry)</span></label>
                  <input id="hpr" className="input" value={vals.doctorId} onChange={e => set('doctorId', e.target.value)} /></div>
                <div className="field"><label htmlFor="hfr">Hospital / facility ID <span className="muted">(HFR)</span></label>
                  <input id="hfr" className="input" value={vals.facility} onChange={e => set('facility', e.target.value)} /><span className="hint">{vals.facility === OTHER_FACILITY.hfr ? OTHER_FACILITY.name : FACILITY.name}</span></div>
                <button type="button" className="linklike" onClick={() => setVals(v => v.facility === OTHER_FACILITY.hfr ? { ...v, doctorId: CREDENTIALS.doctor.id, facility: FACILITY.hfr } : { ...v, doctorId: OTHER_DOCTOR.id, facility: OTHER_FACILITY.hfr })}>{vals.facility === OTHER_FACILITY.hfr ? `Switch back to ${FACILITY.name}` : `Sign in as a doctor at another hospital (${OTHER_FACILITY.name})`}</button>
              </>
            )}
            {role === 'nurse' && (
              <>
                <div className="field"><label htmlFor="hprn">HPR ID <span className="muted">(Healthcare Professionals Registry)</span></label>
                  <input id="hprn" className="input" value={vals.nurseId} onChange={e => set('nurseId', e.target.value)} /></div>
                <div className="field"><label htmlFor="hfrn">Hospital / facility ID <span className="muted">(HFR)</span></label>
                  <input id="hfrn" className="input" value={vals.facility} onChange={e => set('facility', e.target.value)} /><span className="hint">{FACILITY.name}</span></div>
              </>
            )}
            {role === 'patient' && (
              <div className="field"><label htmlFor="abha">{t('ABHA number')}</label>
                <input id="abha" className="input" inputMode="numeric" value={vals.abha} onChange={e => set('abha', formatAbha(e.target.value))} /><span className="hint">{t('14-digit Ayushman Bharat Health Account number')}</span></div>
            )}

            <button className="btn login__go" disabled={busy}>{busy ? t('Signing in…') : <>{t('Log in')} <ArrowRight size={16} /></>}</button>
            {err && <div className="error-text" role="alert">{err}</div>}
            <p className="hint" style={{ textAlign: 'center' }}>Sample details are filled in. Just press the button.</p>
          </form>}
          {pane === 'tour' && (
            <div className="login__pane">
              <div className="tourbox">
<p>Everything on this site is sample data. Your uploads and changes are private to this browser, so other people testing the site never see them.</p>
          <ol className="tourlist">
            <li><b>Doctor</b> (filled in already): sign in, then open a patient by ABHA number. Use <code>91-2612-3348-1056</code> (Mr. Rajesh Kumar Singh) or <code>14-7004-8821-5590</code> (Mrs. Savitri Devi Pandey).</li>
            <li>Click a point on a chart, or a source chip, to see the slip a value came from. Choose “Correct value” to see that the original stays on record.</li>
            <li>Choose “Upload document”, then “Use the sample prescription”. Confirm, correct or reject what was read from it.</li>
            <li>Log out, then use “Sign in as a doctor at another hospital”. Its queue and patient list show patients whose record is held elsewhere. Choose “Request access” for one of them.</li>
            <li>Log out and choose <b>Patient</b> with that patient's ABHA number. The request is waiting. Allow it, and you can narrow what is shared and for how long.</li>
            <li>Log out, sign in again as the other hospital's doctor and open the record. The copy arrives encrypted and read-only, as a full dashboard. Patients can also scan a hospital's QR code from their own page.</li>
          </ol>
          <p>The English and Hindi buttons switch the language on the patient screens. “Start with fresh sample data” in the top bar clears your changes.</p>
                        </div>
              <FeedbackLink />
            </div>
          )}
          {pane === 'terms' && <GlossaryHelper />}
        </div>
      </main>
    </div>
  );
}
