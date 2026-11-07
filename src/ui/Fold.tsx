import type { ReactNode } from 'react';

/** A section that stays closed until opened, so a long record leads with what a doctor needs first. Native details: keyboard and screen-reader friendly. */
export function Fold({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="fold" open={open}>
      <summary><b>{title}</b>{hint && <small>{hint}</small>}</summary>
      <div className="fold__body">{children}</div>
    </details>
  );
}
