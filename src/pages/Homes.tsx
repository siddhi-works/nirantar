import { DOCTOR_NOTES, DOCTOR_SCHEDULE, NURSE_NOTES, NURSE_SCHEDULE, NURSE_TASKS } from '@/data/demo';
import { useState } from 'react';
import { useSession } from '@/session';
import { cx } from '@/ui/primitives';
import { LookupPanel, Notifications, Schedule, TopBar, today } from './Chrome';
import DoctorPatient from './DoctorPatient';
import NursePatient from './NursePatient';

export function DoctorHome() {
  const open = useSession(s => s.openId);
  const user = useSession(s => s.user);
  if (open) return <DoctorPatient />;
  return (
    <div className="screen">
      <TopBar />
      <main className="wrap">
        <div className="hello"><div><div className="eyebrow">{today()}</div><h1>Good morning, {user?.name}</h1></div></div>
        <div className="cols">
          <div className="stack" style={{ gap: 18 }}>
            <LookupPanel title="Open a patient’s record" />
            <Schedule title="Today’s schedule" rows={DOCTOR_SCHEDULE} />
          </div>
          <Notifications items={DOCTOR_NOTES} />
        </div>
      </main>
    </div>
  );
}

export function NurseHome() {
  const open = useSession(s => s.openId);
  const user = useSession(s => s.user);
  const [done, setDone] = useState<Record<string, boolean>>({});
  if (open) return <NursePatient />;
  return (
    <div className="screen">
      <TopBar />
      <main className="wrap">
        <div className="hello"><div><div className="eyebrow">{today()}</div><h1>Good morning, {user?.name}</h1></div></div>
        <div className="cols">
          <div className="stack" style={{ gap: 18 }}>
            <LookupPanel title="Open a patient’s record" />
            <Schedule title="Today’s schedule" rows={NURSE_SCHEDULE} />
          </div>
          <div className="stack" style={{ gap: 18 }}>
            <section className="card" data-accent="sage">
              <div className="card__head"><h3 className="card__title">My tasks</h3></div>
              <ul className="checks">
                {NURSE_TASKS.map(t => (
                  <li key={t.id}><label className={cx(done[t.id] && 'is-done')}><input type="checkbox" checked={!!done[t.id]} onChange={e => setDone({ ...done, [t.id]: e.target.checked })} />{t.text}</label></li>
                ))}
              </ul>
            </section>
            <Notifications items={NURSE_NOTES} />
          </div>
        </div>
      </main>
    </div>
  );
}
