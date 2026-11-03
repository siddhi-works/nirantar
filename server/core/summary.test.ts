import { describe, expect, it } from 'vitest';
import { buildRecall } from './engine';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe('summary', () => {
  for (const id of ['P1', 'P2']) {
    it(`reads as 50 to 80 words for ${id}, and every sentence has a source or a stated absence`, () => {
      const r = buildRecall(id);
      const text = r.briefing.map(b => b.text).join(' ');
      console.log(id, words(text), 'words:', text);
      expect(words(text)).toBeGreaterThanOrEqual(50);
      expect(words(text)).toBeLessThanOrEqual(80);
      for (const b of r.briefing) expect(b.citations.length > 0 || !!b.absence).toBe(true);
    });
  }
});
