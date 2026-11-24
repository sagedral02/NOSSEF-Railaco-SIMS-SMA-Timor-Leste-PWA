import type { NextConfig } from 'next';

// The browser talks to a single origin; Next proxies /api/* to Django so the session and CSRF
// cookies stay same-origin (PRD §13, F1-05). In production the reverse proxy routes /api/* directly.
const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:8000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // CSP (F14-08). Next injects inline bootstrap scripts, hence 'unsafe-inline'; dev mode additionally needs eval.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Versions the service worker per build so clients notice updates (PRD §34.6).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID || new Date().toISOString().replace(/\D/g, '').slice(0, 14) },
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Django routes end with "/"; keep the trailing slash when proxying (two rules, most specific first).
    return [
      { source: '/api/:path*/', destination: `${API_ORIGIN}/api/:path*/` },
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
  // PRD §64 canonical routes whose screens are consolidated (portal under /my/*, sub-pages as tabs/drawers).
  // Temporary redirects keep every catalogued URL working without duplicating screens.
  async redirects() {
    const to = (source: string, destination: string) => ({ source, destination, permanent: false });
    return [
      to('/academic/trimestres', '/academic/years'),
      to('/attendance/classes/:assignmentId', '/attendance/today'),
      to('/attendance/reports', '/reports'),
      to('/communications/announcements', '/announcements/manage'),
      to('/counseling/:id', '/counseling'),
      to('/extracurricular/manage', '/extracurricular'),
      to('/finance/fee-plans', '/finance/fees'),
      to('/finance/invoices/:id', '/finance/invoices'),
      to('/finance/payments/pending', '/finance/payments'),
      to('/finance/reports', '/reports'),
      to('/grades/assessments', '/grades/gradebook'),
      to('/grades/assessments/:id', '/grades/gradebook'),
      to('/grades/finalization', '/grades/gradebook'),
      to('/library/circulation', '/library?tab=desk'),
      to('/library/manage', '/library?tab=catalog'),
      to('/assets/:id', '/assets'),
      to('/reports/report-cards/:id', '/reports/report-cards'),
      to('/reports/transcripts', '/students'),
      to('/students/:id/enrollment', '/students/:id?tab=enrollments'),
      to('/students/:id/guardians', '/students/:id?tab=guardians'),
      to('/students/:id/documents', '/students/:id?tab=documents'),
      to('/students/:id/attendance', '/students/:id?tab=attendance'),
      to('/students/:id/grades', '/students/:id?tab=grades'),
      to('/students/:id/finance', '/students/:id?tab=finance'),
      to('/student/home', '/dashboard'),
      to('/student/schedule', '/my/schedule'),
      to('/student/attendance', '/my/attendance'),
      to('/student/grades', '/my/report-cards'),
      to('/student/report-cards', '/my/report-cards'),
      to('/student/finance', '/my/finance'),
      to('/student/library', '/my/loans'),
      to('/guardian/home', '/dashboard'),
      to('/guardian/children/:id/attendance', '/my/attendance?child=:id'),
      to('/guardian/children/:id/report-cards', '/my/report-cards?child=:id'),
      to('/guardian/children/:id/finance', '/my/finance?child=:id'),
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default config;
