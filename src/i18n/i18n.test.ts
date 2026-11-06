import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HI } from './hi';
import { translate } from './index';
import { buildChecks } from '@/pages/Checks';
import { buildRecall } from '../../server/core/engine';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const literalsIn = (file: string) => [...readFileSync(file, 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, "'"));

describe('Hindi dictionary', () => {
  it('keeps the same placeholders as the English sentence, so no value is lost or invented', () => {
    for (const [en, hi] of Object.entries(HI)) expect(placeholders(hi), en).toEqual(placeholders(en));
  });

  it('has an entry for every fixed sentence the screens ask to translate', () => {
    const missing: string[] = [];
    for (const dir of ['src/pages', 'src/i18n', 'src/ui']) {
      for (const f of readdirSync(dir).filter(n => n.endsWith('.tsx'))) {
        for (const lit of literalsIn(join(dir, f))) if (!(lit in HI)) missing.push(`${f}: ${lit}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers every group title and row label the checks list can show', () => {
    const missing = new Set<string>();
    for (const id of ['P1', 'P2']) {
      for (const s of buildChecks(buildRecall(id))) {
        if (!(s.title in HI)) missing.add(s.title);
        for (const r of s.rows) if (!(r.label in HI) && r.label !== 'HbA1c') missing.add(r.label);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('has no empty or untranslated entries', () => {
    for (const [en, hi] of Object.entries(HI)) { expect(hi.trim(), en).not.toBe(''); }
  });
});

describe('translate', () => {
  it('uses Hindi, fills in values, and falls back to English for anything unknown', () => {
    expect(translate('Namaste, {name}', 'hi', { name: 'Savitri' })).toBe('नमस्ते, Savitri');
    expect(translate('Namaste, {name}', 'en', { name: 'Savitri' })).toBe('Namaste, Savitri');
    expect(translate('Something not in the dictionary', 'hi')).toBe('Something not in the dictionary');
  });
});

describe('page translation helpers', () => {
  it('turns a date or a visit label into Hindi without asking the server', async () => {
    const { _test } = await import('./page');
    expect(_test.lookup('3 Dec 2027')).toBe('3 दिसंबर 2027');
    expect(_test.lookup('Friday, 6 November 2026')).toBe('शुक्रवार, 6 नवंबर 2026');
    expect(_test.lookup('Visit 5, 3 Dec 2027')).toBe('विज़िट 5, 3 दिसंबर 2027');
    expect(_test.lookup('Open source: Rx slip · V1')).toBe('स्रोत खोलें: दवा पर्ची · V1');
    expect(_test.lookup('Something only the server can translate')).toBeUndefined();
  });

  it('leaves ids, numbers and single names alone', async () => {
    const { _test } = await import('./page');
    for (const s of ['91-2612-3348-1056', 'IN2900011882', '142', 'Metformin', 'mg/dL']) expect(_test.wordy(s), s).toBe(false);
    expect(_test.wordy('Use this number')).toBe(true);
  });

  it('cuts a long text into short pieces so the first can start playing early', async () => {
    const { speechChunks } = await import('./index');
    const text = 'Your sugar is under control. Keep taking Metformin after food. Walk for thirty minutes every day, and avoid sugar and sweets as far as you can; come back in three months for a review.';
    const parts = speechChunks(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBeLessThan(120);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(text);
    expect(speechChunks('Short.')).toEqual(['Short.']);
  });
});
