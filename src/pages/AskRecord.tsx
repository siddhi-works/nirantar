import { useRef, useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { api } from '@/api';
import type { RecordAnswer } from '@/domain/api';
import { fmtDate } from '@/domain/format';
import { Button } from '@/ui/primitives';
import { useLang, useT } from '@/i18n';
import { ReadAloud } from '@/i18n/controls';

interface Turn { q: string; a?: RecordAnswer; error?: string }

/** A patient asks about their own record. Every answer is read from the record and lists the lines it came from. */
export function AskRecord({ patientId }: { patientId: string }) {
  const t = useT();
  const lang = useLang(s => s.lang);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const suggestions = [
    t('What was my last HbA1c?'), t('Which medicines am I taking?'), t('What was my last blood pressure?'),
    t('When was my last visit?'), t('Which tests are not on my record?'), t('What is HbA1c?'), t('What does eGFR mean?'),
  ];

  const ask = async (text: string) => {
    const question = text.trim();
    if (question.length < 2 || busy) return;
    setQ(''); setBusy(true);
    setTurns(x => [...x, { q: question }]);
    try {
      const a = await api.askRecord(patientId, question, lang);
      setTurns(x => x.map((turn, i) => (i === x.length - 1 ? { ...turn, a } : turn)));
    } catch (e) {
      setTurns(x => x.map((turn, i) => (i === x.length - 1 ? { ...turn, error: e instanceof Error ? e.message : t('Something went wrong. Try again.') } : turn)));
    } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50); }
  };

  return (
    <section className="card ask" data-accent="sage" aria-label={t('Ask about your record')}>
      <div className="card__head"><h2 className="card__title"><MessageCircleQuestion size={16} />{t('Ask about your record')}</h2></div>
      <div className="ask__body">
        <p className="hint">{t('Questions about you are answered only from your own record in this app. Questions like "what is HbA1c" get general information. This is not medical advice. For anything else, ask your doctor.')}</p>
        {turns.length === 0 && (
          <div className="ask__chips" role="group" aria-label={t('Questions you can try')}>
            {suggestions.map(s => <button key={s} type="button" className="chip chip--outline" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
          </div>
        )}
        <div className="ask__log" aria-live="polite">
          {turns.map((turn, i) => (
            <div key={i} className="ask__turn">
              <div className="ask__q" translate="no">{turn.q}</div>
              <div className="ask__a" translate="no">
                {turn.a && (
                  <>
                    <p>{turn.a.answer}</p>
                    {turn.a.via === 'general' && <p className="hint">{t('General information, not about you.')}</p>}
                    {turn.a.sources.length > 0 && (
                      <div className="ask__src"><span className="eyebrow">{t('From your record')}</span>
                        {turn.a.sources.map(s => <span key={s.id} className="chip chip--outline">{s.label}{s.date ? ` · ${fmtDate(s.date)}` : ''}</span>)}
                      </div>
                    )}
                    <ReadAloud sentences={[turn.a.answer]} />
                  </>
                )}
                {turn.error && <p className="error-text" role="alert">{turn.error}</p>}
                {!turn.a && !turn.error && <p className="hint">{t('Looking in your record…')}</p>}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form className="row" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); void ask(q); }}>
          <input className="input grow" value={q} maxLength={300} onChange={e => setQ(e.target.value)} placeholder={t('Type your question')} aria-label={t('Type your question')} />
          <Button disabled={busy || q.trim().length < 2} icon={<Send size={15} />}>{t('Ask')}</Button>
        </form>
        {turns.length > 0 && <button type="button" className="linklike" onClick={() => setTurns([])}>{t('Clear the conversation')}</button>}
      </div>
    </section>
  );
}
