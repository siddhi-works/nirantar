import { create } from 'zustand';

export type AppRole = 'doctor' | 'nurse' | 'patient';
export interface User { role: AppRole; name: string; line: string; patientId?: string }

export interface Vitals { patientId: string; sbp: string; dbp: string; weight: string; height: string; pulse: string; by: string }

export interface Upload { id: number; patientId: string; type: string; name: string; size: string; by: string; at: string }

interface Session {
  uploads: Upload[];
  addUpload: (u: Omit<Upload, 'id'>) => void;
  user: User | null;
  /** patient record opened by a doctor / nurse after an ABHA lookup */
  openId: string | null;
  vitals: Vitals | null;
  login: (u: User) => void;
  logout: () => void;
  openPatient: (id: string) => void;
  closePatient: () => void;
  saveVitals: (v: Vitals) => void;
}

export const useSession = create<Session>(set => ({
  user: null, openId: null, vitals: null, uploads: [],
  addUpload: u => set(st => ({ uploads: [{ ...u, id: st.uploads.length + 1 }, ...st.uploads] })),
  login: user => set({ user, openId: null }),
  logout: () => set({ user: null, openId: null }),
  openPatient: id => set({ openId: id }),
  closePatient: () => set({ openId: null }),
  saveVitals: vitals => set({ vitals }),
}));

export const digits = (s: string) => s.replace(/\D/g, '');
export const formatAbha = (s: string) => {
  const d = digits(s).slice(0, 14);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].filter(Boolean).join('-');
};
