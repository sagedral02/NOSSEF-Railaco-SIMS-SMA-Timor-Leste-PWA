import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

// PRD §34.7: open assigned class online, go offline, mark, reload (draft remains), reconnect, sync once.
test('homeroom teacher marks attendance offline and syncs exactly once', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'desktop run covers the offline flow');
  await login(page, 'antonio.soares');
  await visit(page, '/attendance/today', 'Absensi Hari Ini');
  const homeroom = page.locator('section', { hasText: 'Absensi harian wali kelas' });
  const openBtn = homeroom.getByRole('button', { name: 'Buka Absensi' });
  if (await openBtn.count()) await openBtn.click();
  else await homeroom.getByRole('link').first().click();
  await page.waitForURL('**/attendance/sessions/**');
  await expect(page.getByRole('radiogroup').first()).toBeVisible();

  // Make sure the service worker controls the page and has cached it, then cut the network.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('radiogroup').first()).toBeVisible();
  await context.setOffline(true);

  const rows = page.getByRole('radiogroup');
  const count = await rows.count();
  await rows.nth(0).getByRole('radio', { name: 'Sakit' }).click();
  await page.getByRole('button', { name: 'Tandai semua Hadir' }).click();
  await expect(page.getByText('Menunggu sinkron')).toHaveCount(count);
  await expect(page.getByText(/Mode offline/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('Data dari cache perangkat')).toBeVisible();
  await expect(page.getByText('Menunggu sinkron')).toHaveCount(count);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Menunggu sinkron')).toHaveCount(0, { timeout: 30_000 });
  await page.screenshot({ path: 'e2e/screens/attendance-session.png', fullPage: true });

  // Server state: exactly one record per student, the first one SICK.
  const sessionId = page.url().split('/').filter(Boolean).pop();
  const data = await page.evaluate(async (id) => (await (await fetch(`/api/v1/attendance/sessions/${id}/`)).json()).data, sessionId);
  expect(data.roster.every((r: { record: unknown }) => r.record)).toBeTruthy();
  expect(data.roster.filter((r: { record: { status: string } }) => r.record.status === 'SICK').length).toBe(1);
  await page.getByRole('button', { name: 'Kirim Absensi' }).click();
  await expect(page.getByText('Absensi terkirim.')).toBeVisible();
});

test('schedules and attendance review screens render', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop coverage');
  await login(page, 'maria.martins');
  await visit(page, '/schedules', 'Jadwal Pelajaran', 'schedules');
  await expect(page.locator('table button').first()).toBeVisible();
  await visit(page, '/schedules/manage', 'Kelola Jadwal');
  await visit(page, '/attendance/review', 'Rekap Absensi Rombel', 'attendance-review');
  await visit(page, '/attendance/leave', 'Izin & Sakit');
});
