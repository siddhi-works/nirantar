import { useEffect, useState } from 'react';
import { useSession } from '@/session';
import { SourcePanel } from '@/ui/CitationPanel';
import Login from '@/pages/Login';
import { DoctorHome, NurseHome } from '@/pages/Homes';
import PatientHome from '@/pages/PatientHome';
import { Toasts } from '@/pages/Chrome';

import { ErrorBoundary } from './pages/ErrorBoundary';
import RegisteredPatientHome from './pages/RegisteredPatientHome';
import { isRegisteredId } from './pages/RegisterPatient';

export default function App() {
  const user = useSession(s => s.user);
  const ready = useSession(s => s.ready);
  useEffect(() => { void useSession.getState().init(); }, []);
  if (!ready) return <Splash />;
  return (
    <>
      <ErrorBoundary>{!user ? <Login /> : user.role === 'doctor' ? <DoctorHome /> : user.role === 'nurse' ? <NurseHome /> : isRegisteredId(user.patientId) ? <RegisteredPatientHome /> : <PatientHome />}</ErrorBoundary>
      <footer className="site-foot"><p>Health-a-thon Round 2 Submission | Centre for AI and Medical Technology, India (CAMT INDIA) | Team ID 61GBBZ</p></footer>
      <SourcePanel />
      <Toasts />
      <footer className="simbanner"><span className="simbanner__long">ABDM sandbox simulator · not connected to the live ABDM network</span><span className="simbanner__short">ABDM simulator · not live</span></footer>
    </>
  );
}

/** Shown while the first check runs. After a quiet spell the database needs a few seconds to wake up. */
function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 9000); return () => clearTimeout(t); }, []);
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash__dot" aria-hidden="true" />
      <h1>Nirantar</h1>
      <p>Starting up. The first visit after a quiet period can take a few seconds while the database wakes.</p>
      {slow && <p className="splash__slow">Taking longer than usual. <button className="linklike" onClick={() => location.reload()}>Reload the page</button></p>}
    </div>
  );
}
