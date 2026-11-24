// PRD §35.5: fallback locale configured and a missing-key test available.
import { describe, expect, it } from 'vitest';

import { translate } from './index';
import { messages as typed } from './messages';

// Widened on purpose: the literal tuple union of every key is too large for tsc to map over.
const messages: Record<string, readonly string[]> = typed;

describe('i18n dictionaries', () => {
  it('every key has non-empty id/tet/pt text', () => {
    const missing = Object.entries(messages).filter(([, row]) => row.length !== 3 || row.some((s) => !s.trim()));
    expect(missing.map(([k]) => k)).toEqual([]);
  });

  it('placeholders are consistent across locales', () => {
    const bad = Object.entries(messages).filter(([, row]) => {
      const sets = row.map((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(','));
      return new Set(sets).size > 1;
    });
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it('interpolates variables and falls back to the key for unknown entries', () => {
    expect(translate('id', 'dash.welcome', { name: 'Ana' })).toBe('Selamat datang, Ana');
    expect(translate('pt', 'no.such.key')).toBe('no.such.key');
  });
});
