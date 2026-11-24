import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

test.describe('F7–F8 grades and report cards', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop coverage');

  test('teacher opens the gradebook with server-calculated finals', async ({ page }) => {
    await login(page, 'agostinho.freitas');
    await visit(page, '/grades/gradebook', 'Buku Nilai', 'gradebook');
    await expect(page.getByText('TPC 20%').first()).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('curriculum monitors completion, schemes and report cards', async ({ page }) => {
    await login(page, 'maria.martins');
    await visit(page, '/grades/completion', 'Kelengkapan Nilai Trimestre', 'grades-completion');
    await visit(page, '/grades/schemes', 'Skema Penilaian');
    await expect(page.getByText('> 5 / 10').first()).toBeVisible();
    await visit(page, '/reports/report-cards', 'Rapor Trimestre', 'report-cards');
    await page.getByLabel('Trimestre').selectOption({ index: 0 });
    await expect(page.getByText('Terbit').first()).toBeVisible();
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Catatan Wali Kelas')).toBeVisible();
    await page.keyboard.press('Escape');
    await visit(page, '/promotion', 'Kenaikan Kelas & Kelulusan', 'promotion');
    await visit(page, '/national-exams', 'Ujian Nasional Kelas XII');
  });

  test('student 360 shows published report cards and transcript', async ({ page }) => {
    await login(page, 'sekretaria');
    await visit(page, '/students', 'Direktori Siswa');
    await page.locator('tbody tr').first().click();
    await page.getByRole('tab', { name: 'Rapor' }).click();
    await expect(page.getByText('Transkrip')).toBeVisible();
    await expect(page.getByText('T1').first()).toBeVisible();
  });

  test('public QR verification rejects unknown tokens', async ({ page }) => {
    await page.goto('/verify/report/not-a-token');
    await expect(page.getByRole('heading', { name: 'Verifikasi Rapor' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
