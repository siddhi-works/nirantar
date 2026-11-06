import { FACILITY, OTHER_FACILITY } from '@/data/demo';
import { useSession } from '@/session';
import { api } from '@/api';
import { useApi } from '@/api/hooks';
import { useT } from '@/i18n';
import { useSection } from '@/ui/nav';
import { NetworkLog } from './NavMenu';
import { AppointmentsCard, ScheduleCard, StaffNotifications } from './SampleCards';
import { LookupPanel, TopBar } from './Chrome';
import { AttentionCard, OpdQueueCard } from './Opd';
import { Building2 } from 'lucide-react';
import DoctorPatient from './DoctorPatient';
import NursePatient from './NursePatient';
import RegisteredPatientPage from './RegisteredPatientPage';
import { RegisterCard, isRegisteredId } from './RegisterPatient';
import { OtherHospitals, PatientDirectory } from './Exchange';
import { HospitalQrCard } from './HospitalQr';

/** The numbers the hospital can state from its own data. Nothing is estimated here. */
function Tiles() {
  const t = useT();
  const q = useApi(() => api.opdQueue(), []);
  const reg = useApi(() => api.listRegistered(), []);
  const c = q.data?.counts;
  const tile = (label: string, value: number | null, note: string) => (
    <div className="kpi"><span>{t(label)}</span><b className="num">{value === null ? '—' : value}</b><small>{t(note)}</small></div>
  );
  return (
    <div className="kpis" role="group" aria-label="Today at a glance">
      {tile('Appointments', c ? c.appointments : null, 'in today’s queue')}
      {tile('Waiting', c ? c.waiting : null, 'in the queue now')}
      {tile('Being seen', c ? c.ongoing : null, 'with a doctor')}
      {tile('Seen today', c ? c.done : null, 'visits completed')}
      {tile('Registered here', reg.data ? reg.data.length : null, 'new patients')}
    </div>
  );
}

function StaffHome({ role }: { role: 'doctor' | 'nurse' }) {
  const open = useSession(s => s.openId);
  const user = useSession(s => s.user);
  const section = useSection();
  const t = useT();
  if (open) return isRegisteredId(open) ? <RegisteredPatientPage /> : role === 'doctor' ? <DoctorPatient /> : <NursePatient />;
  const hfr = user?.hfrId ?? FACILITY.hfr;
  const other = hfr === FACILITY.hfr ? OTHER_FACILITY.name : FACILITY.name;
  return (
    <div className="screen">
      <TopBar />
      <main className="wrap wrap--fit">
        {section === 'overview' && (
          <>
            <Tiles />
            <div className="cols"><div className="stack" style={{ gap: 18 }}><OpdQueueCard /><AppointmentsCard /></div><div className="stack" style={{ gap: 18 }}><AttentionCard /><StaffNotifications /><ScheduleCard /></div></div>
          </>
        )}
        {section === 'patients' && (
          <div className="cols">
            <PatientDirectory />
            <div className="stack" style={{ gap: 18 }}>
              <LookupPanel title={t('Open a patient’s record')} />
              <div className="xban" role="note"><Building2 size={16} /><span>{`A record is kept only at the hospital that registered the patient. For a patient held at ${other}, choose Request access: the patient must allow it before you can fetch a read-only copy.`}</span></div>
            </div>
          </div>
        )}
        {section === 'register' && <div className="wrap--form"><RegisterCard /></div>}
        {section === 'network' && <div className="cols cols--even"><OtherHospitals /><NetworkLog /></div>}
        {section === 'qr' && <div className="wrap--form"><HospitalQrCard hfr={hfr} /></div>}
      </main>
    </div>
  );
}

export const DoctorHome = () => <StaffHome role="doctor" />;
export const NurseHome = () => <StaffHome role="nurse" />;
