import { test, expect } from '@playwright/test';

const routes: { path: string; h1: string; title: string }[] = [
  { path: '/', h1: 'Joel Grimberg', title: 'grimbergIT' },
  { path: '/consultancy/', h1: 'Consultancy', title: 'Consultancy — grimbergIT' },
  { path: '/training/', h1: 'Training', title: 'Training — grimbergIT' },
  { path: '/blog/', h1: 'Blog', title: 'Blog — grimbergIT' },
  { path: '/contact/', h1: 'Contact', title: 'Contact — grimbergIT' },
];

for (const { path, h1, title } of routes) {
  test(`GET ${path} renders ${h1}`, async ({ page }) => {
    const resp = await page.goto(path);
    expect(resp?.status(), `${path} status`).toBe(200);
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
  });
}

test('nav lists Home / Consultancy / Training / Blog / Contact (no Talks)', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const links = nav.getByRole('link');
  await expect(links).toHaveCount(5);
  const labels = await links.allTextContents();
  expect(labels.map((s) => s.trim())).toEqual([
    'Home',
    'Consultancy',
    'Training',
    'Blog',
    'Contact',
  ]);
});

test('home hero has no consultancy/training/talks/contact quick links', async ({ page }) => {
  await page.goto('/');
  // The hero region contains the eyebrow, status marker, sr-only h1, and About text —
  // it must not sprout its own CTA links (those live in nav/About body only).
  const hero = page.locator('section.hero');
  // Only the "get in touch" link inside the About-inline block should be present.
  const heroLinks = hero.getByRole('link');
  await expect(heroLinks).toHaveCount(1);
  await expect(heroLinks.first()).toHaveText('get in touch');
});
