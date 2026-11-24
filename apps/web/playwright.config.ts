import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

// E2E against the real stack: Django API (8000) + Next.js production server (3000).
// Requires PostgreSQL running and `manage.py seed_demo_school` applied (synthetic data only).
const api = join(import.meta.dirname, '..', 'api');
const python = [join(api, '.venv', 'Scripts', 'python.exe'), join(api, '.venv', 'bin', 'python')].find(existsSync) ?? 'python';
// Use an installed browser when available (no 200 MB download on school laptops); CI can set PW_CHANNEL=chromium.
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: [
    {
      command: `"${python}" manage.py runserver 127.0.0.1:8000 --noreload`,
      cwd: api,
      // Many logins from one IP during the suite; production keeps the strict default (10/min).
      env: { THROTTLE_LOGIN: '1000/min' },
      url: 'http://127.0.0.1:8000/api/v1/health/live',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm start',
      url: 'http://127.0.0.1:3000/login',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
