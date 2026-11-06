import { cx } from './primitives';

/** A row of tabs for switching between the parts of one screen, so a record is never one long page. */
export function Tabs<K extends string>({ tabs, value, onChange, label }: { tabs: { k: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.k} type="button" role="tab" aria-selected={value === t.k} className={cx('tabs__t', value === t.k && 'is-on')} onClick={() => onChange(t.k)}>
          {t.label}{t.count ? <span className="tabs__n">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
