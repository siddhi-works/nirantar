import { Building2, UserPlus, Users } from 'lucide-react';
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
import { HospitalQrCard } from './HospitalQr';
import { LookupPanel, TopBar, jumpTo, today } from './Chrome';
import { AttentionCard, OpdQueueCard } from './Opd';
import { NetworkLog } from './NavMenu';
import { HowItWorks, ScanReportCard } from './Purpose';
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
      <h2>{t('Today in the OPD')}</h2>
      <ul>
        {item('waiting', c ? c.waiting : null)}
        {item('being seen', c ? c.ongoing : null)}
        {item('seen today', c ? c.done : null)}
        {item('registered here', reg.data ? reg.data.total : null)}
      </ul>
      <small>{t('Counted from today’s queue and this hospital’s register.')}</small>
    </section>
  );
}

function StaffHome({ role }: { role: 'doctor' | 'nurse' }) {
  const open = useSession(s => s.openId);
  const user = useSession(s => s.user);
  const t = useT();
  const view = useSession(s => s.view);
  if (open) return isRegisteredId(open) ? <RegisteredPatientPage /> : role === 'doctor' ? <DoctorPatient /> : <NursePatient />;
  const hfr = user?.hfrId ?? FACILITY.hfr;
  const here = hfr === FACILITY.hfr ? FACILITY.name : OTHER_FACILITY.name;
  const other = hfr === FACILITY.hfr ? OTHER_FACILITY.name : FACILITY.name;
  const first = user?.name.replace(/^(Mrs?|Dr|Nurse|Sr)\.?\s*/, '');
  return (
    <div className="screen">
      <TopBar />
      <main className="wrap wrap--fit">
        {view === 'main' ? (<>
        <section id="today" className="hero">
          <div className="hero__text">
            <span className="hero__tag"><Building2 size={14} /><span>{here}</span><time>{today()}</time></span>
            <h1>{t('Good morning,')} {first}.</h1>
            <p>{t('Nirantar reads scanned prescriptions and reports and joins them into one diabetes record per patient. Every number links to the slip it came from, and other hospitals see it only with the patient’s consent.')}</p>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => jumpTo('patients')}><Users size={16} />{t('Open a patient')}</button>
              <button type="button" className="btn btn--secondary" onClick={() => jumpTo('register')}><UserPlus size={16} />{t('Register a patient')}</button>
            </div>
          </div>
          <img className="hero__img" src="/img/hero.jpg" alt="" width="1200" height="900" />
        </section>

        <HowItWorks role="staff" />
        <TodayLine />
        <ScanReportCard />

        <h2 className="sect" id="queue">{t('Queue today')}</h2>
        <div className="cols"><OpdQueueCard /><AttentionCard /></div>

        <h2 className="sect" id="patients">{t('Patients')}</h2>
        <div className="cols">
          <PatientDirectory />
          <div className="stack" style={{ gap: 18 }}>
            <LookupPanel title={t('Open a patient’s record')} />
            <div className="xban" role="note"><Building2 size={16} /><span>{`A record is kept only at the hospital that registered the patient. For a patient held at ${other}, choose Request access: the patient must allow it before you can fetch a read-only copy.`}</span></div>
          </div>
        </div>

        <h2 className="sect" id="register">{t('Register a patient')}</h2>
        <RegisterCard />

        </>) : (<>
        <h2 className="sect" id="network">{t('Other hospitals and network activity')}</h2>
        <div className="cols cols--even"><OtherHospitals /><NetworkLog /></div>

        <h2 className="sect" id="qr">{t('Hospital QR')}</h2>
        <HospitalQrCard hfr={hfr} />

        <h2 className="sect" id="updates">{t('Updates and schedule')}</h2>
        <div className="cols"><AppointmentsCard /><div className="stack" style={{ gap: 18 }}><StaffNotifications /><ScheduleCard /></div></div>
        </>)}
      </main>
    </div>
  );
}

export const DoctorHome = () => <StaffHome role="doctor" />;
export const NurseHome = () => <StaffHome role="nurse" />;
