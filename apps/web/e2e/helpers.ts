import { expect, type Page } from '@playwright/test';

export const PASSWORD = process.env.DEMO_PASSWORD ?? 'nossef2026';

export async function login(page: Page, username: string) {
  await page.goto('/login');
  const submit = page.getByRole('button', { name: 'Masuk', exact: true });
  // Re-fill until React has hydrated and accepted the values (the button enables only then).
  await expect(async () => {
    await page.getByLabel(/^Username$/).fill(username);
    await page.getByLabel(/^Kata Sandi$/).fill(PASSWORD);
    await expect(submit).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await submit.click();
  await page.waitForURL('**/dashboard');
}

/** Visit a page, assert its H1, wait for skeletons to disappear and that no error state rendered. */
export async function visit(page: Page, path: string, heading: string | RegExp, shot?: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText('Gagal memuat data')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toHaveCount(0);
  if (shot) await page.screenshot({ path: `e2e/screens/${shot}.png`, fullPage: true });
}
