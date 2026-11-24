import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

test.describe('F10 BK, discipline, extracurricular', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop coverage');

  test('counselor opens a restricted case and adds a follow-up', async ({ page }) => {
    await login(page, 'konselora');
    await visit(page, '/counseling', 'Konseling BK', 'counseling');
    await page.locator('tbody tr', { hasText: 'Diproses' }).first().click();
    await expect(page.getByText('setiap pembukaan detail tercatat di audit log').first()).toBeVisible();
    await page.getByPlaceholder('Tambah tindak lanjut').fill('Sesi kedua e2e');
    await page.getByRole('button', { name: 'Tambah', exact: true }).first().click();
    await expect(page.getByRole('paragraph').filter({ hasText: 'Sesi kedua e2e' }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await visit(page, '/discipline', 'Kedisiplinan', 'discipline');
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Pemberitahuan wali')).toBeVisible();
  });

  test('teacher cannot open counseling but can report an incident', async ({ page }) => {
    await login(page, 'agostinho.freitas');
    await page.goto('/counseling');
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
    await visit(page, '/discipline', 'Kedisiplinan');
    await expect(page.getByRole('button', { name: 'Catat Pelanggaran' })).toBeVisible();
    await visit(page, '/extracurricular', 'Ekstrakurikuler', 'extracurricular');
    await page.getByRole('button', { name: /Futebol/ }).click();
    await expect(page.getByRole('tab', { name: /Anggota/ })).toBeVisible();
  });
});
