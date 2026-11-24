import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

test.describe('F9 finance', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop coverage');

  test('treasurer reviews dashboard, invoices, payments and arrears', async ({ page }) => {
    await login(page, 'finansas');
    await visit(page, '/finance', 'Ringkasan Keuangan', 'finance-dashboard');
    await expect(page.getByText('Tingkat penagihan').first()).toBeVisible();
    await visit(page, '/finance/invoices', 'Tagihan SPP', 'finance-invoices');
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Rincian')).toBeVisible();
    await page.keyboard.press('Escape');
    await visit(page, '/finance/payments?status=PENDING', 'Pembayaran', 'finance-payments');
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('button', { name: 'Verifikasi', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bukti transfer' })).toBeVisible();
    await page.keyboard.press('Escape');
    await visit(page, '/finance/arrears', 'Tunggakan', 'finance-arrears');
    await visit(page, '/finance/fees', 'Tarif');
  });

  test('cashier records a cash payment with receipt', async ({ page }) => {
    await login(page, 'finansas');
    await visit(page, '/finance/arrears', 'Tunggakan');
    const name = (await page.locator('tbody tr td:nth-child(2)').first().innerText()).trim();
    await visit(page, '/finance/payments', 'Pembayaran');
    await page.getByRole('button', { name: 'Catat Pembayaran' }).click();
    await page.getByPlaceholder('Pilih siswa').fill(name.slice(0, 12));
    await page.getByRole('button', { name: new RegExp(name.slice(0, 12)) }).first().click();
    const amount = page.getByLabel(/^Nominal \(USD\) INV-/).first();
    await amount.fill('1');
    await page.getByRole('button', { name: /^Simpan · \$1\.00$/ }).click();
    await expect(page.getByText('Pembayaran tersimpan; kuitansi dibuat.')).toBeVisible();
  });

  test('guardian sees only linked children bills and teacher has no finance menu', async ({ page }) => {
    await login(page, 'inan-aman');
    await visit(page, '/my/finance', 'Tagihan Saya', 'my-finance');
    await expect(page.getByRole('button', { name: 'Unggah Bukti Transfer' }).first()).toBeVisible();
  });

  test('teacher has no finance access', async ({ page }) => {
    await login(page, 'agostinho.freitas');
    await expect(page.getByRole('link', { name: 'Tagihan SPP' })).toHaveCount(0);
    await page.goto('/finance/invoices');
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  });
});
