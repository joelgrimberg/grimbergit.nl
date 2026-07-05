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

export const onRequestPost = async ({ request, env }) => {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'server-misconfigured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid-json' }, 400);
  }

  // Honeypot: silently accept, don't leak that the request was rejected.
  if (typeof body._website === 'string' && body._website.length > 0) {
    return json({ ok: true });
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
