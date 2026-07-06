// Worker entry point. Runs first for every request (see run_worker_first in
// wrangler.jsonc). Handles www→apex canonicalisation, the /api/contact form
// endpoint, and hangs security headers on every outgoing response.

import { onRequestPost } from '../functions/api/contact.js';

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    // Inline scripts on the site: theme toggle, typewriter, contact form.
    // Turnstile widget script loads from challenges.cloudflare.com.
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    // Astro's inlineStylesheets embeds CSS as <style> blocks.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // Contact form fetches /api/contact (same-origin); Turnstile widget
    // XHRs go to challenges.cloudflare.com.
    "connect-src 'self' https://challenges.cloudflare.com",
    // Turnstile widget renders in an iframe.
    'frame-src https://challenges.cloudflare.com',
    // Modern equivalent of X-Frame-Options: DENY.
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join('; '),
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonicalise: force HTTPS, and collapse www → apex, in a single 301.
    // The Worker runs on both http: and https: for Custom Domains, so we can't
    // rely on CF's "Always Use HTTPS" edge setting to do this for us.
    let needsRedirect = false;
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      needsRedirect = true;
    }
    if (url.hostname === 'www.grimbergit.nl') {
      url.hostname = 'grimbergit.nl';
      needsRedirect = true;
    }
    if (needsRedirect) {
      return withSecurityHeaders(Response.redirect(url.toString(), 301));
    }

    if (url.pathname === '/api/contact') {
      if (request.method === 'POST') {
        return withSecurityHeaders(await onRequestPost({ request, env }));
      }
      if (request.method === 'OPTIONS') {
        return withSecurityHeaders(
          new Response(null, {
            status: 204,
            headers: {
              allow: 'POST',
              'access-control-allow-methods': 'POST, OPTIONS',
              'access-control-allow-headers': 'content-type',
            },
          }),
        );
      }
      return withSecurityHeaders(
        new Response('Method Not Allowed', {
          status: 405,
          headers: { allow: 'POST' },
        }),
      );
    }

    // Everything else: serve from the static asset bucket, decorated.
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
