import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { fmtDate } from '@/domain/format';
import { useSession } from '@/session';
import { Button } from '@/ui/primitives';
import { clock } from './Opd';

/** The ≡ menu for staff: upcoming patients, and the hospital's own records and system activity. */
export function NavMenu() {
  const [on, setOn] = useState(false);
  const open = useSession(s => s.openPatient);
  const q = useApi(() => api.opdQueue(), []);
  const reg = useApi(() => api.listRegistered({ limit: 8 }).then(r => r.items), []);
  const net = useApi(() => api.networkMessages(), []);
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on]);
  const waiting = (q.data?.items ?? []).filter(v => v.status === 'waiting' || v.status === 'ongoing');
  const go = (id: string) => { setOn(false); open(id); };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOn(true)} aria-label="Open the menu" aria-expanded={on}><Menu size={20} /></Button>
      {on && createPortal(
        <div className="drawer-wrap" onClick={() => setOn(false)}>
          <aside className="drawer" role="dialog" aria-label="Menu" onClick={e => e.stopPropagation()}>
            <div className="spread"><h2 style={{ fontSize: 18 }}>Menu</h2><Button variant="ghost" size="icon" onClick={() => setOn(false)} aria-label="Close the menu"><X size={18} /></Button></div>

            <section><div className="eyebrow">Upcoming patients</div>
              {waiting.length === 0 ? <p className="hint">No patient is waiting.</p> : (
                <ul className="xlist">{waiting.slice(0, 8).map(v => (
                  <li key={v.id}><span className="opd__token num">#{v.token}</span><span className="grow"><b translate="no">{v.name}</b><small>{v.status === 'ongoing' ? 'Being seen now' : v.waitMinutes === null || v.waitMinutes === undefined ? 'Waiting time unavailable' : `About ${clock(v.startsAt)}`}</small></span>
                    <Button size="sm" variant="secondary" onClick={() => go(v.patientId)}>Open</Button></li>
                ))}</ul>
              )}
            </section>

            <section><div className="eyebrow">Hospital information system</div>
              <b>Patients registered here</b>
              {(reg.data ?? []).length === 0 ? <p className="hint">None registered yet.</p> : (
                <ul className="xlist">{reg.data!.map(p => (
                  <li key={p.id}><span className="grow"><b translate="no">{p.name}</b><small>registered {fmtDate(p.registeredAt)}</small></span><Button size="sm" variant="secondary" onClick={() => go(p.id)}>Open</Button></li>
                ))}</ul>
              )}
            </section>

            <section><div className="eyebrow">Network activity</div>
              <p className="hint">Each message between this hospital’s system and the sandbox ABDM gateway. It shows what the message was about, never health data.</p>
              {(net.data ?? []).length === 0 ? <p className="hint">No messages yet.</p> : (
                <ul className="xlist netlog">{net.data!.slice(0, 20).map(m => (
                  <li key={m.id}><span className="grow"><code translate="no">{m.from} → {m.to}</code> <code translate="no">{m.path}</code><small>{m.summary} · {clock(m.at)}</small></span><span className="chip chip--outline">{m.status}</span></li>
                ))}</ul>
              )}
            </section>
          </aside>
        </div>
      , document.body)}
    </>
  );
}

/** The messages between the hospital systems and the sandbox gateway for this space, so a patient or tester can see what happened. */
export function NetworkLog() {
  const net = useApi(() => api.networkMessages(), []);
  return (
    <section className="card" data-accent="ink">
      <div className="card__head"><h2 className="card__title">What was sent between systems</h2></div>
      <div className="card__body">
        <p className="hint">Each message between the hospitals and the sandbox gateway. It shows what the message was about, never health data.</p>
        {(net.data ?? []).length === 0 ? <p className="hint">No messages yet.</p> : (
          <ul className="xlist netlog">{net.data!.slice(0, 30).map(m => (
            <li key={m.id}><span className="grow"><code translate="no">{m.from} → {m.to}</code> <code translate="no">{m.path}</code><small>{m.summary} · {clock(m.at)}</small></span><span className="chip chip--outline">{m.status}</span></li>
          ))}</ul>
        )}
      </div>
    </section>
  );
}
