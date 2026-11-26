const ALLOWED_ORIGINS = new Set([
  'https://comemor.tech',
  'https://www.comemor.tech'
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://api.github.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests'
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'document-domain=(), geolocation=(), camera=(), microphone=()'
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await request.json();
  if (ct.includes('multipart/form-data')) return Object.fromEntries(await request.formData());
  return Object.fromEntries(new URLSearchParams(await request.text()));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/waitlist') {
      if (request.method !== 'POST') {
        return withSecurityHeaders(Response.json({ success: false, message: 'Method not allowed' }, { status: 405 }));
      }

      const origin = request.headers.get('Origin');
      const isLocalhost = origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
      if (origin && !ALLOWED_ORIGINS.has(origin) && !isLocalhost) {
        return withSecurityHeaders(Response.json({ success: false, message: 'Forbidden origin' }, { status: 403 }));
      }

      if (!env.LOOPS_ENDPOINT || !env.LOOPS_MAILING_LIST_ID) {
        return withSecurityHeaders(Response.json({ success: false, message: 'Waitlist is not configured on the server.' }, { status: 500 }));
      }

      let data;
      try {
        data = await readBody(request);
      } catch {
        return withSecurityHeaders(Response.json({ success: false, message: 'Invalid request body.' }, { status: 400 }));
      }

      // Server-side honeypot check
      if (data.website) {
        return withSecurityHeaders(Response.json({ success: true }));
      }

      const email = String(data.email || '').trim().toLowerCase();
      const teamSize = String(data.teamSize || '').trim();
      const primaryHost = String(data.primaryHost || '').trim();

      if (!email || email.length > 254 || !EMAIL_RE.test(email) || !teamSize || !primaryHost) {
        return withSecurityHeaders(Response.json({ success: false, message: 'Please complete all required fields.' }, { status: 400 }));
      }

      const payload = new URLSearchParams({
        email,
        teamSize,
        primaryHost,
        userGroup: 'team-cloud-waitlist',
        mailingLists: env.LOOPS_MAILING_LIST_ID,
        source: 'comemor-waitlist'
      }).toString();

      const upstream = await fetch(env.LOOPS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload
      });

      const text = await upstream.text();
      return withSecurityHeaders(new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
  }
};
