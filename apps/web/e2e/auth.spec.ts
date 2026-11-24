import { expect, test } from '@playwright/test';

import { login } from './helpers';


test('login page renders school branding and demo accounts', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Masuk ke Sistem Informasi NOSSEF' })).toBeVisible();
  await expect.poll(() => page.locator('img[alt="NOSSEF"]').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: `e2e/screens/${info.project.name}-login.png`, fullPage: true });
});

test('wrong password shows stable error code', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/^Username$/).fill('admin');
  await page.getByLabel(/^Kata Sandi$/).fill('salah-sekali');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByText('AUTH_INVALID_CREDENTIALS')).toBeVisible();
});

test('super admin reaches users, roles, school, audit', async ({ page }, info) => {
  await login(page, 'admin');
  await expect(page.getByText('Memuat...')).toHaveCount(0);
  await page.screenshot({ path: `e2e/screens/${info.project.name}-dashboard.png`, fullPage: true });
  for (const [path, heading] of [
    ['/admin/users', 'Pengguna'],
    ['/admin/roles', 'Peran & Izin'],
    ['/admin/school', 'Profil Sekolah'],
    ['/admin/audit', 'Audit Log'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.screenshot({ path: `e2e/screens/${info.project.name}${path.replaceAll('/', '-')}.png`, fullPage: true });
  }
});

test('teacher typing an admin URL sees access denied', async ({ page }) => {
  await login(page, 'agostinho.freitas');
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
});

test('language switch translates the UI', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'TET' }).click();
  await expect(page.getByRole('heading', { name: 'Tama ba Sistema Informasaun NOSSEF' })).toBeVisible();
  await page.getByRole('button', { name: 'ID' }).click();
});
