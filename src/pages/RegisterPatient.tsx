import { useState } from 'react';
import { BadgeCheck, ChevronLeft, ShieldCheck, UserPlus, X } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import type { RegistrationDraft } from '@/domain/api';
import { FACILITY } from '@/data/demo';
import { formatAbha, useSession } from '@/session';
import { Button, Card, CardHead, Modal } from '@/ui/primitives';
import { useUi } from '@/ui/store';

export const isRegisteredId = (id: string | null | undefined) => !!id && /^R[0-9a-f]{8}$/.test(id);

type Step = 'details' | 'verify' | 'consent';
const STEPS: { k: Step; label: string }[] = [{ k: 'details', label: 'Details' }, { k: 'verify', label: 'Verify' }, { k: 'consent', label: 'Consent' }];
const fmtAbha = (digits: string) => `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;

/**
 * Registering a patient takes three steps, and no record exists until all three are done: the details are checked
 * (against the ABHA profile when there is one), the patient proves it is them with a code sent to their mobile, and the
 * patient's consent is recorded.
 */
export function RegisterDialog({ onClose }: { onClose: () => void }) {
  const toast = useUi(s => s.toast);
  const open = useSession(s => s.openPatient);
  const [step, setStep] = useState<Step>('details');
  const [f, setF] = useState({ name: '', age: '', sex: '' as '' | 'M' | 'F' | 'O', phone: '', place: '', abha: '' });
  const [noAbha, setNoAbha] = useState(false);
  const [draft, setDraft] = useState<RegistrationDraft | null>(null);
  const [otp, setOtp] = useState('');
  const [agree, setAgree] = useState({ record: false, link: false, share: false });
  const [mode, setMode] = useState<'' | 'in-person-signed' | 'in-person-verbal'>('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = useApi(() => api.registrationIdentities(), []);
  const set = (k: keyof typeof f, v: string) => { setF(s => ({ ...s, [k]: v })); setErr(''); };
  const hospital = FACILITY.name;

  const fill = (p: { name: string; age: number; sex: 'M' | 'F'; mobile: string; place: string; abha: string }) => {
    setNoAbha(false); setErr('');
    setF({ name: p.name, age: String(p.age), sex: p.sex, phone: p.mobile, place: p.place, abha: fmtAbha(p.abha) });
  };

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.'); } finally { setBusy(false); } };

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const age = Number(f.age);
    if (f.name.trim().length < 2) return setErr('Enter the patient’s full name.');
    if (!Number.isInteger(age) || age < 0 || age > 120) return setErr('Enter an age between 0 and 120.');
    if (!f.sex) return setErr('Choose the patient’s sex.');
    if (f.phone.replace(/\D/g, '').slice(-10).length !== 10) return setErr('Enter the patient’s 10-digit mobile number. The verification code goes there.');
    if (!noAbha && f.abha.replace(/\D/g, '').length !== 14) return setErr('Enter the 14-digit ABHA number, or choose “The patient has no ABHA yet”.');
    void run(async () => {
      const d = await api.registrationStart({ name: f.name.trim(), age, sex: f.sex as 'M' | 'F' | 'O', phone: f.phone, place: f.place.trim() || undefined, abha: noAbha ? undefined : f.abha, createAbha: noAbha || undefined });
      setDraft(d); setOtp(''); setStep('verify');
    });
  };

  const confirmCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    void run(async () => { await api.registrationVerify(draft.draftId, otp); setStep('consent'); });
  };

  const finish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !mode) return;
    const purposes = ['create-record', 'abha-link', ...(agree.share ? ['share-abdm'] : [])];
    void run(async () => {
      const p = await api.registrationComplete(draft.draftId, { purposes, mode });
      toast(`Registered ${p.name}`);
      onClose();
      open(p.id);
    });
  };

  const idx = STEPS.findIndex(s => s.k === step);
  return (
    <Modal label="Register a new patient" onClose={onClose} locked={busy}>
      <div className="modal__form">
        <div className="spread"><h2 style={{ fontSize: 20 }}>Register a new patient</h2><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={18} /></Button></div>
        <ol className="rsteps" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s.k} className={i === idx ? 'is-on' : i < idx ? 'is-done' : ''} aria-current={i === idx ? 'step' : undefined}><span>{i < idx ? '✓' : i + 1}</span>{s.label}</li>)}
        </ol>

        {step === 'details' && (
          <form className="modal__form" style={{ padding: 0 }} onSubmit={check}>
            <p className="hint">This is a sample space. Use made-up details only, never a real patient’s. Nothing is saved until the patient is verified and has agreed.</p>
            <div className="field"><label htmlFor="rn">Full name</label><input id="rn" className="input" autoComplete="off" maxLength={80} value={f.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow"><label htmlFor="ra">Age (years)</label><input id="ra" className="input" inputMode="numeric" value={f.age} onChange={e => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} /></div>
              <div className="field grow"><label htmlFor="rs">Sex</label>
                <select id="rs" className="select" value={f.sex} onChange={e => set('sex', e.target.value)}><option value="">Select…</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></select></div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow"><label htmlFor="rp">Mobile number</label><input id="rp" className="input" inputMode="tel" autoComplete="off" value={f.phone} onChange={e => set('phone', e.target.value.replace(/[^\d+ ]/g, '').slice(0, 16))} /></div>
              <div className="field grow"><label htmlFor="rl">Place <span className="muted">(optional)</span></label><input id="rl" className="input" maxLength={60} value={f.place} onChange={e => set('place', e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor="rb">ABHA number</label>
              <input id="rb" className="input" inputMode="numeric" placeholder="XX-XXXX-XXXX-XXXX" disabled={noAbha} value={noAbha ? '' : f.abha} onChange={e => set('abha', formatAbha(e.target.value))} />
              <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={noAbha} onChange={e => { setNoAbha(e.target.checked); setErr(''); }} /> The patient has no ABHA yet. Make a sample one.</label>
              <span className="hint">An ABHA number is checked against its profile: the name, sex and mobile number must match, and the age within 2 years.</span></div>
            <details className="rids">
              <summary>Sample identities in the sandbox ABHA registry</summary>
              <ul className="xlist">
                {(ids.data ?? []).map(p => (
                  <li key={p.abha}>
                    <span className="grow"><b translate="no">{p.name}</b><small translate="no">{p.age} · {p.sex} · ABHA {fmtAbha(p.abha)} · mobile {p.mobile}</small></span>
                    {p.registered ? <span className="chip chip--dashed">Already registered</span> : <Button type="button" size="sm" variant="secondary" onClick={() => fill(p)}>Use these details</Button>}
                  </li>
                ))}
              </ul>
            </details>
            {err && <div className="error-text" role="alert">{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? 'Checking…' : 'Check details and send code'}</Button></div>
          </form>
        )}

        {step === 'verify' && draft && (
          <form className="modal__form" style={{ padding: 0 }} onSubmit={confirmCode}>
            <div className="xban"><ShieldCheck size={16} /><span>{`A 6-digit code was sent to ${draft.maskedPhone}. Ask the patient to read it out.`}</span></div>
            <div className="rsandbox" role="note"><b>Sandbox only.</b> No text message is sent here, so the code is shown instead: <code translate="no">{draft.sandboxOtp}</code></div>
            <div className="field"><label htmlFor="ro">Code from the patient</label><input id="ro" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }} /></div>
            <p className="hint">{draft.abhaSource === 'registry' ? 'The details matched the ABHA profile.' : `A sample ABHA number ${fmtAbha(draft.abha)} will be made for this patient.`} The code is valid for {draft.expiresInMinutes} minutes, and 3 wrong tries cancel it.</p>
            {err && <div className="error-text" role="alert">{err}</div>}
            <div className="row" style={{ justifyContent: 'space-between' }}><Button type="button" variant="ghost" onClick={() => { setStep('details'); setErr(''); }} icon={<ChevronLeft size={14} />}>Back</Button><Button disabled={busy || otp.length !== 6} icon={<BadgeCheck size={15} />}>{busy ? 'Verifying…' : 'Verify identity'}</Button></div>
          </form>
        )}

        {step === 'consent' && draft && (
          <form className="modal__form" style={{ padding: 0 }} onSubmit={finish}>
            <div className="xban"><BadgeCheck size={16} /><span>{`Identity verified for ${f.name.trim()}. Now record what the patient agrees to. Read each line to the patient.`}</span></div>
            <fieldset className="rconsent">
              <legend>The patient agrees that:</legend>
              <label className="check"><input type="checkbox" checked={agree.record} onChange={e => setAgree(a => ({ ...a, record: e.target.checked }))} /> <span>{`${hospital} may create and keep a health record for me.`} <em>Required</em></span></label>
              <label className="check"><input type="checkbox" checked={agree.link} onChange={e => setAgree(a => ({ ...a, link: e.target.checked }))} /> <span>{`This record may be linked to my ABHA number ${fmtAbha(draft.abha)}.`} <em>Required</em></span></label>
              <label className="check"><input type="checkbox" checked={agree.share} onChange={e => setAgree(a => ({ ...a, share: e.target.checked }))} /> <span>{`${hospital} may share my records with other hospitals through ABDM, only when I allow each request.`} <em>Optional</em></span></label>
            </fieldset>
            <div className="field"><label htmlFor="rm">How was the consent taken?</label>
              <select id="rm" className="select" value={mode} onChange={e => { setMode(e.target.value as typeof mode); setErr(''); }}><option value="">Select…</option><option value="in-person-signed">In person, signed form</option><option value="in-person-verbal">In person, said aloud</option></select></div>
            <p className="hint">The patient can withdraw consent at any time. Without the first two, no record is made. Without the third, nothing is shared with ABDM.</p>
            {err && <div className="error-text" role="alert">{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<UserPlus size={15} />} disabled={busy || !agree.record || !agree.link || !mode}>{busy ? 'Registering…' : 'Register patient'}</Button></div>
          </form>
        )}
      </div>
    </Modal>
  );
}

/** On the doctor's and nurse's home screens: register a new patient, and open one registered earlier. */
export function RegisterCard() {
  const [dialog, setDialog] = useState(false);
  return (
    <Card accent="sage">
      <CardHead title="Register a new patient" icon={<UserPlus size={16} />} />
      <div className="card__body">
        <ol className="steps3"><li>Enter the patient’s details</li><li>Verify the code sent to their mobile</li><li>Record their consent</li></ol>
        <p className="hint">Nothing is saved until all three steps are done.</p>
        <div style={{ marginTop: 10 }}><Button onClick={() => setDialog(true)} icon={<UserPlus size={14} />}>Register a new patient</Button></div>
      </div>
      {dialog && <RegisterDialog onClose={() => setDialog(false)} />}
    </Card>
  );
}
