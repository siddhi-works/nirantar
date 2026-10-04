import { useState } from 'react';
import { ArrowRight, HeartHandshake, KeyRound, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { api } from '@/api';
import { CREDENTIALS, FACILITY } from '@/data/demo';
import { formatAbha, useSession, type AppRole } from '@/session';
import { useUi } from '@/ui/store';
import { Logo } from './Chrome';

const TABS: { k: AppRole; label: string; icon: typeof Stethoscope }[] = [
  { k: 'doctor', label: 'Doctor', icon: Stethoscope },
  { k: 'nurse', label: 'Nurse', icon: HeartHandshake },
  { k: 'patient', label: 'Patient', icon: UserRound },
];

export default function Login() {
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
    if (role === 'patient') {
      const hit = (await api.searchPatients(vals.abha)).find(h => h.patient.abhaId === vals.abha);
      if (!hit) { setBusy(false); setErr('This ABHA number is not registered. Check the 14 digits.'); return; }
      setTimeout(() => login({ role, name: hit.patient.name, line: `ABHA ${hit.patient.abhaId}`, patientId: hit.patient.id }), 600);
      return;
    }
    setTimeout(() => {
      const c = CREDENTIALS[role];
      setRole(role);
      login({ role, name: c.name, line: c.line });
    }, 700);
  };

  return (
    <div className="login">
      <aside className="login__brand">
        <div className="login__logo"><Logo size={40} /><span>Nirantar</span></div>
        <h1>Care that doesn’t lose the thread between visits.</h1>
        <p>One continuous, evidence-linked diabetes record for the clinic and the patient.</p>
        <ul>
          <li><ShieldCheck size={18} />Every value traces back to the slip it came from</li>
          <li><ShieldCheck size={18} />Missing tests are shown, never left blank</li>
          <li><ShieldCheck size={18} />Doctor, nurse and patient each see what they need</li>
        </ul>
        <small>Prototype · all names, IDs and numbers are synthetic dummy data</small>
      </aside>

      <main className="login__panel">
        <form className="login__card" onSubmit={submit}>
          <h2>Welcome back</h2>
          <p className="muted">Choose how you are signing in.</p>
          <div className="login__tabs" role="tablist">
            {TABS.map(t => (
              <button type="button" key={t.k} role="tab" aria-selected={role === t.k} className={role === t.k ? 'is-on' : ''} onClick={() => setTab(t.k)}>
                <t.icon size={16} />{t.label}
              </button>
            ))}
          </div>

          {role === 'doctor' && (
            <>
              <div className="field"><label htmlFor="hpr">HPR ID <span className="muted">(Healthcare Professionals Registry)</span></label>
                <input id="hpr" className="input" value={vals.doctorId} onChange={e => set('doctorId', e.target.value)} /></div>
              <div className="field"><label htmlFor="hfr">Hospital / facility ID <span className="muted">(HFR)</span></label>
                <input id="hfr" className="input" value={vals.facility} onChange={e => set('facility', e.target.value)} /><span className="hint">{FACILITY.name}</span></div>
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
            <div className="field"><label htmlFor="abha">ABHA number</label>
              <input id="abha" className="input" inputMode="numeric" value={vals.abha} onChange={e => set('abha', formatAbha(e.target.value))} /><span className="hint">14-digit Ayushman Bharat Health Account number</span></div>
          )}
          <div className="field"><label htmlFor="otp"><KeyRound size={13} style={{ verticalAlign: -2 }} /> One-time password</label>
            <input id="otp" className="input" inputMode="numeric" value={vals.otp} onChange={e => set('otp', e.target.value)} /><span className="hint">Sent to the mobile number linked to your {role === 'patient' ? 'ABHA' : 'HPR'} account</span></div>

          <button className="btn login__go" disabled={busy}>{busy ? 'Verifying…' : <>Verify and log in <ArrowRight size={16} /></>}</button>
          {err && <div className="error-text" role="alert">{err}</div>}
          <p className="hint" style={{ textAlign: 'center' }}>Demo details are pre-filled — just press the button.</p>
        </form>
      </main>
    </div>
  );
}
