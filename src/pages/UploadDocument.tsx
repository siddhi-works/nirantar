import { useEffect, useRef, useState } from 'react';
import { Camera, Eraser, FileUp, Loader2, PenLine, Undo2, UploadCloud, X } from 'lucide-react';
import { api } from '@/api';
import { DOC_TYPES } from '@/domain/documents';
import { useUi } from '@/ui/store';
import { Button, Modal } from '@/ui/primitives';

export { DOC_TYPES };
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MAX = 4 * 1024 * 1024;


const CW = 900; const CH = 620;
type Stroke = { x: number; y: number; w: number }[];

/** A blank page to write on with a stylus, an iPad pen or a finger. What is written is read the same way as a scanned prescription. */
function BlankCanvas({ strokes, setStrokes, disabled }: { strokes: Stroke[]; setStrokes: (s: Stroke[]) => void; disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const paint = (all: Stroke[]) => {
    const c = ref.current; if (!c) return; const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = '#E4E9E8'; g.lineWidth = 1;
    for (let y = 60; y < CH; y += 46) { g.beginPath(); g.moveTo(24, y); g.lineTo(CW - 24, y); g.stroke(); }
    g.strokeStyle = '#111'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of all) for (let i = 1; i < s.length; i++) { g.lineWidth = s[i].w; g.beginPath(); g.moveTo(s[i - 1].x, s[i - 1].y); g.lineTo(s[i].x, s[i].y); g.stroke(); }
  };
  useEffect(() => { paint(strokes); });
  const at = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * CW / r.width, y: (e.clientY - r.top) * CH / r.height, w: e.pointerType === 'pen' ? 1.5 + e.pressure * 3.5 : 3 }; };
  return (
    <div className="canvasbox">
      <canvas ref={ref} width={CW} height={CH} aria-label="Blank page for writing the prescription" style={{ touchAction: 'none' }}
        onPointerDown={e => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); live.current = [at(e)]; }}
        onPointerMove={e => { if (!live.current) return; live.current.push(at(e)); paint([...strokes, live.current]); }}
        onPointerUp={() => { if (live.current && live.current.length > 1) setStrokes([...strokes, live.current]); live.current = null; }}
        onPointerCancel={() => { live.current = null; }} />
      <div className="row" style={{ gap: 8 }}>
        <Button type="button" variant="secondary" size="sm" icon={<Undo2 size={14} />} disabled={!strokes.length || disabled} onClick={() => setStrokes(strokes.slice(0, -1))}>Undo</Button>
        <Button type="button" variant="secondary" size="sm" icon={<Eraser size={14} />} disabled={!strokes.length || disabled} onClick={() => setStrokes([])}>Clear the page</Button>
        <small className="muted">Write with a stylus, an iPad pen or your finger.</small>
      </div>
    </div>
  );
}

export function UploadDialog({ patientId, onClose, patient }: { patientId: string; onClose: () => void; patient?: boolean }) {
  const toast = useUi(s => s.toast);
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'file' | 'canvas'>('file');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
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
    let toSend = file;
    if (mode === 'canvas') {
      const c = canvasRef.current?.querySelector('canvas');
      if (!c || !strokes.length) { setErr('Write something on the page first.'); return; }
      const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'));
      if (!blob) { setErr('The page could not be saved. Try again.'); return; }
      toSend = new File([blob], 'handwritten-prescription.png', { type: 'image/png' });
    }
    if (!toSend) { setErr('Choose a file to upload.'); return; }
    setBusy(true); setErr('');
    try { finish(await api.uploadDocument(patientId, type, toSend)); }
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
        <div className="seg" role="radiogroup" aria-label="How to add the prescription">
          <button type="button" role="radio" aria-checked={mode === 'file'} className={mode === 'file' ? 'is-on' : ''} onClick={() => setMode('file')} disabled={busy}><UploadCloud size={15} />Upload or scan</button>
          <button type="button" role="radio" aria-checked={mode === 'canvas'} className={mode === 'canvas' ? 'is-on' : ''} onClick={() => setMode('canvas')} disabled={busy}><PenLine size={15} />Write on blank canvas</button>
        </div>
        <p className="hint">{mode === 'file' ? 'For past prescriptions on paper or in a file: scan, photograph or upload them. The writing is read for you.' : 'For a new prescription: write it on the page below with a tablet or iPad pen. It is read the same way as a scanned one.'}</p>
        {mode === 'canvas' ? <div ref={canvasRef}><BlankCanvas strokes={strokes} setStrokes={setStrokes} disabled={busy} /></div> : (
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
        </div>)}
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
