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
  /** The signed-in app has two views: the workspace, and the network and sharing view. */
  view: 'main' | 'share';
  setView: (v: 'main' | 'share') => void;
  setPhotoVersion: (v: string | null) => void;
}

function tabFlag(set?: boolean): boolean {
  try { if (set) sessionStorage.setItem('nirantar_tab', '1'); return sessionStorage.getItem('nirantar_tab') === '1'; } catch { return true; }
}

export const useSession = create<Session>(set => ({
  ready: false, user: null, openId: null, view: 'main',
  init: async () => {
    // A new visit to the site starts at the sign-in page. A refresh in the same tab keeps the person signed in.
    let user = await api.me();
    if (user && !tabFlag()) user = null; // the server session is left alone, so a second tab does not sign the first one out
    set({ user, ready: true });
  },
  login: user => { tabFlag(true); set({ user, openId: null, view: 'main' }); },
  logout: async () => { await api.logout(); set({ user: null, openId: null }); },
  openPatient: id => set({ openId: id }),
  closePatient: () => set({ openId: null }),
  setView: view => set({ view, openId: null }),
  setPhotoVersion: v => set(s => ({ user: s.user ? { ...s.user, photoVersion: v } : s.user })),
}));

// A rejected session anywhere sends the person back to the login screen.
api.onUnauthorized(() => useSession.setState({ user: null, openId: null }));

export const digits = (s: string) => s.replace(/\D/g, '');
export const formatAbha = (s: string) => {
  const d = digits(s).slice(0, 14);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].filter(Boolean).join('-');
};
