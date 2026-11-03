import { useState } from 'react';
import { OBS_BY_CODE, checkValue } from '@/domain/observations';
import { Button } from './primitives';

/** The value field for one measure: a number box with its unit, or a list of the allowed results. */
export function ValueField({ code, value, onChange, id }: { code: string; value: string; onChange: (v: string) => void; id: string }) {
  const def = OBS_BY_CODE[code];
  if (!def) return null;
  if (def.kind === 'choice') {
    return (
      <select id={id} className="select" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Select a result…</option>
        {def.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return <div className="input-unit"><input id={id} className="input" type="number" step="any" value={value} onChange={e => onChange(e.target.value)} /><span>{def.unit}</span></div>;
}

/** Change a value with a reason. The earlier value is kept and shown; nothing is overwritten. */
export function CorrectForm({ code, current, onSave, onCancel }: { code: string; current: string; onSave: (value: string, reason: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(current);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = checkValue(code, value);
    if (!c.ok) { setErr(c.error); return; }
    if (reason.trim().length < 3) { setErr('Write a short reason, for example “the report shows 6.0”.'); return; }
    setBusy(true); setErr('');
    try { await onSave(value, reason.trim()); } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
      <div className="field"><label htmlFor="cv">Corrected value</label><ValueField id="cv" code={code} value={value} onChange={setValue} /></div>
      <div className="field"><label htmlFor="cr">Reason</label><input id="cr" className="input" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="What the original document shows" /></div>
      {err && <div className="error-text" role="alert">{err}</div>}
      <div className="row"><Button size="sm" disabled={busy}>Save correction</Button><Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancel</Button></div>
      <p className="hint">The earlier value stays on record, with who changed it and why.</p>
    </form>
  );
}

export function ReasonForm({ label, action, onSave, onCancel }: { label: string; action: string; onSave: (reason: string) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) { setErr('Write a short reason.'); return; }
    setBusy(true); setErr('');
    try { await onSave(reason.trim()); } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
      <div className="field"><label htmlFor="rr">{label}</label><input id="rr" className="input" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} /></div>
      {err && <div className="error-text" role="alert">{err}</div>}
      <div className="row"><Button size="sm" variant="secondary" disabled={busy}>{action}</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
