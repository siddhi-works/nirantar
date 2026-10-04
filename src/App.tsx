import { useSession } from '@/session';
import { SourcePanel } from '@/ui/CitationPanel';
import Login from '@/pages/Login';
import { DoctorHome, NurseHome } from '@/pages/Homes';
import PatientHome from '@/pages/PatientHome';
import { Toasts } from '@/pages/Chrome';

export default function App() {
  const user = useSession(s => s.user);
  return (
    <>
      {!user ? <Login /> : user.role === 'doctor' ? <DoctorHome /> : user.role === 'nurse' ? <NurseHome /> : <PatientHome />}
      <SourcePanel />
      <Toasts />
    </>
  );
}
