import { create } from 'zustand';
import type { AbsenceEvidence, Citation, Role } from '@/domain/types';

export type SourceTarget =
  | { kind: 'citation'; citation: Citation; patientId: string; title?: string }
  | { kind: 'absence'; absence: AbsenceEvidence; patientId: string; title: string };

interface Toast { id: number; msg: string; tone: 'ok' | 'error' }

interface UiState {
  role: Role;
  setRole: (r: Role) => void;
  source: SourceTarget | null;
  openSource: (s: SourceTarget) => void;
  closeSource: () => void;
  loopGapId: string | null;
  openLoop: (gapId: string) => void;
  closeLoop: () => void;
  paletteOpen: boolean;
  setPalette: (v: boolean) => void;
  toasts: Toast[];
  toast: (msg: string, tone?: 'ok' | 'error') => void;
}

const loadRole = (): Role => {
  try { const r = localStorage.getItem('nirantar-role'); if (r === 'doctor' || r === 'nurse' || r === 'coordinator') return r; } catch { /* ignore */ }
  return 'doctor';
};

// Where focus should return when the citation panel closes (PRD: "returns focus to the exact element that was opened")
let sourceTrigger: HTMLElement | null = null;
let toastSeq = 0;

export const useUi = create<UiState>((set, get) => ({
  role: loadRole(),
  setRole: r => { try { localStorage.setItem('nirantar-role', r); } catch { /* ignore */ } set({ role: r }); },
  source: null,
  openSource: s => { sourceTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null; set({ source: s }); },
  closeSource: () => { set({ source: null }); const el = sourceTrigger; sourceTrigger = null; if (el?.isConnected) requestAnimationFrame(() => el.focus()); },
  loopGapId: null,
  openLoop: gapId => set({ loopGapId: gapId }),
  closeLoop: () => set({ loopGapId: null }),
  paletteOpen: false,
  setPalette: v => set({ paletteOpen: v }),
  toasts: [],
  toast: (msg, tone = 'ok') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, msg, tone }] });
    setTimeout(() => set({ toasts: get().toasts.filter(t => t.id !== id) }), tone === 'error' ? 6000 : 3200);
  },
}));
