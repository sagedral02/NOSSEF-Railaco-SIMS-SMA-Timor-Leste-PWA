export type Locale = 'id' | 'tet' | 'pt';
/** One translation row: [Bahasa Indonesia, Tetun, Português]. */
export type Entry = readonly [string, string, string];
export type Dict = Record<string, Entry>;

export const LOCALES: { code: Locale; short: string; name: string }[] = [
  { code: 'tet', short: 'TET', name: 'Tetun' },
  { code: 'pt', short: 'PT', name: 'Português' },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia' },
];
export const LOCALE_INDEX: Record<Locale, 0 | 1 | 2> = { id: 0, tet: 1, pt: 2 };
export const FALLBACK_LOCALE: Locale = 'id';
