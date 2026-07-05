import { test, expect } from '@playwright/test';

const EMAIL = 'joel@grimbergit.nl';

test('contact page shows the correct mailto', async ({ page }) => {
  await page.goto('/contact/');
  const link = page.locator('[data-testid="contact-email"]');
  await expect(link).toHaveAttribute('href', `mailto:${EMAIL}`);
  await expect(link).toHaveText(EMAIL);
});

test('contact form fields render with required/maxlength constraints', async ({ page }) => {
  await page.goto('/contact/');
  const form = page.locator('[data-testid="contact-form"]');
  await expect(form).toBeVisible();

  await expect(form.locator('input[name="name"]')).toHaveAttribute('required', '');
  await expect(form.locator('input[name="email"]')).toHaveAttribute('type', 'email');
  await expect(form.locator('input[name="email"]')).toHaveAttribute('required', '');
  await expect(form.locator('textarea[name="message"]')).toHaveAttribute('required', '');
  await expect(form.locator('textarea[name="message"]')).toHaveAttribute('maxlength', '4000');

  await expect(form.locator('button[type="submit"]')).toHaveText('Send message');
});

test('honeypot field is present and positioned off-screen', async ({ page }) => {
  await page.goto('/contact/');
  const hp = page.locator('[data-testid="contact-form"] input[name="_website"]');
  await expect(hp).toHaveCount(1);
  const box = await hp.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  // Wrapped in .hp { position:absolute; left:-10000px; width:1px; height:1px }
  expect(box.x).toBeLessThan(-1000);
});

test('submit with missing fields blocked by native validation', async ({ page }) => {
  await page.goto('/contact/');
  await page.locator('[data-testid="contact-form"] button[type="submit"]').click();
  const valid = await page.locator('[data-testid="contact-form"]').evaluate((el) => {
    return (el as HTMLFormElement).checkValidity();
  });
  expect(valid).toBe(false);
});

test('form POSTs valid submission to /api/contact and shows success', async ({ page }) => {
  let received: Record<string, unknown> | null = null;
  await page.route('**/api/contact', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    received = JSON.parse(route.request().postData() ?? '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/contact/');
  const form = page.locator('[data-testid="contact-form"]');
  await form.locator('input[name="name"]').fill('Ada Lovelace');
  await form.locator('input[name="email"]').fill('ada@example.com');
  await form.locator('input[name="subject"]').fill('Analytical Engine');
  await form.locator('textarea[name="message"]').fill('Would love to discuss punched cards.');
  await form.locator('button[type="submit"]').click();

  await expect(page.locator('[data-testid="form-status"]')).toHaveText(
    'Thanks — your message is on its way.',
  );
  expect(received).toMatchObject({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Analytical Engine',
    message: 'Would love to discuss punched cards.',
  });
});

test('honeypot submission is silently accepted (bot path)', async ({ page }) => {
  await page.goto('/contact/');
  const form = page.locator('[data-testid="contact-form"]');
  await form.locator('input[name="name"]').fill('spammer');
  await form.locator('input[name="email"]').fill('bot@example.com');
  await form.locator('textarea[name="message"]').fill('buy my thing');
  // Force-fill the honeypot the way a naive bot would.
  await form.locator('input[name="_website"]').evaluate((el) => {
    (el as HTMLInputElement).value = 'http://evil.example';
  });
  await form.locator('button[type="submit"]').click();

  // Page must NOT navigate away (no mailto: launch), and status shows the fake-success message.
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(page.locator('[data-testid="form-status"]')).toHaveText(
    'Thanks — your message is on its way.',
  );
});
