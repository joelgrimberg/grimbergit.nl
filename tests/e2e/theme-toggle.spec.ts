import { test, expect } from '@playwright/test';

test('default theme is serene', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'serene');
});

test('toggle switches to nerd and back, persists across reload', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#theme-toggle');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nerd');

  // Reload → still nerd (localStorage persistence).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nerd');

  // Toggle back.
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'serene');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'serene');
});

test('nord wallpaper is visible only in nerd mode', async ({ page }) => {
  await page.goto('/');

  const readOpacityToken = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--wallpaper-opacity').trim(),
    );

  expect(await readOpacityToken(), 'serene --wallpaper-opacity').toBe('0');

  await page.locator('#theme-toggle').click();
  const nerd = parseFloat(await readOpacityToken());
  expect(nerd, 'nerd --wallpaper-opacity').toBeGreaterThan(0.3);
  expect(nerd, 'nerd --wallpaper-opacity').toBeLessThanOrEqual(1);
});

test('nord wallpaper image loads (HEAD /wallpapers/nord.jpg)', async ({ request }) => {
  const resp = await request.head('/wallpapers/nord.jpg');
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type']).toContain('image/jpeg');
});
