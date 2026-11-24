'use client';

import { useEffect } from 'react';

/**
 * Applies a `?name=value` deep link once after mount (PRD §64 canonical routes redirect here with ?tab= / ?child=).
 * Read after hydration so statically prerendered pages never mismatch.
 */
export function useQueryParam(name: string, apply: (value: string) => void, allowed?: readonly string[]) {
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value && (!allowed || allowed.includes(value))) apply(value);
    // Deep links are applied once; later navigation inside the page owns the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
