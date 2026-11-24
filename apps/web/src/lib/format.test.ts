import { describe, expect, it } from 'vitest';

import { fmtDateTime, initials, usd } from './format';

describe('format', () => {
  it('formats decimal-string money without float math', () => {
    expect(usd('1234.5')).toBe('$1,234.50');
    expect(usd('0.10')).toBe('$0.10');
    expect(usd('-63.00')).toBe('-$63.00');
    expect(usd(null)).toBe('—');
  });

  it('shows UTC timestamps in Asia/Dili (UTC+9)', () => {
    expect(fmtDateTime('2026-10-14T20:30:00Z', 'id')).toContain('15');
  });

  it('builds initials ignoring honorifics', () => {
    expect(initials('Prof. Cristina Amaral')).toBe('CA');
  });
});
