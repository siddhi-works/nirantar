import { useEffect } from 'react';
import { useSession } from '@/session';
import { SourcePanel } from '@/ui/CitationPanel';
import Login from '@/pages/Login';
import { DoctorHome, NurseHome } from '@/pages/Homes';
import PatientHome from '@/pages/PatientHome';
import { Toasts } from '@/pages/Chrome';

export default function App() {
  const user = useSession(s => s.user);
  const ready = useSession(s => s.ready);
  useEffect(() => { void useSession.getState().init(); }, []);
  if (!ready) return null;
  return (
    <>
      {!user ? <Login /> : user.role === 'doctor' ? <DoctorHome /> : user.role === 'nurse' ? <NurseHome /> : <PatientHome />}
      <SourcePanel />
      <Toasts />
      <footer className="simbanner"><span className="simbanner__long">ABDM sandbox simulator · not connected to the live ABDM network</span><span className="simbanner__short">ABDM simulator · not live</span></footer>
    </>
  );
}
