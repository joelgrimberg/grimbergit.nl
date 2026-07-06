import { test, expect } from '@playwright/test';

const EMAIL = 'joel@grimbergit.nl';

test('contact page shows the correct mailto', async ({ page }) => {
  await page.goto('/contact/');
  const link = page.getByRole('link', { name: EMAIL });
  await expect(link).toHaveAttribute('href', `mailto:${EMAIL}`);
});

test('contact form fields render with required/maxlength constraints', async ({ page }) => {
  await page.goto('/contact/');
  const form = page.getByRole('form', { name: 'Contact form' });
  await expect(form).toBeVisible();

  await expect(form.getByLabel('Name')).toHaveAttribute('required', '');
  await expect(form.getByLabel('Email')).toHaveAttribute('type', 'email');
  await expect(form.getByLabel('Email')).toHaveAttribute('required', '');
  await expect(form.getByLabel('Message')).toHaveAttribute('required', '');
  await expect(form.getByLabel('Message')).toHaveAttribute('maxlength', '4000');

  await expect(form.getByRole('button', { name: 'Send message' })).toBeVisible();
});

test('honeypot field is present and positioned off-screen', async ({ page }) => {
  await page.goto('/contact/');
  // Honeypot is intentionally NOT accessible — attribute selector is the
  // correct query here; an accessibility-first query would (rightly) skip it.
  const hp = page.locator('input[name="_website"]');
  await expect(hp).toHaveCount(1);
  const box = await hp.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  expect(box.x).toBeLessThan(-1000);
});

test('submit with missing fields blocked by native validation', async ({ page }) => {
  await page.goto('/contact/');
  const form = page.getByRole('form', { name: 'Contact form' });
  await form.getByRole('button', { name: 'Send message' }).click();
  const valid = await form.evaluate((el) => (el as HTMLFormElement).checkValidity());
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
  const form = page.getByRole('form', { name: 'Contact form' });
  await form.getByLabel('Name').fill('Ada Lovelace');
  await form.getByLabel('Email').fill('ada@example.com');
  await form.getByLabel('Subject').fill('Analytical Engine');
  await form.getByLabel('Message').fill('Would love to discuss punched cards.');
  // Set a fake Turnstile token. If Turnstile's own hidden input has already
  // been injected by its script, overwrite its value; otherwise create ours.
  // `form.elements.namedItem(...)` returns the first match, so appending a
  // second input wouldn't help.
  await form.evaluate((f) => {
    let input = f.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'cf-turnstile-response';
      f.appendChild(input);
    }
    input.value = 'test-token';
  });
  await form.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByRole('status')).toHaveText('Thanks — your message is on its way.');
  expect(received).toMatchObject({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Analytical Engine',
    message: 'Would love to discuss punched cards.',
  });
});

test('honeypot submission is silently accepted (bot path)', async ({ page }) => {
  await page.goto('/contact/');
  const form = page.getByRole('form', { name: 'Contact form' });
  await form.getByLabel('Name').fill('spammer');
  await form.getByLabel('Email').fill('bot@example.com');
  await form.getByLabel('Message').fill('buy my thing');
  // Force-fill the honeypot the way a naive bot would (attribute selector — see note above).
  await page.locator('input[name="_website"]').evaluate((el) => {
    (el as HTMLInputElement).value = 'http://evil.example';
  });
  await form.getByRole('button', { name: 'Send message' }).click();

  // Page must NOT navigate away (no mailto: launch), and status shows the fake-success message.
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(page.getByRole('status')).toHaveText('Thanks — your message is on its way.');
});
