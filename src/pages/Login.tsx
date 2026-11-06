import { useState } from 'react';
import { ArrowRight, HeartHandshake, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { api } from '@/api';
import { CREDENTIALS, FACILITY, OTHER_DOCTOR, OTHER_FACILITY } from '@/data/demo';
import { formatAbha, useSession, type AppRole } from '@/session';
import { useUi } from '@/ui/store';
import { FeedbackLink, Logo } from './Chrome';
import { useT } from '@/i18n';
import { LangToggle } from '@/i18n/controls';

const TABS: { k: AppRole; label: string; icon: typeof Stethoscope }[] = [
  { k: 'doctor', label: 'Doctor', icon: Stethoscope },
  { k: 'nurse', label: 'Nurse', icon: HeartHandshake },
  { k: 'patient', label: 'Patient', icon: UserRound },
];

export default function Login() {
  const t = useT();
  const login = useSession(s => s.login);
  const setRole = useUi(s => s.setRole);
  const [role, setTab] = useState<AppRole>('doctor');
  const [vals, setVals] = useState({
    doctorId: CREDENTIALS.doctor.id, nurseId: CREDENTIALS.nurse.id, facility: FACILITY.hfr,
    abha: CREDENTIALS.patient.abha,
  });
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
        <ul>
          <li><ShieldCheck size={18} />{t('Every value traces back to the slip it came from')}</li>
          <li><ShieldCheck size={18} />{t('Missing tests are shown, never left blank')}</li>
          <li><ShieldCheck size={18} />{t('Doctor, nurse and patient each see what they need')}</li>
        </ul>
        <small>Prototype · all names, IDs and numbers are synthetic dummy data</small>
      </aside>

      <main className="login__panel">
        <form className="login__card" onSubmit={submit}>
          <div className="spread"><h2>{t('Welcome back')}</h2><LangToggle /></div>
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
        </form>

        <details className="tour card">
          <summary>New here? Take the two-minute tour</summary>
          <p>Everything on this site is sample data. Your uploads and changes are private to this browser, so other people testing the site never see them.</p>
          <ol>
            <li><b>Doctor</b> (filled in already): sign in, then open a patient by ABHA number. Use <code>91-2612-3348-1056</code> (Mr. Rajesh Kumar Singh) or <code>14-7004-8821-5590</code> (Mrs. Savitri Devi Pandey).</li>
            <li>Click a point on a chart, or a source chip, to see the slip a value came from. Choose “Correct value” to see that the original stays on record.</li>
            <li>Choose “Upload document”, then “Use the sample prescription”. Confirm, correct or reject what was read from it.</li>
            <li>Log out and choose <b>Patient</b> with <code>91-2612-3348-1056</code>. A request from another hospital is waiting. Allow it.</li>
            <li>Log out, then use “Sign in as a doctor at another hospital” and fetch the record. It arrives encrypted and read-only.</li>
          </ol>
          <p>The English and Hindi buttons switch the language on the patient screens. “Start with fresh sample data” in the top bar clears your changes.</p>
          <FeedbackLink />
        </details>
      </main>
    </div>
  );
}
