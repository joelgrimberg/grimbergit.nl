import { test, expect } from '@playwright/test';

test('security headers are set by Caddy', async ({ request }) => {
  const resp = await request.get('/');
  const h = resp.headers();
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['content-security-policy']).toContain("default-src 'self'");
});
