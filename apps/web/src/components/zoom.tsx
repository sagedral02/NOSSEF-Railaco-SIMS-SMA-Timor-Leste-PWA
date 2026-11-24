'use client';

// Display scale preference (85%–160%), kept from the previous UI for low-vision / small-screen users.
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { setPreference, usePreference } from '@/lib/storage';

const ZoomCtx = createContext<{ zoom: number; setZoom: (z: number) => void } | null>(null);
const KEY = 'nossef.zoom';

function clamp(z: number) {
  return Number.isFinite(z) ? Math.min(160, Math.max(85, z)) : 100;
}

export function ZoomProvider({ children }: { children: ReactNode }) {
  const zoom = clamp(Number(usePreference(KEY, '100')));
  useEffect(() => {
    document.documentElement.style.fontSize = `${(16 * zoom) / 100}px`;
  }, [zoom]);
  const setZoom = useCallback((z: number) => setPreference(KEY, String(clamp(z))), []);
  const value = useMemo(() => ({ zoom, setZoom }), [zoom, setZoom]);
  return <ZoomCtx.Provider value={value}>{children}</ZoomCtx.Provider>;
}

export function useZoom() {
  const ctx = useContext(ZoomCtx);
  if (!ctx) throw new Error('useZoom must be used inside ZoomProvider');
  return ctx;
}
