import { test } from '@playwright/test';
import { login } from './helpers';
test('debug sw cache', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await login(page, 'admin');
  await page.goto('/academic/years');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  await page.reload();
  await page.waitForTimeout(1500);
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) if (!r.url.includes('_rsc')) out.push(`${n} ${r.url}`);
    return out;
  });
  console.log(keys.join('\n'));
  const res = await page.evaluate(async () => { const r = await fetch('/academic/years', { headers: { accept: 'text/html' } }); return [r.status, r.type, r.headers.get('cache-control'), r.headers.get('vary')]; });
  console.log(res);
});
