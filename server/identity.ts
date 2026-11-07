import { nameMatches } from './sim/abha';

export type Identity = { ok: true } | { ok: false; reason: string };

const ABHA = /(?<!\d)(\d{2})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})(?!\d)/g;
const NAME = /(?:patient(?:'s|’s)?\s*)?\bname\s*[:\-–]\s*([^\n|,;]{3,60})/i;

/**
 * Does a document belong to this patient? If it prints an ABHA number, one of them must be the patient's. If it prints a
 * name, it must be the same person. A document that prints neither is accepted, because many lab slips carry no id, and
 * the person who confirms the values is the safeguard there.
 */
export function identityCheck(pages: string[], who: { name: string; abha: string }): Identity {
  const text = pages.join('\n');
  const seen = [...text.matchAll(ABHA)].map(m => m.slice(1, 5).join(''));
  if (seen.length && !seen.includes(who.abha)) return { ok: false, reason: `This document carries a different ABHA number (ending ${seen[0].slice(-4)}), so it was not added to ${who.name}’s record.` };
  const printed = NAME.exec(text)?.[1]?.trim();
  if (printed && !nameMatches(printed, who.name)) return { ok: false, reason: `This report names a different person. It was not added. Check you picked ${who.name}, then upload again.` };
  return { ok: true };
}
