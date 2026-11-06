import { useState } from 'react';
import { FileScan, ListChecks, Network, ScanLine, ShieldCheck } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { useT } from '@/i18n';
import { Button } from '@/ui/primitives';
import { UploadDialog } from './UploadDocument';
import { jumpTo } from './Chrome';

/** What the product does, in the order it happens. Every step is a real button into that part of the app. */
export function HowItWorks({ role }: { role: 'staff' | 'patient' }) {
  const t = useT();
  const steps = role === 'staff'
    ? [
      { icon: ScanLine, title: 'Scan a slip', text: 'Photograph or upload a prescription or report. Sarvam’s reader turns it into values.', to: 'scan' },
      { icon: ListChecks, title: 'Check what was read', text: 'A doctor or nurse confirms, corrects or rejects each value. Nothing counts until then.', to: 'queue' },
      { icon: FileScan, title: 'One record', text: 'Slips, tests and entries from every visit join one record. Every number opens the slip it came from.', to: 'patients' },
      { icon: Network, title: 'Share with consent', text: 'Another hospital asks, the patient decides, and the copy travels encrypted and is erased on time.', to: 'network' },
    ]
    : [
      { icon: ScanLine, title: 'Upload your reports', text: 'Add an old prescription or test report. It is read for you.', to: 'reports' },
      { icon: ListChecks, title: 'Staff check it', text: 'Your doctor or nurse confirms what was read before it counts.', to: 'reports' },
      { icon: FileScan, title: 'One record', text: 'All your visits in one place. Every number shows the report it came from.', to: 'summary' },
      { icon: ShieldCheck, title: 'You choose who sees it', text: 'Hospitals must ask you. You decide what they see and for how long.', to: 'sharing' },
    ];
  return (
    <ol className="flow" aria-label={t('How Nirantar works')}>
      {steps.map((s, i) => (
        <li key={s.title}>
          <button type="button" onClick={() => jumpTo(s.to)}>
            <span className="flow__n" aria-hidden="true">{i + 1}</span>
            <s.icon size={22} aria-hidden="true" />
            <b>{t(s.title)}</b>
            <small>{t(s.text)}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}

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
