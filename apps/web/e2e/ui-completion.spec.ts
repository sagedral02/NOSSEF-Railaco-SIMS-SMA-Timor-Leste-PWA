import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

// PRD §17.4 / §64 gaps and ui.md screens closed after the F15 audit.
test.describe('Student 360 tabs, job monitor, directory views, portal additions', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop coverage');

  test('admin: directory tabs, bulk card print, Student 360 documents/finance, jobs, homeroom cards', async ({ page }) => {
    await login(page, 'admin');
    await visit(page, '/students', 'Direktori Siswa');
    await page.getByRole('tab', { name: 'Ketua Kelas' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Siswa Aktif' }).click();
    const firstRow = page.locator('tbody tr').first();
    await firstRow.getByRole('checkbox').check();
    await expect(page.getByText('1 siswa dipilih')).toBeVisible();
    await page.getByRole('button', { name: 'Cetak Kartu' }).click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Kode QR kartu pelajar' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).first().click();
    await page.getByRole('button', { name: 'Batalkan pilihan' }).click();

    await firstRow.click();
    await page.waitForURL('**/students/*');
    await page.getByRole('tab', { name: 'Dokumen' }).click();
    await expect(page.getByText('Gagal memuat data')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Keuangan SPP' }).click();
    await expect(page.getByText('Gagal memuat data')).toHaveCount(0);

    await visit(page, '/admin/jobs', 'Antrean Background Job', 'admin-jobs');
    await page.goto('/staff/teachers');
    await page.getByRole('tab', { name: /Wali Kelas/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Wali Kelas/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tetapkan Ketua Kelas' }).first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screens/homeroom-cards.png', fullPage: true });
  });

  test('guardian: schedule, homeroom contact, leave request, student card', async ({ page }) => {
    await login(page, 'inan-aman');
    await page.getByRole('button', { name: 'Kartu Pelajar' }).first().click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Kode QR kartu pelajar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await visit(page, '/my/schedule', 'Jadwal Pelajaran', 'portal-schedule');
    await visit(page, '/my/attendance', 'Kehadiran');
    await expect(page.getByText('Kontak Wali Kelas')).toBeVisible();
    await page.getByRole('button', { name: 'Ajukan Izin/Sakit' }).click();
    const reason = `Demam ${Date.now()}`;
    await page.getByRole('dialog').getByLabel(/^Alasan/).fill(reason);
    await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText(reason)).toBeVisible();
  });
});
