import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { FACILITY, OTHER_FACILITY } from '@/data/demo';
import { Button, Card, CardHead, Modal } from '@/ui/primitives';

export const hospitalName = (hfr: string) => (hfr === FACILITY.hfr ? FACILITY.name : hfr === OTHER_FACILITY.hfr ? OTHER_FACILITY.name : hfr);
/** What a hospital's QR code holds: this site's address and the facility id. Scanning it opens the patient's Scan & Share. */
export const qrUrl = (hfr: string) => `${window.location.origin}/?scan=${encodeURIComponent(hfr)}`;
/** The facility id in a scanned code or pasted link, or null when it is not one of ours. */
export function hfrFromScan(text: string): string | null {
  try { const u = new URL(text, window.location.origin); const h = u.searchParams.get('scan'); return h && /^IN\d{10}$/.test(h) ? h : null; } catch { return null; }
}

function QrImage({ hfr, size }: { hfr: string; size: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(qrUrl(hfr), { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M' }).then(setSvg, () => setSvg('')); }, [hfr, size]);
  // the markup comes from our own call to the QR library with a URL we built, never from user input
  return <div role="img" aria-label={`QR code of ${hospitalName(hfr)}`} translate="no" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** The hospital's desk QR: a patient scans it with their phone to join the OPD queue. */
export function HospitalQrCard({ hfr }: { hfr: string }) {
  const [big, setBig] = useState(false);
  return (
    <Card accent="ink">
      <CardHead title="Desk QR for patients" icon={<QrCode size={16} />} />
      <div className="card__body" style={{ textAlign: 'center' }}>
        <QrImage hfr={hfr} size={180} />
        <p style={{ margin: '6px 0 2px' }}><b>{hospitalName(hfr)}</b></p>
        <p className="hint">A patient scans this with their phone camera, signs in, and shares their profile to get a token. Facility ID {hfr}.</p>
        <Button size="sm" variant="secondary" onClick={() => setBig(true)}>Show large</Button>
      </div>
      {big && (
        <Modal label="Desk QR" onClose={() => setBig(false)}>
          <div className="modal__form" style={{ alignItems: 'center', textAlign: 'center' }}>
            <h2 style={{ fontSize: 20 }}>{hospitalName(hfr)}</h2>
            <QrImage hfr={hfr} size={360} />
            <p className="hint">OPD registration · Scan &amp; Share</p>
            <Button onClick={() => setBig(false)}>Close</Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
