// Worker entry point.
// Runs first only for /api/* (see run_worker_first in wrangler.jsonc).
// Delegates the contact form to the existing handler, otherwise falls back
// to serving static assets (though with run_worker_first scoped to /api/*,
// non-API paths won't reach this code at all).

import { onRequestPost } from '../functions/api/contact.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonicalise: www.grimbergit.nl → apex.
    if (url.hostname === 'www.grimbergit.nl') {
      url.hostname = 'grimbergit.nl';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/api/contact') {
      if (request.method === 'POST') {
        return onRequestPost({ request, env });
      }
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            allow: 'POST',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'content-type',
          },
        });
      }
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { allow: 'POST' },
      });
    }

    // Fallback for any other path that reaches the Worker.
    return env.ASSETS.fetch(request);
  },
};
