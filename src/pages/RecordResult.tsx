import { useState } from 'react';
import { ClipboardPlus, X } from 'lucide-react';
import { api } from '@/api';
import { OBS_DEFS, checkValue } from '@/domain/observations';
import { useUi } from '@/ui/store';
import { Button, Modal } from '@/ui/primitives';
import { ValueField } from '@/ui/ValueForms';

const GROUPS: Record<string, string> = { glycaemic: 'Blood sugar', kidney: 'Kidney', lipid: 'Lipids', liver: 'Liver', exam: 'Examinations', screening: 'Screening', vitals: 'Vitals' };
// Blood pressure is entered as a pair in the vitals form, so it is not offered one number at a time.
const OFFERED = OBS_DEFS.filter(d => d.code !== 'sbp' && d.code !== 'dbp');
const today = () => new Date().toISOString().slice(0, 10);

/** Record one result that came from an examination or a lab report. Staff are the source, so it counts at once. */
export function RecordDialog({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const toast = useUi(s => s.toast);
  const [code, setCode] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) { setErr('Choose what you are recording.'); return; }
    const c = checkValue(code, value);
    if (!c.ok) { setErr(c.error); return; }
    setBusy(true); setErr('');
    try {
      await api.recordValues(patientId, [{ code, value }], date);
      toast('Result recorded');
      onClose();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not save.'); setBusy(false); }
  };

  return (
    <Modal label="Record a result" onClose={onClose} locked={busy}>
      <form className="modal__form" onSubmit={submit}>
        <div className="spread"><h2 style={{ fontSize: 20 }}>Record a result</h2><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={18} /></Button></div>
        <div className="field"><label htmlFor="rm">What was measured</label>
          <select id="rm" className="select" value={code} onChange={e => { setCode(e.target.value); setValue(''); setErr(''); }}>
            <option value="">Select…</option>
            {Object.entries(GROUPS).map(([g, label]) => {
              const items = OFFERED.filter(d => d.group === g);
              return items.length ? <optgroup key={g} label={label}>{items.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}</optgroup> : null;
            })}
          </select></div>
        {code && <div className="field"><label htmlFor="rv">Result</label><ValueField id="rv" code={code} value={value} onChange={v => { setValue(v); setErr(''); }} /></div>}
        <div className="field"><label htmlFor="rd">Date of the result</label><input id="rd" className="input" type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></div>
        {err && <div className="error-text" role="alert">{err}</div>}
        <p className="hint">Results you record count straight away and show who entered them. To add a lab report, use Upload document.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<ClipboardPlus size={15} />} disabled={busy}>Save result</Button></div>
      </form>
    </Modal>
  );
}
