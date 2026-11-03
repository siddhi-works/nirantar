import { useState } from 'react';
import { ArrowRight, HeartHandshake, KeyRound, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { api } from '@/api';
import { CREDENTIALS, FACILITY, OTHER_DOCTOR, OTHER_FACILITY } from '@/data/demo';
import { formatAbha, useSession, type AppRole } from '@/session';
import { useUi } from '@/ui/store';
import { Logo } from './Chrome';
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
    abha: CREDENTIALS.patient.abha, otp: CREDENTIALS.doctor.otp,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof vals, v: string) => setVals(s => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const user = await api.verifyOtp(role === 'patient'
        ? { role, abha: vals.abha, otp: vals.otp }
        : { role, hprId: role === 'doctor' ? vals.doctorId : vals.nurseId, hfrId: vals.facility, otp: vals.otp });
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
          <div className="field"><label htmlFor="otp"><KeyRound size={13} style={{ verticalAlign: -2 }} /> {t('One-time password')}</label>
            <input id="otp" className="input" inputMode="numeric" value={vals.otp} onChange={e => set('otp', e.target.value)} /><span className="hint">Sent to the mobile number linked to your {role === 'patient' ? 'ABHA' : 'HPR'} account</span></div>

          <button className="btn login__go" disabled={busy}>{busy ? t('Verifying…') : <>{t('Verify and log in')} <ArrowRight size={16} /></>}</button>
          {err && <div className="error-text" role="alert">{err}</div>}
          <p className="hint" style={{ textAlign: 'center' }}>Test details are pre-filled — just press the button.</p>
        </form>
      </main>
    </div>
  );
}
