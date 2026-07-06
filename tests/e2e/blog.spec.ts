import { test, expect } from '@playwright/test';

test('blog index lists at least one post', async ({ page }) => {
  await page.goto('/blog/');
  // Each post card is an <article>; getByRole('article') matches all of them.
  const posts = page.getByRole('article');
  await expect(posts.first()).toBeVisible();
  const n = await posts.count();
  expect(n).toBeGreaterThanOrEqual(1);
});

test('opening a post renders its content', async ({ page }) => {
  await page.goto('/blog/');
  // First article's title link — the accessible name is the post title.
  const firstTitleLink = page.getByRole('article').first().getByRole('link').first();
  const title = (await firstTitleLink.textContent())?.trim() ?? '';
  expect(title.length).toBeGreaterThan(0);
  await firstTitleLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});
