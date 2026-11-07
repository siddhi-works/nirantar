import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { FACILITY, OTHER_FACILITY } from '@/data/demo';
import { useT } from '@/i18n';
import { useSession } from '@/session';
import DoctorPatient from './DoctorPatient';
import NursePatient from './NursePatient';
import RegisteredPatientPage from './RegisteredPatientPage';
import { RegisterCard, isRegisteredId } from './RegisterPatient';
import { OtherHospitals, PatientDirectory } from './Exchange';
import { LookupPanel, TopBar, today } from './Chrome';
import { AttentionCard, OpdQueueCard } from './Opd';
import { NetworkLog } from './NavMenu';
import { ScanReportCard, TryItCard } from './Purpose';
import { AppointmentsCard, ScheduleCard, StaffNotifications } from './SampleCards';


/** Today's position in the OPD, as a plain line. The numbers are counted from the queue and the register, and the line says so. */
function TodayLine() {
  const t = useT();
  const q = useApi(() => api.opdQueue(), []);
  const reg = useApi(() => api.listRegistered(), []);
  const c = q.data?.counts;
  const item = (label: string, value: number | null) => <li><b className="num">{value === null ? '—' : value}</b> {t(label)}</li>;
  return (
    <section className="today" aria-label={t('Today in the OPD')}>
      <ul>
        {item('waiting', c ? c.waiting : null)}
        {item('being seen', c ? c.ongoing : null)}
        {item('seen today', c ? c.done : null)}
        {item('registered here', reg.data ? reg.data.total : null)}
      </ul>
    </section>
  );
}

function StaffHome({ role }: { role: 'doctor' | 'nurse' }) {
  const open = useSession(s => s.openId);
  const user = useSession(s => s.user);
  const t = useT();
  if (open) return isRegisteredId(open) ? <RegisteredPatientPage /> : role === 'doctor' ? <DoctorPatient /> : <NursePatient />;
  const hfr = user?.hfrId ?? FACILITY.hfr;
  const here = hfr === FACILITY.hfr ? FACILITY.name : OTHER_FACILITY.name;
  return (
    <div className="screen">
      <TopBar />
      <main className="wrap wrap--fit">
        <header className="pagehead">
          <div><h1>{role === 'nurse' ? t('OPD nursing station') : t('OPD dashboard')}</h1><p translate="no">{here} · {today()}</p></div>
          <TodayLine />
        </header>
        <TryItCard />
        <div className="dash" id="queue">
          <div className="dash__main"><OpdQueueCard /></div>
          <div className="dash__rail"><ScanReportCard /><LookupPanel title={t('Find a patient by ABHA number')} /></div>
        </div>
        <div className="dash" id="patients">
          <div className="dash__main"><PatientDirectory /></div>
          <div className="dash__rail"><AttentionCard /><RegisterCard /></div>
        </div>
        <h2 className="sect" id="sharing">{t('Record sharing')}</h2>
        <div className="dash"><div className="dash__main"><OtherHospitals /></div><div className="dash__rail"><NetworkLog /></div></div>
        <div className="dash3 infos" role="list" aria-label={t('How sharing works')}>
          <div className="card info" role="listitem"><b>{t('1. You ask')}</b><p>{t('Enter the patient’s ABHA number and choose which records you need and for how long.')}</p></div>
          <div className="card info" role="listitem"><b>{t('2. The patient decides')}</b><p>{t('The patient sees who is asking, and can allow less than you asked for. Nothing moves before they agree.')}</p></div>
          <div className="card info" role="listitem"><b>{t('3. A read-only copy arrives')}</b><p>{t('It travels encrypted, every number keeps its source, and you must erase it on the date the patient set.')}</p></div>
        </div>
        <h2 className="sect" id="updates">{t('Updates')}</h2>
        <div className="dash3"><StaffNotifications /><AppointmentsCard /><ScheduleCard /></div>
      </main>
    </div>
  );
}

export const DoctorHome = () => <StaffHome role="doctor" />;
export const NurseHome = () => <StaffHome role="nurse" />;
