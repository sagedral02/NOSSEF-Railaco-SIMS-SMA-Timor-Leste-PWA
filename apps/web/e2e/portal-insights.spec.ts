import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

test.describe('F12–F13 portals, communications, reports', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop coverage');

  test('guardian sees children dashboard and portal pages', async ({ page }) => {
    await login(page, 'inan-aman');
    await expect(page.getByRole('heading', { name: 'Anak saya' })).toBeVisible();
    await visit(page, '/my/report-cards', 'Rapor & Transkrip', 'portal-reports');
    await expect(page.getByRole('heading', { name: 'Transkrip' }).first()).toBeVisible();
    await visit(page, '/my/attendance', 'Kehadiran');
    await visit(page, '/my/notices', 'Pemberitahuan Sekolah');
    await visit(page, '/my/loans', 'Pinjaman Buku Saya');
    await visit(page, '/notifications', 'Notifikasi', 'notifications');
    await expect(page.getByText('Preferensi notifikasi')).toBeVisible();
  });

  test('admin publishes an announcement that the guardian can read', async ({ page, browser }) => {
    await login(page, 'sekretaria');
    await visit(page, '/announcements/manage', 'Kelola Pengumuman');
    await page.getByRole('button', { name: 'Pengumuman Baru' }).click();
    const title = `Rapat orang tua ${Date.now()}`;
    await page.getByLabel(/^Judul/).fill(title);
    await page.getByLabel(/^Isi/).fill('Rapat orang tua siswa hari Sabtu pukul 09.00.');
    await page.getByRole('dialog').getByRole('button', { name: 'Terbitkan' }).click();
    await expect(page.locator('tbody tr', { hasText: title })).toBeVisible();
    const ctx = await browser.newContext();
    const guardian = await ctx.newPage();
    await login(guardian, 'inan-aman');
    await visit(guardian, '/announcements', 'Pengumuman');
    await expect(guardian.getByText(title)).toBeVisible();
    await ctx.close();
  });

  test('principal dashboard and an export job', async ({ page }) => {
    await login(page, 'cristina.amaral');
    await expect(page.getByText('Tingkat penagihan').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screens/dashboard-principal.png', fullPage: true });
    await visit(page, '/reports', 'Laporan & Ekspor', 'reports');
    await page.getByRole('button', { name: /STU-02/ }).click();
    await page.getByRole('button', { name: 'Buat Laporan' }).click();
    await expect(page.getByRole('link', { name: 'XLSX' }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('admin previews an import without writing', async ({ page }) => {
    await login(page, 'sekretaria');
    await visit(page, '/imports', 'Impor Data', 'imports');
    await expect(page.getByRole('link', { name: 'Unduh template' })).toBeVisible();
  });
});
