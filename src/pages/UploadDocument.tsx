import { useRef, useState } from 'react';
import { FileUp, UploadCloud, X } from 'lucide-react';
import { useSession } from '@/session';
import { useUi } from '@/ui/store';
import { Button } from '@/ui/primitives';

export const DOC_TYPES = [
  'Prescription',
  'Blood glucose report (FBS / PPBS / RBS)',
  'HbA1c report',
  'Kidney function (creatinine / eGFR)',
  'Urine albumin / protein (uACR)',
  'Lipid profile',
  'Liver function test',
  'Eye (retina) examination report',
  'Foot / neuropathy examination',
  'Blood pressure / vitals chart',
  'Home glucose log',
  'ECG / cardiac report',
  'Discharge summary',
  'Referral / specialist note',
  'Other',
];

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function UploadDialog({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const addUpload = useSession(s => s.addUpload);
  const user = useSession(s => s.user);
  const toast = useUi(s => s.toast);
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) { setErr('Choose the document type first.'); return; }
    if (!file) { setErr('Choose a file to upload.'); return; }
    addUpload({ patientId, type, name: file.name, size: kb(file.size), by: user?.name ?? 'Doctor', at: new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) });
    toast(`${type} uploaded`);
    onClose();
  };

  return (
    <div className="modal-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal card" onSubmit={submit} role="dialog" aria-label="Upload document">
        <div className="spread"><h2 style={{ fontSize: 20 }}>Upload a document</h2><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={18} /></Button></div>
        <div className="field"><label htmlFor="dt">Document type</label>
          <select id="dt" className="select" value={type} onChange={e => { setType(e.target.value); setErr(''); }}>
            <option value="">Select a type…</option>{DOC_TYPES.map(t => <option key={t}>{t}</option>)}
          </select></div>
        <div className="field"><label>File</label>
          <div className={`drop ${drag ? 'is-drag' : ''}`} onClick={() => input.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setErr(''); } }}>
            <UploadCloud size={26} />
            {file ? <b>{file.name} <span className="muted">· {kb(file.size)}</span></b> : <span><b>Drop a file here</b> or click to browse</span>}
            <small>PDF, JPG or PNG</small>
          </div>
          <input ref={input} type="file" accept=".pdf,image/*" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setErr(''); }} />
        </div>
        {err && <div className="error-text" role="alert">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<FileUp size={15} />}>Upload</Button></div>
      </form>
    </div>
  );
}
