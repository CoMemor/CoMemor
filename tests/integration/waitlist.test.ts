/**
 * Integration tests for the CoMemor Team Cloud waitlist Worker & frontend pages.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface WaitlistWorker {
  fetch(request: Request, env: unknown): Promise<Response>;
}

const ROOT = path.resolve('.');
const workerUrl = pathToFileURL(path.join(ROOT, 'cloudflare/waitlist-worker.js')).href;
const worker = ((await import(workerUrl)) as { default: WaitlistWorker }).default;

describe('Team Cloud Waitlist Worker & Web Assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseEnv = {
    LOOPS_ENDPOINT: 'https://app.loops.so/api/newsletter-form/test-form',
    LOOPS_MAILING_LIST_ID: 'list_team_cloud_test',
    ASSETS: {
      fetch: vi.fn((req: Request) => {
        const u = new URL(req.url);
        return Promise.resolve(new Response(`asset:${u.pathname}`, { status: 200 }));
      }),
    },
  };

  it('rejects POST /api/waitlist when firstName or lastName is missing', async () => {
    const req = new Request('https://comemor.tech/api/waitlist', {
      method: 'POST',
      headers: {
        Origin: 'https://comemor.tech',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: 'dev@example.com',
        teamSize: '2-5',
        primaryHost: 'cursor',
      }).toString(),
    });

    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toContain('required');
  });

  it('validates and forwards firstName, lastName, email, teamSize, primaryHost to Loops', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        capturedUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        capturedBody = typeof init?.body === 'string' ? init.body : '';
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );

    const req = new Request('https://comemor.tech/api/waitlist', {
      method: 'POST',
      headers: {
        Origin: 'https://comemor.tech',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        firstName: '  Jane ',
        lastName: ' Doe ',
        email: 'Jane.Doe@Example.COM ',
        teamSize: '6-20',
        primaryHost: 'claude',
        website: '',
      }).toString(),
    });

    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);

    expect(capturedUrl).toBe(baseEnv.LOOPS_ENDPOINT);
    const forwarded = new URLSearchParams(capturedBody);
    expect(forwarded.get('firstName')).toBe('Jane');
    expect(forwarded.get('lastName')).toBe('Doe');
    expect(forwarded.get('email')).toBe('jane.doe@example.com');
    expect(forwarded.get('teamSize')).toBe('6-20');
    expect(forwarded.get('primaryHost')).toBe('claude');
    expect(forwarded.get('userGroup')).toBe('team-cloud-waitlist');
    expect(forwarded.get('mailingLists')).toBe(baseEnv.LOOPS_MAILING_LIST_ID);
    expect(forwarded.get('source')).toBe('comemor-waitlist');
  });

  it('short-circuits honeypot submissions without calling Loops', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const req = new Request('https://comemor.tech/api/waitlist', {
      method: 'POST',
      headers: {
        Origin: 'https://comemor.tech',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        firstName: 'Bot',
        lastName: 'User',
        email: 'bot@example.com',
        teamSize: '1',
        primaryHost: 'other',
        website: 'https://spam.example',
      }).toString(),
    });

    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['/waitlist', '/waitlist/', '/team-cloud', '/team-cloud/'])(
    'serves /waitlist.html directly with security headers for %s',
    async (routePath) => {
      baseEnv.ASSETS.fetch.mockClear();
      const req = new Request(`https://comemor.tech${routePath}`, { method: 'GET' });
      const res = await worker.fetch(req, baseEnv);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('asset:/waitlist.html');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
      expect(baseEnv.ASSETS.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('web/index.html and web/waitlist.html include firstName, lastName, and waitlist anchor/routes', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
    const waitlistHtml = fs.readFileSync(path.join(ROOT, 'web/waitlist.html'), 'utf8');
    const mainJs = fs.readFileSync(path.join(ROOT, 'web/assets/main.js'), 'utf8');

    for (const html of [indexHtml, waitlistHtml]) {
      expect(html).toContain('id="wlForm"');
      expect(html).toContain('id="wlFirstName"');
      expect(html).toContain('name="firstName"');
      expect(html).toContain('id="wlLastName"');
      expect(html).toContain('name="lastName"');
      expect(html).toContain('id="wlEmail"');
      expect(html).toContain('id="wlTeam"');
      expect(html).toContain('id="wlHost"');
      expect(html).toContain('id="wlHp"');
      // CSP check: no executable inline <script> blocks (only type="application/ld+json" or src=...)
      const scriptTags = [...html.matchAll(/<script\b([^>]*)>/gi)];
      for (const m of scriptTags) {
        const attrs = m[1] ?? '';
        expect(
          /\bsrc=/.test(attrs) || /type=["']application\/ld\+json["']/i.test(attrs),
          `Unexpected inline script tag found: ${m[0]}`,
        ).toBe(true);
      }
    }

    expect(indexHtml).toContain('id="pricing"');
    expect(indexHtml).toContain('id="team-cloud-waitlist"');
    expect(indexHtml).toContain('https://github.com/PrasannaSaiS/CoMemor/issues');

    expect(mainJs).toContain('firstName');
    expect(mainJs).toContain('lastName');
    expect(mainJs).toContain('#team-cloud-waitlist');
  });
});
