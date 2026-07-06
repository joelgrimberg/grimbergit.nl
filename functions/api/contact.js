// Cloudflare Pages Function → routed as POST /api/contact.
//
// Wires the contact form on /contact to Resend. Requires the following env var
// set on the Cloudflare Pages project (Production + Preview scopes):
//
//   RESEND_API_KEY = <re_… key from https://resend.com/api-keys>
//
// Sender domain grimbergit.nl must be verified in Resend
// (Resend dashboard → Domains → Add). No wildcard needed — just the apex.

const MAX = { name: 120, email: 254, subject: 140, message: 4000 };
const FROM = 'grimbergIT contact <contact@grimbergit.nl>';
const TO = ['joel@grimbergit.nl'];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function clean(v, max) {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\r\n]+/g, '\n')
    .trim()
    .slice(0, max);
}

function isEmail(v) {
  return typeof v === 'string' && v.length <= MAX.email && EMAIL_RE.test(v);
}

async function verifyTurnstile(token, secret, remoteIp) {
  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('response', token);
  if (remoteIp) params.set('remoteip', remoteIp);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!resp.ok) return { success: false, 'error-codes': ['siteverify-http-' + resp.status] };
  return resp.json();
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
    return json({ error: 'server-misconfigured' }, 500);
  }

  // Accept either JSON (JS fetch path) or form-encoded (no-JS submit).
  let body;
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) {
      body = await request.json();
    } else if (
      ct.includes('application/x-www-form-urlencoded') ||
      ct.includes('multipart/form-data')
    ) {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    } else {
      return json({ error: 'unsupported-media-type' }, 415);
    }
  } catch {
    return json({ error: 'invalid-body' }, 400);
  }

  // Honeypot: silently accept, don't leak that the request was rejected.
  if (typeof body._website === 'string' && body._website.length > 0) {
    return json({ ok: true });
  }

  // Turnstile verification — required.
  const turnstileToken = body['cf-turnstile-response'];
  if (typeof turnstileToken !== 'string' || turnstileToken.length === 0) {
    return json({ error: 'missing-turnstile-token' }, 400);
  }
  const remoteIp = request.headers.get('cf-connecting-ip') || undefined;
  const verify = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, remoteIp);
  if (!verify.success) {
    return json({ error: 'turnstile-failed', codes: verify['error-codes'] ?? [] }, 403);
  }

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const subject = clean(body.subject, MAX.subject);
  const message = clean(body.message, MAX.message);

  if (!name || !isEmail(email) || !message) {
    return json({ error: 'invalid-input' }, 400);
  }

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: TO,
      reply_to: email,
      subject: subject ? `[grimbergit.nl] ${subject}` : `[grimbergit.nl] Message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}\n`,
    }),
  });

  if (!resendResp.ok) {
    const detail = (await resendResp.text()).slice(0, 200);
    return json({ error: 'send-failed', detail }, 502);
  }

  return json({ ok: true });
};

// Optional: reject non-POST with 405 (nice for debugging in the browser).
export const onRequest = async ({ request }) => {
  if (request.method === 'POST') return; // fall through to onRequestPost
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: 'POST' },
  });
};
