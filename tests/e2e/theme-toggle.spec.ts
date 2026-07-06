import { test, expect } from '@playwright/test';

const themeToggle = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Switch visual mode' });

test('default theme is serene', async ({ page }) => {
  await page.goto('/');
  // data-theme is a design-system state marker on <html>, not user-facing content.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'serene');
});

test('toggle switches to nerd and back, persists across reload', async ({ page }) => {
  await page.goto('/');

  await themeToggle(page).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nerd');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nerd');

  await themeToggle(page).click();
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

  await themeToggle(page).click();
  const nerd = parseFloat(await readOpacityToken());
  expect(nerd, 'nerd --wallpaper-opacity').toBeGreaterThan(0.3);
  expect(nerd, 'nerd --wallpaper-opacity').toBeLessThanOrEqual(1);
});

test('nord wallpaper image loads (HEAD /wallpapers/nord.jpg)', async ({ request }) => {
  const resp = await request.head('/wallpapers/nord.jpg');
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type']).toContain('image/jpeg');
});
