import { Square, Volume2 } from 'lucide-react';
import { Button } from '@/ui/primitives';
import { LANGS, useLang, useSpeaking, useT } from './index';

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang" role="group" aria-label="Language">
      {LANGS.map(l => <button key={l.code} type="button" className={lang === l.code ? 'is-on' : ''} aria-pressed={lang === l.code} lang={l.code} onClick={() => setLang(l.code)}>{l.label}</button>)}
    </div>
  );
}

/** Reads the given sentences aloud in the chosen language. */
export function ReadAloud({ sentences }: { sentences: string[] }) {
  const t = useT();
  const lang = useLang(s => s.lang);
  const sp = useSpeaking();
  return sp.on
    ? <Button size="sm" variant="secondary" onClick={sp.stop} icon={<Square size={14} />}>{t('Stop')}</Button>
    : <Button size="sm" variant="secondary" onClick={() => sp.run(sentences.join('. '), lang)} icon={<Volume2 size={14} />}>{t('Listen')}</Button>;
}
