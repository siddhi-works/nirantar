import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { useT } from '@/i18n';
import { Button } from '@/ui/primitives';
import { UploadDialog } from './UploadDocument';
import { useSession } from '@/session';
import { useUi } from '@/ui/store';

/** The scanner on the staff home: pick a patient held here, then upload a slip to be read. */
export function ScanReportCard() {
  const t = useT();
  const [find, setFind] = useState('');
  const { data } = useApi(() => api.directory({ held: true, q: find, limit: 25 }), [find]);
  const mine = (data?.items ?? []).filter(p => p.access === 'held');
  const [pick, setPick] = useState('');
  const [open, setOpen] = useState(false);
  const chosen = pick || mine[0]?.patientId || '';
  return (
    <section className="card scan" id="scan" aria-labelledby="scan-h">
      <div className="card__head"><h2 className="card__title" id="scan-h"><ScanLine size={16} />{t('Scan a report')}</h2></div>
      <div className="card__body">
        <p>{t('Upload a prescription or test report for a patient held here. The slip is read automatically, and you check every value before it is added to the record.')}</p>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <label className="sr-only" htmlFor="scan-patient">{t('Patient')}</label>
          <input className="input" type="search" style={{ maxWidth: 220 }} value={find} onChange={e => setFind(e.target.value)} placeholder={t('Find by name')} aria-label={t('Find a patient')} />
          <select id="scan-patient" className="select" style={{ maxWidth: 320 }} value={chosen} onChange={e => setPick(e.target.value)}>
            {mine.length === 0 && <option value="">{t('No patient is held here yet')}</option>}
            {mine.map(p => <option key={p.patientId} value={p.patientId}>{p.name}</option>)}
          </select>
          <Button disabled={!chosen} onClick={() => setOpen(true)} icon={<ScanLine size={16} />}>{t('Scan and read')}</Button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>{t('Reads printed and handwritten slips in English and Hindi. A report for the wrong person is turned away.')}</p>
      </div>
      {open && chosen && <UploadDialog patientId={chosen} onClose={() => setOpen(false)} />}
    </section>
  );
}

/** The path that shows what Nirantar is for, in three steps: read a prescription, confirm what was read, watch the trend change. Uses a real sample slip and the real review. */
export function TryItCard() {
  const t = useT();
  const toast = useUi(s => s.toast);
  const open = useSession(s => s.openPatient);
  const { data } = useApi(() => api.directory({ held: true, limit: 10 }), []);
  const target = (data?.items ?? []).find(p => p.access === 'held' && /^P\d+$/.test(p.patientId));
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.uploadSample(target.patientId);
      open(target.patientId);
      toast(t('Sample prescription read. Confirm or correct each value in “Uploaded documents and values to review”.'));
      setTimeout(() => document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 900);
    } catch (e) { toast(e instanceof Error ? e.message : t('Could not read the sample.'), 'error'); } finally { setBusy(false); }
  };
  return (
    <section className="card try" aria-labelledby="try-h">
      <div className="card__body row" style={{ gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <h2 id="try-h" style={{ fontSize: 16 }}>{t('Try it: from a prescription to a trend, in three steps')}</h2>
          <ol>
            <li>{t('Read a sample prescription. It is converted into values automatically.')}</li>
            <li>{t('Confirm or correct each value. Nothing counts until a doctor or nurse confirms it.')}</li>
            <li>{t('See the trend update, with every point linked to the slip it came from.')}</li>
          </ol>
        </div>
        <div>
          <Button onClick={go} disabled={busy || !target} icon={<ScanLine size={16} />}>{busy ? t('Reading…') : t('Start with a sample prescription')}</Button>
          {!target && data && <p className="hint">{t('The sample slips belong to the patients held at All India Institute of Medical Sciences, Gorakhpur. Sign in as Dr. Swati Mani to try it.')}</p>}
        </div>
      </div>
    </section>
  );
}
