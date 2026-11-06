import { describe, expect, it } from 'vitest';
import { todayIST } from './time';

describe('today in India', () => {
  it('is already the next day shortly after midnight IST, when UTC is still the day before', () => {
    expect(todayIST(new Date('2026-11-05T19:00:00Z'))).toBe('2026-11-06'); // 00:30 IST on the 6th
    expect(new Date('2026-11-05T19:00:00Z').toISOString().slice(0, 10)).toBe('2026-11-05');
  });
  it('is still the same day late in the evening IST', () => {
    expect(todayIST(new Date('2026-11-06T17:00:00Z'))).toBe('2026-11-06'); // 22:30 IST
  });
  it('rolls over at 18:30 UTC', () => {
    expect(todayIST(new Date('2026-11-06T18:29:00Z'))).toBe('2026-11-06');
    expect(todayIST(new Date('2026-11-06T18:30:00Z'))).toBe('2026-11-07');
  });
});
