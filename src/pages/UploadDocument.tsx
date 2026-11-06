import { useRef, useState } from 'react';
import { Camera, FileUp, Loader2, UploadCloud, X } from 'lucide-react';
import { api } from '@/api';
import { DOC_TYPES } from '@/domain/documents';
import { useUi } from '@/ui/store';
import { Button, Modal } from '@/ui/primitives';

export { DOC_TYPES };
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MAX = 4 * 1024 * 1024;

export function UploadDialog({ patientId, onClose, patient }: { patientId: string; onClose: () => void; patient?: boolean }) {
  const toast = useUi(s => s.toast);
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > MAX) { setErr('The file is larger than 4 MB. Upload a smaller scan.'); return; }
    setFile(f); setErr('');
  };

  const finish = (doc: Awaited<ReturnType<typeof api.uploadDocument>>) => {
    if (doc.status === 'failed') { setErr(doc.error ?? 'This file could not be read.'); setBusy(false); return; }
    toast(doc.values ? `${doc.values} value${doc.values === 1 ? '' : 's'} found. ${patient ? 'Your doctor will review them.' : 'Review them before they count.'}` : 'Uploaded. No values were found to read.');
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) { setErr('Choose the document type first.'); return; }
    if (!file) { setErr('Choose a file to upload.'); return; }
    setBusy(true); setErr('');
    try { finish(await api.uploadDocument(patientId, type, file)); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : 'The upload did not go through.'); setBusy(false); }
  };

  const useSample = async () => {
    setBusy(true); setErr('');
    try { finish(await api.uploadSample(patientId)); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : 'The sample could not be added.'); setBusy(false); }
  };

  return (
    <Modal label="Upload document" onClose={onClose} locked={busy}>
      <form className="modal__form" onSubmit={submit}>
        <div className="spread"><h2 style={{ fontSize: 20 }}>Upload a document</h2><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close" disabled={busy}><X size={18} /></Button></div>
        <div className="field"><label htmlFor="dt">Document type</label>
          <select id="dt" className="select" value={type} onChange={e => { setType(e.target.value); setErr(''); }} disabled={busy}>
            <option value="">Select a type…</option>{DOC_TYPES.map(t => <option key={t}>{t}</option>)}
          </select></div>
        <div className="field"><label>File</label>
          <div className={`drop ${drag ? 'is-drag' : ''}`} onClick={() => !busy && input.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}>
            <UploadCloud size={26} />
            {file ? <b>{file.name} <span className="muted">· {kb(file.size)}</span></b> : <span><b>Drop a file here</b> or click to browse</span>}
            <small>PDF, JPG or PNG, up to 4 MB</small>
          </div>
          <input ref={input} type="file" accept=".pdf,image/jpeg,image/png" hidden onChange={e => pick(e.target.files?.[0])} />
          <input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" hidden aria-label="Scan with the camera" onChange={e => pick(e.target.files?.[0])} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" size="sm" onClick={() => camera.current?.click()} disabled={busy} icon={<Camera size={14} />}>Scan with the camera</Button>
            <Button type="button" variant="secondary" size="sm" onClick={useSample} disabled={busy} icon={<FileUp size={14} />}>Use the sample prescription</Button>
          </div>
        </div>
        <p className="hint">The file is stored privately. Values found in it stay pending until {patient ? 'your doctor or nurse confirms them' : 'a doctor or nurse confirms them'}.</p>
        {err && <div className="error-text" role="alert">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button icon={busy ? <Loader2 size={15} className="spin" /> : <FileUp size={15} />} disabled={busy}>{busy ? 'Reading the document…' : 'Upload'}</Button>
        </div>
      </form>
    </Modal>
  );
}
