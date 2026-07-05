import { test, expect } from '@playwright/test';

test('blog index lists at least one post', async ({ page }) => {
  await page.goto('/blog/');
  const cards = page.locator('[data-testid="post-list"] article.post-card');
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(1);
});

test('opening a post renders its content', async ({ page }) => {
  await page.goto('/blog/');
  const firstLink = page.locator('[data-testid="post-list"] article.post-card h3 a').first();
  const title = (await firstLink.textContent())?.trim() ?? '';
  expect(title.length).toBeGreaterThan(0);
  await firstLink.click();
  await expect(page.locator('h1')).toHaveText(title);
});
