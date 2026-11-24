/**
 * Cloudflare Pages Function: /api/waitlist
 * Handles Team Cloud waitlist submissions and securely proxies them to Loops.so.
 *
 * Secrets and API endpoints are loaded from server-side environment variables:
 * - LOOPS_ENDPOINT (or LOOPS_FORM_ENDPOINT): e.g. https://app.loops.so/api/newsletter-form/<formId>
 * - LOOPS_MAILING_LIST_ID: e.g. YOUR_LIST_ID
 */

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  };

  try {
    let email = '';
    let teamSize = '';
    let primaryHost = '';
    let honeypot = '';
    let userGroup = 'team-cloud-waitlist';
    let source = 'comemor-waitlist';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await request.json().catch(() => ({}));
      email = data.email || '';
      teamSize = data.teamSize || '';
      primaryHost = data.primaryHost || '';
      honeypot = data.website || '';
      if (data.userGroup) userGroup = data.userGroup;
      if (data.source) source = data.source;
    } else {
      const formData = await request.formData().catch(() => new FormData());
      email = formData.get('email') || '';
      teamSize = formData.get('teamSize') || '';
      primaryHost = formData.get('primaryHost') || '';
      honeypot = formData.get('website') || '';
      if (formData.get('userGroup')) userGroup = formData.get('userGroup');
      if (formData.get('source')) source = formData.get('source');
    }

    // Honeypot: pretend success so bots learn nothing
    if (honeypot) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: jsonHeaders
      });
    }

    // Validate email
    const trimmedEmail = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!trimmedEmail || trimmedEmail.length > 254 || !emailRegex.test(trimmedEmail)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Please enter a valid email address.' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Server-side environment variables (never committed to git)
    const endpoint = env.LOOPS_ENDPOINT || env.LOOPS_FORM_ENDPOINT;
    const mailingListId = env.LOOPS_MAILING_LIST_ID;

    if (!endpoint) {
      console.warn('[waitlist] Missing LOOPS_ENDPOINT in environment.');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'The waitlist is not configured yet. Please try again later.'
        }),
        { status: 503, headers: jsonHeaders }
      );
    }

    const params = new URLSearchParams({
      email: trimmedEmail,
      teamSize: String(teamSize || ''),
      primaryHost: String(primaryHost || ''),
      userGroup: String(userGroup || 'team-cloud-waitlist'),
      source: String(source || 'comemor-waitlist')
    });

    if (mailingListId) {
      params.set('mailingLists', String(mailingListId));
    }

    const loopsResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    let loopsData = null;
    try {
      loopsData = await loopsResponse.json();
    } catch (_) {}

    if (loopsResponse.ok && (!loopsData || loopsData.success !== false)) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: jsonHeaders
      });
    }

    if (loopsResponse.status === 429) {
      return new Response(
        JSON.stringify({ success: false, message: 'Too many attempts. Please wait a moment and try again.' }),
        { status: 429, headers: jsonHeaders }
      );
    }

    const errMsg = (loopsData && loopsData.message) || 'Something went wrong. Please try again.';
    return new Response(
      JSON.stringify({ success: false, message: errMsg }),
      { status: loopsResponse.status || 400, headers: jsonHeaders }
    );
  } catch (err) {
    console.error('[waitlist] Unexpected error:', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Network error. Please try again later.' }),
      { status: 500, headers: jsonHeaders }
    );
  }
}
