import { Bell, CalendarClock, CalendarDays, Clock } from 'lucide-react';
import { APPOINTMENTS, PATIENT_APPOINTMENT, PATIENT_NOTES, SHIFTS, STAFF_NOTES, sampleDay, sampleTime, type SampleNote } from '@/data/sample';
import { useT } from '@/i18n';
import { Card, CardHead, cx } from '@/ui/primitives';
import { ScopeNote } from '@/ui/ScopeNote';

const Sample = () => { const t = useT(); return <span className="chip chip--dashed">{t('Demo')}</span>; };
const Demo = () => { const t = useT(); return <ScopeNote kind="demo">{t('Demo content for how this screen will look. It is made up and is not connected to the queue or to any record.')}</ScopeNote>; };

function Notes({ items, title }: { items: SampleNote[]; title: string }) {
  return (
    <Card accent="cerulean">
      <CardHead title={title} icon={<Bell size={16} />} right={<Sample />} />
      <ul className="notes">
        {items.map(n => (
          <li key={n.id} className={cx('note', `note--${n.tone}`)}>
            <span className="note__dot" aria-hidden="true" />
            <span className="grow"><b>{n.title}</b><small>{n.text}</small></span>
            <time className="muted" dateTime={n.when.toISOString()}>{sampleDay(n.when)}, {sampleTime(n.when)}</time>
          </li>
        ))}
      </ul>
      <Demo />
    </Card>
  );
}

export const StaffNotifications = () => { const t = useT(); return <Notes items={STAFF_NOTES} title={t('Notifications')} />; };
export const PatientNotifications = () => { const t = useT(); return <Notes items={PATIENT_NOTES} title={t('Reminders')} />; };

/** Who is on duty today. */
export function ScheduleCard() {
  const t = useT();
  return (
    <Card accent="sage">
      <CardHead title={t('Clinic schedule today')} icon={<Clock size={16} />} right={<Sample />} />
      <ul className="xlist">
        {SHIFTS.map(s => (
          <li key={s.who}><span className="grow"><b translate="no">{s.who}</b><small>{s.role} · {s.room}</small></span><span className="num muted" translate="no">{s.hours}</span></li>
        ))}
      </ul>
      <Demo />
    </Card>
  );
}

/** The appointment book. These names are made up and are not the patients in the queue. */
export function AppointmentsCard() {
  const t = useT();
  const today = new Date().toDateString();
  return (
    <Card accent="ink">
      <CardHead title={t('Appointment book')} icon={<CalendarDays size={16} />} right={<Sample />} />
      <ul className="xlist">
        {APPOINTMENTS.map(a => (
          <li key={a.id}><span className="opd__time num" translate="no">{a.time.toDateString() === today ? sampleTime(a.time) : `${sampleDay(a.time)}, ${sampleTime(a.time)}`}</span>
            <span className="grow"><b translate="no">{a.name}</b><small>{a.reason} · {a.with}</small></span></li>
        ))}
      </ul>
      <Demo />
    </Card>
  );
}

/** The patient's next appointment. */
export function NextVisitCard() {
  const t = useT();
  const a = PATIENT_APPOINTMENT;
  return (
    <Card accent="terracotta">
      <CardHead title={t('Your next appointment')} icon={<CalendarClock size={16} />} right={<Sample />} />
      <div className="card__body">
        <b className="num" style={{ fontSize: 20 }} translate="no">{sampleDay(a.when)}, {sampleTime(a.when)}</b>
        <p translate="no">{a.with} · {a.where}</p>
        <p className="hint">{a.note}</p>
        <Demo />
      </div>
    </Card>
  );
}
