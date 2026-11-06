import { create } from 'zustand';
import { useSession } from '@/session';

/** Where a person is inside their dashboard. The sidebar (laptop) and the tab bar (phone) both read and set this. */
export type NavItem = { k: string; label: string; icon: string };

export const STAFF_NAV: NavItem[] = [
  { k: 'overview', label: 'Today', icon: 'layout' },
  { k: 'patients', label: 'Patients', icon: 'users' },
  { k: 'register', label: 'Register', icon: 'userplus' },
  { k: 'network', label: 'Network', icon: 'network' },
  { k: 'qr', label: 'Hospital QR', icon: 'qr' },
];
export const PATIENT_NAV: NavItem[] = [
  { k: 'home', label: 'Home', icon: 'home' },
  { k: 'care', label: 'Care', icon: 'heart' },
  { k: 'reports', label: 'Reports', icon: 'file' },
  { k: 'sharing', label: 'Sharing', icon: 'share' },
];

interface NavState { section: string; setSection: (k: string) => void }
export const useNav = create<NavState>(set => ({ section: '', setSection: k => set({ section: k }) }));

export function navFor(role: string | undefined): NavItem[] { return role === 'patient' ? PATIENT_NAV : STAFF_NAV; }

/** The section to show: the chosen one if it exists for this role, otherwise the first. */
export function useSection(): string {
  const role = useSession(s => s.user?.role);
  const section = useNav(s => s.section);
  const items = navFor(role);
  return items.some(i => i.k === section) ? section : items[0].k;
}
