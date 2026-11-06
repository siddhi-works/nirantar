import type { ReactNode } from 'react';
import { FlaskConical, Hourglass } from 'lucide-react';
import { useT } from '@/i18n';

/** Says plainly that something on the screen is made-up (demo) or not built yet (future scope), so no one mistakes it for a working feature. */
export function ScopeNote({ kind, children }: { kind: 'demo' | 'future'; children: ReactNode }) {
  const t = useT();
  return (
    <div className={`scope scope--${kind}`} role="note">
      {kind === 'demo' ? <FlaskConical size={15} aria-hidden="true" /> : <Hourglass size={15} aria-hidden="true" />}
      <span><b>{kind === 'demo' ? t('Demo only') : t('Future scope')}.</b> {children}</span>
    </div>
  );
}
