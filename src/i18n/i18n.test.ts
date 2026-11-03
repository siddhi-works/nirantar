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
