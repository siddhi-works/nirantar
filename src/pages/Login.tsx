import { useState } from 'react';
import { ArrowRight, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { api } from '@/api';
import { CREDENTIALS, FACILITY, OTHER_DOCTOR, OTHER_FACILITY, SAMPLE_PATIENTS } from '@/data/demo';
import { formatAbha, useSession } from '@/session';
import { useUi } from '@/ui/store';
import { FeedbackLink, Logo } from './Chrome';
import { useLang, useT } from '@/i18n';
import { LangToggle } from '@/i18n/controls';
import { ScopeNote } from '@/ui/ScopeNote';

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
    <section className="card tour" aria-label="What does this term mean?">
      <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>What does a term mean?</h2>
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

/** The people who can sign in as medical staff in the sandbox. A real deployment would check each against the Healthcare Professionals Registry. */
const STAFF = [
  { key: 'd1', role: 'doctor' as const, name: 'Dr. Swati Mani', line: 'General Medicine', hospital: FACILITY.name, hprId: CREDENTIALS.doctor.id, hfrId: FACILITY.hfr },
  { key: 'd2', role: 'doctor' as const, name: 'Dr. Pratayaksha', line: 'General Medicine', hospital: OTHER_FACILITY.name, hprId: OTHER_DOCTOR.id, hfrId: OTHER_FACILITY.hfr },
  { key: 'n1', role: 'nurse' as const, name: 'Sr. Kavita Mishra', line: 'Staff Nurse, OPD 3', hospital: FACILITY.name, hprId: CREDENTIALS.nurse.id, hfrId: FACILITY.hfr },
];

export default function Login() {
  const t = useT();
  const login = useSession(s => s.login);
  const setRole = useUi(s => s.setRole);
  const [who, setWho] = useState<'patient' | 'staff'>('patient');
  const [staffKey, setStaffKey] = useState(STAFF[0].key);
  const [abha, setAbha] = useState(CREDENTIALS.patient.abha);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async (body: Parameters<typeof api.verifyOtp>[0]) => {
    setErr(''); setBusy(true);
    try {
      const user = await api.verifyOtp(body);
      if (body.role !== 'patient') setRole(body.role);
      login(user);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  };
  const person = STAFF.find(s => s.key === staffKey)!;
  const submit = (e: React.FormEvent) => { e.preventDefault(); void (who === 'staff' ? go({ role: person.role, hprId: person.hprId, hfrId: person.hfrId }) : go({ role: 'patient', abha })); };

  return (
    <div className="login">
      <aside className="login__brand">
        <div className="login__logo"><Logo size={40} /><span>Nirantar</span></div>
        <h1>{t('Two minutes in the OPD. The whole diabetes story in one glance.')}</h1>
        <p>{t('Continuity of diabetes care on centralised national ABDM records, the way CBS, UPI, Aadhaar and PAN work for banking and identity.')}</p>
        <p className="login__stat">{t('BMJ Open 2017: an OPD consultation takes about 2 minutes in India, against about 20 minutes or more in the US and Europe.')}</p>
        <ul className="login__facts">
          <li><ShieldCheck size={18} />{t('Helps Indian doctors work effectively within the 2-minute OPD window')}</li>
          <li><ShieldCheck size={18} />{t('Centralised logins and records on the National ABDM stack')}</li>
          <li><ShieldCheck size={18} />{t('Digitises past prescriptions by scanning, and new ones by writing on a blank canvas')}</li>
          <li><ShieldCheck size={18} />{t('AI summary of EMR trends, with changes in doses plotted against the EMR values')}</li>
          <li><ShieldCheck size={18} />{t('Reduces defensive medication and wrong diagnosis')}</li>
          <li><ShieldCheck size={18} />{t('Increases doctor-patient interaction and counselling')}</li>
        </ul>
        <img className="login__art" src="/img/clinic.jpg" alt="" width="1200" height="900" />
        <small>Prototype · all names, IDs and numbers are synthetic dummy data</small>
      </aside>

      <main className="login__panel">
        <form className="login__card" onSubmit={submit}>
          <div className="spread"><h1 className="login__h">{t('Log in')}</h1><LangToggle /></div>
          <p className="muted">{t('Log in to open your records.')}</p>
          <div className="login__tabs" role="radiogroup" aria-label={t('I am')}>
            <button type="button" role="radio" aria-checked={who === 'patient'} className={who === 'patient' ? 'is-on' : ''} onClick={() => { setWho('patient'); setErr(''); }}><UserRound size={16} />{t('Patient (HIU)')}</button>
            <button type="button" role="radio" aria-checked={who === 'staff'} className={who === 'staff' ? 'is-on' : ''} onClick={() => { setWho('staff'); setErr(''); }}><Stethoscope size={16} />{t('Healthcare worker (HIP)')}</button>
          </div>

          <p className="hint" id="who-gloss">{who === 'patient' ? t('HIU: a person or hospital that asks for health records. A patient sees and shares their own record.') : t('HIP: a hospital or clinic that holds and provides health records. Doctors and nurses sign in here.')}</p>
          {who === 'staff' ? (
            <>
              <div className="field"><label htmlFor="who">{t('Choose your name')}</label>
                <select id="who" className="select" value={staffKey} onChange={e => setStaffKey(e.target.value)}>
                  <optgroup label={t('Doctors')}>{STAFF.filter(s => s.role === 'doctor').map(s => <option key={s.key} value={s.key}>{s.name} · {s.hospital}</option>)}</optgroup>
                  <optgroup label={t('Nurses')}>{STAFF.filter(s => s.role === 'nurse').map(s => <option key={s.key} value={s.key}>{s.name} · {s.hospital}</option>)}</optgroup>
                </select></div>
              <dl className="who"><div><dt>{t('Registry ID (HPR)')}</dt><dd translate="no">{person.hprId}</dd></div><div><dt>{t('Hospital ID (HFR)')}</dt><dd translate="no">{person.hfrId}</dd></div><div><dt>{t('Role')}</dt><dd>{person.role === 'doctor' ? t('Doctor') : t('Nurse')} · {person.line}</dd></div></dl>
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="pick">{t('Sample patients')}</label>
                <select id="pick" className="select" value={SAMPLE_PATIENTS.some(p => p.abha === abha) ? abha : ''} onChange={e => e.target.value && setAbha(e.target.value)}>
                  <option value="">{t('Type an ABHA number below')}</option>
                  {SAMPLE_PATIENTS.map(p => <option key={p.abha} value={p.abha}>{p.name}</option>)}
                </select></div>
              <div className="field"><label htmlFor="abha">{t('ABHA number')}</label>
                <input id="abha" className="input" inputMode="numeric" value={abha} onChange={e => setAbha(formatAbha(e.target.value))} /><span className="hint">{t('14-digit Ayushman Bharat Health Account number. Patients registered at a hospital sign in with theirs.')}</span></div>
            </>
          )}
          <button className="btn login__go" disabled={busy || (who === 'patient' && abha.replace(/\D/g, '').length !== 14)}>{busy ? t('Signing in…') : <>{t('Log in')} <ArrowRight size={16} /></>}</button>
          {err && <div className="error-text" role="alert">{err}</div>}
          {who === 'staff' && <ScopeNote kind="future">{t('Coming later: sign-in with a one-time code, checked against the national doctors’ registry. For now, choose a sample name to continue.')}</ScopeNote>}
        </form>

        <details className="tour card">
          <summary>{t('How to try this sandbox')}</summary>
          <p>Everything on this site is sample data. Your uploads and changes are private to this browser, so other people testing the site never see them.</p>
          <ol>
            <li>Sign in as <b>Dr. Swati Mani</b>, choose “Scan a report”, pick a patient and upload a slip, or use the sample prescription. Confirm, correct or reject what was read.</li>
            <li>Click a point on a chart, or a source chip, to see the slip a value came from. Choose “Correct value” to see that the original stays on record.</li>
            <li>Sign in as <b>Dr. Pratayaksha</b> (Patna Medical College & Hospital, Patna). The patient list shows patients held elsewhere. Choose “Ask for access”.</li>
            <li>Sign in as that patient with their ABHA number and allow the request. You can narrow what is shared and for how long.</li>
            <li>Sign in as Dr. Pratayaksha again and open the record. The copy arrives encrypted and read-only, with the source of every number.</li>
          </ol>
          <FeedbackLink />
        </details>
        <GlossaryHelper />
      </main>
    </div>
  );
}
