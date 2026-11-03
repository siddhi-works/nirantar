import { create } from 'zustand';
import { api } from '@/api';
import type { AppRole, SessionUser } from '@/domain/api';

export type { AppRole };
export type User = SessionUser;

interface Session {
  /** False until the first check of the server session has finished, so a refresh does not flash the login page. */
  ready: boolean;
  user: User | null;
  /** patient record opened by a doctor / nurse after an ABHA lookup */
  openId: string | null;
  init: () => Promise<void>;
  login: (u: User) => void;
  logout: () => Promise<void>;
  openPatient: (id: string) => void;
  closePatient: () => void;
}

export const useSession = create<Session>(set => ({
  ready: false, user: null, openId: null,
  init: async () => { set({ user: await api.me(), ready: true }); },
  login: user => set({ user, openId: null }),
  logout: async () => { await api.logout(); set({ user: null, openId: null }); },
  openPatient: id => set({ openId: id }),
  closePatient: () => set({ openId: null }),
}));

// A rejected session anywhere sends the person back to the login screen.
api.onUnauthorized(() => useSession.setState({ user: null, openId: null }));

export const digits = (s: string) => s.replace(/\D/g, '');
export const formatAbha = (s: string) => {
  const d = digits(s).slice(0, 14);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].filter(Boolean).join('-');
};
