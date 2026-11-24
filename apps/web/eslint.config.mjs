import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'next-env.d.ts'] },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Scattered fetch is forbidden (PRD §35.2): use src/lib/api.ts.
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use the typed API layer in src/lib/api.ts.' }],
    },
  },
  { files: ['src/lib/api.ts', 'src/lib/offline/**', 'e2e/**'], rules: { 'no-restricted-globals': 'off' } },
];

export default config;
