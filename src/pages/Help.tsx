import { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { COMPLAINT_KINDS } from '@/domain/help';
import { fmtDate } from '@/domain/format';
import { useT } from '@/i18n';
import { useSession } from '@/session';
import { ScopeNote } from '@/ui/ScopeNote';
import { Button, Modal } from '@/ui/primitives';

const ANSWERS = [
  ['A value looks wrong', 'Open the slip it came from (the source button beside the number). If the slip says something different, report it below, and a doctor can correct it. The original always stays on record.'],
  ['A patient’s record is at another hospital', 'Use “Ask for access”. The patient must allow it before anything is shared.'],
  ['I added a report and nothing appeared', 'Values read from a report stay pending until a doctor or nurse confirms them.'],
] as const;

/** Help: short answers first, then a form to report a complaint. The report is saved with who sent it. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const role = useSession(s => s.user?.role);
  const mine = useApi(() => api.listComplaints(), []);
  const [kind, setKind] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ref, setRef] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) { setErr(t('Choose what it is about.')); return; }
    if (message.trim().length < 10) { setErr(t('Describe what happened in at least a sentence.')); return; }
    setBusy(true); setErr('');
    try { const r = await api.reportComplaint({ kind, message, contact: contact.trim() || undefined }); setRef(r.reference); setMessage(''); mine.refetch(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : t('Could not send. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Modal label={t('Help')} onClose={onClose} locked={busy}>
      <div className="modal__form">
        <div className="spread"><h2 style={{ fontSize: 20 }}>{t('Help')}</h2><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('Close')}><X size={18} /></Button></div>
        <section aria-labelledby="help-q">
          <h3 id="help-q" style={{ fontSize: 15 }}>{t('Quick answers')}</h3>
          <dl className="faq">{ANSWERS.map(([q, a]) => <div key={q}><dt>{t(q)}</dt><dd>{t(a)}</dd></div>)}</dl>
        </section>
        <section aria-labelledby="help-c">
          <h3 id="help-c" style={{ fontSize: 15 }}>{t('Report a complaint')}</h3>
          {ref ? (
            <div className="xban" role="status"><span><b>{t('Your report was saved.')}</b> {t('Reference')} <code>{ref}</code>. {t('Keep this number if you need to ask about it.')}</span></div>
          ) : (
            <form className="stack" style={{ gap: 10 }} onSubmit={send}>
              <div className="field"><label htmlFor="ck">{t('What is it about?')}</label>
                <select id="ck" className="select" value={kind} onChange={e => setKind(e.target.value)} disabled={busy}><option value="">{t('Choose one…')}</option>{COMPLAINT_KINDS.map(k => <option key={k.id} value={k.id}>{t(k.label)}</option>)}</select></div>
              <div className="field"><label htmlFor="cm">{t('What happened?')}</label>
                <textarea id="cm" className="input" rows={4} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} disabled={busy} placeholder={role === 'patient' ? t('For example: the date on my report is wrong') : t('Say which patient or screen, and what you expected')} /></div>
              <div className="field"><label htmlFor="cc">{t('How can we reach you? (optional)')}</label>
                <input id="cc" className="input" maxLength={120} value={contact} onChange={e => setContact(e.target.value)} disabled={busy} /></div>
              <p className="hint">{t('Do not write medical details you do not need to. Your name and role are saved with the report.')}</p>
              {err && <div className="error-text" role="alert">{err}</div>}
              <div><Button disabled={busy} icon={busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}>{t('Send report')}</Button></div>
            </form>
          )}
          {(mine.data ?? []).length > 0 && (
            <ul className="xlist" style={{ marginTop: 10 }} aria-label={t('Your earlier reports')}>
              {mine.data!.map(c => <li key={c.id}><span className="grow"><b>NC-{String(c.id).padStart(5, '0')}</b> · {t(COMPLAINT_KINDS.find(k => k.id === c.kind)?.label ?? c.kind)}<small>{fmtDate(c.at)} · {t('Received')}</small></span></li>)}
            </ul>
          )}
          <ScopeNote kind="future">{t('No one is notified automatically yet. Reports are saved for the project team to read.')}</ScopeNote>
        </section>
      </div>
    </Modal>
  );
}
