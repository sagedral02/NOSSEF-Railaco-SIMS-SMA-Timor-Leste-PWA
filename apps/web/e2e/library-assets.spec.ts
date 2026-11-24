import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

test.describe('F11 library and assets', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop coverage');

  test('librarian checks out and returns a copy by barcode', async ({ page }) => {
    await login(page, 'biblioteka');
    await visit(page, '/library', 'Perpustakaan', 'library-desk');
    await page.getByRole('tab', { name: 'Katalog' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Meja Sirkulasi' }).click();
    const barcode = page.getByLabel('Barcode eksemplar').first();
    await barcode.fill('LIB-015-1');
    await page.getByPlaceholder('Pilih siswa').fill('Ab');
    await page.locator('button', { hasText: 'NOS-' }).first().click();
    await page.getByRole('button', { name: 'Pinjamkan' }).click();
    await expect(page.getByText(/Buku dipinjamkan/)).toBeVisible();
    await page.getByLabel('Barcode eksemplar').nth(1).fill('LIB-015-1');
    await page.getByRole('button', { name: 'Kembalikan' }).click();
    await expect(page.getByText('Buku dikembalikan.').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Peminjaman' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('asset officer opens an asset history', async ({ page }) => {
    await login(page, 'patrimoniu');
    await visit(page, '/assets', 'Inventaris & Aset', 'assets');
    await page.getByRole('button', { name: 'Riwayat' }).first().click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Riwayat' })).toBeVisible();
  });
});
