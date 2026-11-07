import { FACILITY, OTHER_FACILITY } from '@/data/demo';

export const hospitalName = (hfr: string) => (hfr === FACILITY.hfr ? FACILITY.name : hfr === OTHER_FACILITY.hfr ? OTHER_FACILITY.name : hfr);

/** The facility id in a link such as /?scan=IN0000000001, or null when it is not one of ours. */
export function hfrFromScan(text: string): string | null {
  try { const u = new URL(text, window.location.origin); const h = u.searchParams.get('scan'); return h && /^IN\d{10}$/.test(h) ? h : null; } catch { return null; }
}
