import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { ServiceWorker } from '@/components/service-worker';

import './globals.css';
import { Providers } from './providers';

const outfit = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-outfit', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-jakarta', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SIMS NOSSEF Railaco', template: '%s · NOSSEF' },
  description: 'Sistem Informasi Manajemen Sekolah — Escola Secundária Católica Nossa Senhora de Fátima (NOSSEF) Railaco',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/crest.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'NOSSEF', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#1E1919',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${outfit.variable} ${jakarta.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>
          {children}
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
