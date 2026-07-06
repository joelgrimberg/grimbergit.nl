import { test, expect } from '@playwright/test';

// Security headers are set via public/_headers, which Cloudflare Workers
// Static Assets applies to every response. If a header goes missing here,
// corporate scanners will flag the site.

test('security headers are set by Cloudflare', async ({ request }) => {
  const resp = await request.get('/');
  const h = resp.headers();

  // HSTS: at least one year, includes subdomains.
  expect(h['strict-transport-security']).toContain('max-age=31536000');
  expect(h['strict-transport-security']).toContain('includeSubDomains');

  // MIME sniffing off.
  expect(h['x-content-type-options']).toBe('nosniff');

  // Framing denied — clickjacking protection.
  expect(h['x-frame-options']).toBe('DENY');

  // Referrer scope.
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');

  // Permissions-Policy denies risky browser APIs by default.
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['permissions-policy']).toContain('geolocation=()');

  // CSP: self-first, Turnstile allowed for the contact page's widget.
  const csp = h['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain('https://challenges.cloudflare.com');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("form-action 'self'");
});
