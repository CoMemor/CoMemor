/* =====================================================================
   CoMemor Landing Page Client Runtime
   ===================================================================== */
const CONFIG = {
  showPlaceholderHints: false,
  githubRepo: 'PrasannaSaiS/CoMemor',
  demoVideo: '',
  demoPoster: '',
  consoleShot: '',
  avatars: { madhumitha: '', madan: '', manisha: '' }
};

(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ico = id => `<svg class="i"><use href="#${id}"/></svg>`;
  if (!CONFIG.showPlaceholderHints) document.body.classList.add('hide-hints');

  /* ---------- nav / progress / menu ---------- */
  const nav = $('#nav'), prog = $('#progress'), mark = $('#mark');
  let ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
      if (nav) nav.classList.toggle('scrolled', y > 24);
      if (prog) prog.style.transform = `scaleX(${h > 0 ? clamp(y / h) : 0})`;
      scrub(); stageScale(); markParallax();
      ticking = false;
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);

  const burger = $('#burger');
  function menu(open) {
    document.body.classList.toggle('menu-open', open);
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger) burger.addEventListener('click', () => menu(!document.body.classList.contains('menu-open')));
  $$('#mmenu a').forEach(a => a.addEventListener('click', () => menu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });

  /* ---------- reveal ---------- */
  const rvIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); rvIO.unobserve(e.target); }
  }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.rv').forEach(el => rvIO.observe(el));

  /* ---------- copy ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((res, rej) => {
      const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } t.remove();
    });
  }
  function flash(btn, host) {
    const l = $('.lbl', btn); if (!l) return; const old = 'Copy';
    l.textContent = 'Copied \u2713'; (host || btn).classList.add('done');
    setTimeout(() => { l.textContent = old; (host || btn).classList.remove('done'); }, 1600);
  }
  $$('[data-copy]').forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy).then(() => flash(b)).catch(() => { })));

  /* ---------- spotlight ---------- */
  $$('[data-spot]').forEach(el => el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }));

  /* ---------- GitHub stars ---------- */
  fetch('https://api.github.com/repos/' + CONFIG.githubRepo).then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.stargazers_count != null) $('#gh-stars').textContent = 'Star \u00b7 ' + d.stargazers_count;
  }).catch(() => { });
  const yrEl = $('#yr');
  if (yrEl) yrEl.textContent = String(new Date().getFullYear());

  /* ---------- particles ---------- */
  (function () {
    const c = $('#particles'); if (!c) return;
    const ctx = c.getContext('2d'), hero = c.parentElement;
    const COLORS = ['#1A73E8', '#D93025', '#F9AB00', '#1E8E3E', '#C4C7CC', '#C4C7CC'];
    let W, H, D, P = [], mx = -9999, my = -9999, px = 0, py = 0, tpx = 0, tpy = 0, raf = 0, on = false;
    function size() {
      const r = c.getBoundingClientRect(); D = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
      c.width = W * D; c.height = H * D; ctx.setTransform(D, 0, 0, D, 0, 0);
      const n = W < 700 ? 56 : 112;
      P = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3,
        z: .4 + Math.random() * .9, s: 2 + Math.random() * 2, dash: Math.random() < .45, a: Math.random() * 6.28,
        va: (Math.random() - .5) * .01, col: COLORS[(Math.random() * COLORS.length) | 0], ox: 0, oy: 0
      }));
    }
    function draw(step) {
      ctx.clearRect(0, 0, W, H);
      px += (tpx - px) * .06; py += (tpy - py) * .06;
      for (const p of P) {
        if (step) {
          p.vx += (Math.random() - .5) * .02; p.vy += (Math.random() - .5) * .02;
          p.vx = clamp(p.vx, -.45, .45); p.vy = clamp(p.vy, -.45, .45);
          p.x += p.vx * p.z; p.y += p.vy * p.z; p.a += p.va;
          if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
          const dx = p.x + p.ox - mx, dy = p.y + p.oy - my, d2 = dx * dx + dy * dy, R = 150;
          if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 4.2; p.ox += dx / d * f; p.oy += dy / d * f; }
          p.ox *= .93; p.oy *= .93;
        }
        const x = p.x + p.ox + px * 22 * p.z, y = p.y + p.oy + py * 22 * p.z;
        ctx.globalAlpha = .55 + p.z * .35; ctx.fillStyle = p.col;
        if (p.dash) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.a); const l = p.s * 3.2, w = p.s * .85;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-l / 2, -w / 2, l, w, w / 2) : ctx.rect(-l / 2, -w / 2, l, w); ctx.fill(); ctx.restore();
        } else { ctx.beginPath(); ctx.arc(x, y, p.s / 2 + .2, 0, 6.28); ctx.fill(); }
      }
    }
    function loop() { draw(true); raf = requestAnimationFrame(loop); }
    size(); draw(false);
    if (RM) { addEventListener('resize', () => { size(); draw(false); }); return; }
    hero.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
      tpx = (mx / W - .5) * -1; tpy = (my / H - .5) * -1;
    });
    hero.addEventListener('pointerleave', () => { mx = my = -9999; tpx = tpy = 0; });
    new IntersectionObserver(es => {
      const v = es[0].isIntersecting;
      if (v && !on) { on = true; raf = requestAnimationFrame(loop); } else if (!v && on) { on = false; cancelAnimationFrame(raf); }
    }).observe(hero);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 150); });
  })();

  /* ---------- manifesto scroll scrub (accessible without aria-label on <p>) ---------- */
  const sEl = $('[data-scrub]'); let words = [];
  if (sEl) {
    const txt = sEl.textContent.trim();
    sEl.innerHTML = `<span class="sr">${esc(txt)}</span><span aria-hidden="true">${txt.split(/\s+/).map(w => `<span class="sw">${esc(w)}</span>`).join(' ')}</span>`;
    words = $$('.sw', sEl);
  }
  const C0 = [95, 99, 104], C1 = [32, 33, 36];
  function scrub() {
    if (!sEl || RM) return;
    const r = sEl.getBoundingClientRect(), vh = innerHeight;
    const p = clamp((vh * .88 - r.top) / (vh * .5 + r.height * .8)); const n = words.length;
    words.forEach((w, i) => {
      const a = clamp(p * (n + 6) - i - 2, 0, 1);
      w.style.color = `rgb(${C0.map((c, k) => Math.round(c + (C1[k] - c) * a)).join(',')})`;
    });
  }

  /* ---------- count-up ---------- */
  const cIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; cIO.unobserve(e.target);
    const el = e.target, from = +el.dataset.from, to = +el.dataset.to;
    if (RM) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 1700;
    (function f(t) {
      const k = clamp((t - t0) / dur), v = from + (to - from) * (1 - Math.pow(1 - k, 4));
      el.textContent = Math.round(v); if (k < 1) requestAnimationFrame(f);
    })(t0);
  }), { threshold: .6 });
  $$('[data-count]').forEach(el => { if (!RM) el.textContent = el.dataset.from; cIO.observe(el); });

  /* ---------- proof stage ---------- */
  const stage = $('#proofStage');
  function stageScale() {
    if (!stage || RM) return;
    const r = stage.getBoundingClientRect(), p = clamp((innerHeight - r.top) / (innerHeight * .75));
    stage.style.transform = `scale(${(.93 + .07 * p).toFixed(4)})`;
  }
  function markParallax() {
    if (!mark) return; const r = mark.parentElement.getBoundingClientRect();
    const p = clamp(1 - (r.top - innerHeight * .4) / (innerHeight * .6));
    mark.style.setProperty('--py', (14 - 14 * p).toFixed(2) + '%');
  }
  (function proof() {
    if (!stage) return;
    const lines = $$('.ln', stage), t1 = $('#t1'), t2 = $('#t2'); let timers = [], played = false;
    function anim(el, to, dur, fmt) {
      const t0 = performance.now(); (function f(t) {
        const k = clamp((t - t0) / dur); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f);
      })(t0);
    }
    function play() {
      timers.forEach(clearTimeout); timers = [];
      lines.forEach(l => l.classList.remove('show')); t1.textContent = '0m 00s'; t2.textContent = '0 ms';
      lines.forEach(l => timers.push(setTimeout(() => l.classList.add('show'), +l.dataset.t)));
      timers.push(setTimeout(() => anim(t1, 252, 3200, v => { v = Math.round(v); return Math.floor(v / 60) + 'm ' + String(v % 60).padStart(2, '0') + 's'; }), 300));
      timers.push(setTimeout(() => anim(t2, 48, 900, v => Math.round(v) + ' ms'), 5800));
    }
    function showAll() { lines.forEach(l => l.classList.add('show')); t1.textContent = '4m 12s'; t2.textContent = '48 ms'; }
    if (CONFIG.demoVideo) {
      const v = document.createElement('video'); v.className = 'stage-video'; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
      if (CONFIG.demoPoster) v.poster = CONFIG.demoPoster; v.src = CONFIG.demoVideo;
      stage.innerHTML = ''; stage.appendChild(v); return;
    }
    $('#replay').addEventListener('click', () => { if (RM) return showAll(); play(); });
    if (RM) { showAll(); return; }
    new IntersectionObserver((es, io) => { if (es[0].isIntersecting && !played) { played = true; play(); io.disconnect(); } }, { threshold: .35 }).observe(stage);
  })();

  /* ---------- capability switcher ---------- */
  (function () {
    const root = $('#caps'); if (!root) return;
    const tabs = $$('.tab', root), panes = $$('.pane', $('#capStage')); let idx = 0;
    function set(i, focus) {
      idx = i;
      tabs.forEach((t, j) => { const o = j === i; t.classList.toggle('on', o); t.setAttribute('aria-selected', o); t.tabIndex = o ? 0 : -1; });
      panes.forEach((p, j) => p.classList.toggle('on', j === i));
      if (focus) tabs[i].focus();
      if (i === 0) fillMeters();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => set(i));
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); set((idx + 1) % tabs.length, true); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); set((idx + tabs.length - 1) % tabs.length, true); }
      });
      $('.bar i', t).addEventListener('animationend', () => set((idx + 1) % tabs.length));
    });
    if (RM) root.classList.add('no-auto');
    else {
      new IntersectionObserver(es => root.classList.toggle('live', es[0].isIntersecting), { threshold: .45 }).observe(root);
      ['mouseenter', 'focusin'].forEach(ev => root.addEventListener(ev, () => root.classList.add('paused')));
      ['mouseleave', 'focusout'].forEach(ev => root.addEventListener(ev, () => root.classList.remove('paused')));
    }
    function fillMeters() { $$('[data-w]', root).forEach(m => { m.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => m.style.width = m.dataset.w + '%')); }); }
    new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { fillMeters(); io.disconnect(); } }, { threshold: .3 }).observe(root);

    if (CONFIG.consoleShot) {
      const w = $('#consoleMock'); w.innerHTML = `<div class="win-bar"><i></i><i></i><i></i><span>CoMemor \u00b7 Memory Console</span></div><img src="${esc(CONFIG.consoleShot)}" alt="CoMemor Memory Console dashboard" loading="lazy">`;
    }

    const Q = {
      exact: {
        err: "error TS2307: Cannot find module '@app/core' or its corresponding type declarations.",
        toks: [['error', 1], ['TS2307', 1], ['Cannot', 1], ['find', 1], ['module', 1], ["'@app/core'", 1]],
        kind: 'Exact fingerprint', score: 1, res: true,
        fix: 'Add "@app/core" path alias to tsconfig.base.json',
        meta: [['g', 'sha256:ab41\u2026'], ['g', 'Wilson 0.94'], ['b', 'verified 12\u00d7'], ['g', 'Fresh \u00b7 lockfile unchanged']]
      },
      similar: {
        err: "error TS2307: Cannot find module '@app/utils' or its corresponding type declarations.",
        toks: [['error', 1], ['TS2307', 1], ['Cannot', 1], ['find', 1], ['module', 1], ["'@app/utils'", 0]],
        kind: 'Fuzzy lexical', score: .86, res: true,
        fix: 'Closest known fix: add a path alias to tsconfig.base.json',
        meta: [['b', 'token overlap'], ['y', 'Review before applying'], ['g', 'Fresh']]
      },
      new: {
        err: 'ENOSPC: no space left on device, write',
        toks: [['ENOSPC', 0], ['no', 0], ['space', 0], ['left', 0], ['device', 0], ['write', 0]],
        kind: 'No match', score: .12, res: false,
        fix: 'Nothing stored yet. Fix it, then call record_failure.', meta: []
      }
    };
    function renderQ(k) {
      const q = Q[k];
      $('#qErr').textContent = q.err;
      $('#qToks').innerHTML = q.toks.map(t => `<span class="${t[1] ? 'm' : ''}">${esc(t[0])}</span>`).join('');
      $('#qKind').textContent = q.kind; $('#qScore').textContent = q.score.toFixed(2);
      const bar = $('#qBar'); bar.style.background = q.res ? 'var(--green)' : 'var(--ink-3)'; bar.style.width = (q.score * 100) + '%';
      $('#qRes').innerHTML = `<div class="fix">${esc(q.fix)}</div>` + (q.meta.length ? `<div class="q-meta">${q.meta.map(m => `<span class="chip ${m[0]}">${esc(m[1])}</span>`).join('')}</div>` : '');
    }
    $$('#qSeg button').forEach(b => b.addEventListener('click', () => {
      $$('#qSeg button').forEach(x => x.classList.toggle('on', x === b)); renderQ(b.dataset.q);
    }));
    renderQ('exact');

    const RAW = [
      ['$ npm run deploy', 0], ['Error: 401 Unauthorized', 0],
      ['  Authorization: Bearer ', 0, 'demo_tok_8fK2xQ9LmZ4vB7nR1cT6'],
      ['  DATABASE_URL=postgres://admin:', 0, 'hunter2', '@db.internal:5432/app'],
      ['  SESSION=', 0, '7f3a9c1e5b2d48a6b0e91c3d5f7a2b4c']
    ];
    const rCode = $('#rCode'); let rTouched = false, rTimer;
    const secrets = []; RAW.forEach(r => { if (r[2]) secrets.push(r[2]); });
    $('#rCount').textContent = secrets.length;
    function renderR(mode, animate) {
      rCode.classList.toggle('safe', mode === 'safe');
      rCode.innerHTML = RAW.map(r => {
        if (!r[2]) return esc(r[0]);
        const tail = r[3] ? esc(r[3]) : '';
        return esc(r[0]) + `<span class="sec" data-s="${esc(r[2])}">${esc(mode === 'safe' ? '[REDACTED]' : r[2])}</span>` + tail;
      }).join('\n');
      $$('#rSeg button').forEach(b => b.classList.toggle('on', b.dataset.r === mode));
      if (animate && !RM && mode === 'safe') {
        $$('.sec', rCode).forEach(s => {
          const orig = s.dataset.s, t0 = performance.now(), ch = 'abcdef0123456789#%&';
          (function f(t) {
            const k = clamp((t - t0) / 520);
            if (k >= 1) { s.textContent = '[REDACTED]'; return; }
            s.textContent = orig.split('').map((c, i) => i / orig.length < k ? '\u2588' : ch[(Math.random() * ch.length) | 0]).join('').slice(0, 12) + '\u2026';
            requestAnimationFrame(f);
          })(t0);
        });
      }
    }
    renderR('raw');
    $$('#rSeg button').forEach(b => b.addEventListener('click', () => { rTouched = true; clearTimeout(rTimer); renderR(b.dataset.r, true); }));
    const paneR = $('#cp2');
    new MutationObserver(() => {
      if (paneR.classList.contains('on')) { if (!rTouched) { renderR('raw'); clearTimeout(rTimer); if (!RM) rTimer = setTimeout(() => { if (!rTouched && paneR.classList.contains('on')) renderR('safe', true); }, 1500); } }
      else clearTimeout(rTimer);
    }).observe(paneR, { attributes: true, attributeFilter: ['class'] });

    const QV = [
      `<span class="dim">// retrieved by find_fix</span>\n<span class="tg">&lt;untrusted-data</span> <span class="at">source</span>=<span class="ok">"comemor"</span> <span class="at">record</span>=<span class="ok">"ab41\u2026"</span><span class="tg">&gt;</span>\n  Add "@app/core" path alias\n  to tsconfig.base.json\n<span class="tg">&lt;/untrusted-data&gt;</span>\n\n<span class="ok">\u2713 Wrapped as data, never as instructions.</span>`,
      `<span class="dim">// retrieved by find_fix</span>\n<span class="tg">&lt;untrusted-data</span> <span class="at">source</span>=<span class="ok">"comemor"</span> <span class="at">record</span>=<span class="ok">"c9d0\u2026"</span><span class="tg">&gt;</span>\n  Switch to a registry mirror\n  and retry the install\n<span class="tg">&lt;/untrusted-data&gt;</span>\n\n<span class="ok">\u2713 Wrapped as data, never as instructions.</span>`,
      `<span class="bad">\u26a0 Quarantined</span>\n<span class="dim">Flagged by heuristic detectors:</span>\n  \u00b7 instruction override\n  \u00b7 pipe-to-shell pattern\n\n<span class="bad">\u2717 Blocked.</span> Never reaches your agent.\n<span class="dim">Review it in the Memory Console.</span>`
    ];
    const qv = $('#qView'); qv.innerHTML = QV[0];
    $$('#qList .qrow').forEach(r => r.addEventListener('click', () => {
      $$('#qList .qrow').forEach(x => x.classList.toggle('on', x === r));
      qv.style.opacity = 0; setTimeout(() => { qv.innerHTML = QV[+r.dataset.k]; qv.style.opacity = 1; }, 160);
    }));
  })();

  /* ---------- MCP tools inspector (h3 headings match h2 parent) ---------- */
  (function () {
    const T = {
      find_fix: {
        req: { name: 'find_fix', arguments: { error: "error TS2307: Cannot find module '@app/core'", command: 'tsc -b' } },
        res: { matches: [{ match: 'fingerprint', score: 0.97, fingerprint: 'sha256:ab41\u2026', fix: 'Add "@app/core" path alias to tsconfig.base.json', wilsonConfidence: 0.94, verifiedCount: 12, stale: false }], envelope: 'untrusted-data' },
        c: ['Read-only', 'Quarantined records excluded', 'Untrusted-data envelope']
      },
      record_failure: {
        req: { name: 'record_failure', arguments: { error: "error TS2307: Cannot find module '@app/core'", fix: 'Add "@app/core" path alias to tsconfig.base.json', outcome: 'success' } },
        res: { recorded: true, redactedFields: 0, quarantined: false, index: 'rebuilt' },
        c: ['Secrets redacted before disk', 'Append-only JSONL', 'Poisoning scan']
      },
      verify_fix: {
        req: { name: 'verify_fix', arguments: { command: 'npm install @app/core' } },
        res: { allowed: true, checks: { allowlistedBinary: true, shellMetacharacters: false, workspaceContained: true }, proposal: { command: 'npm', args: ['install', '@app/core'] }, requiresHostConfirmation: true, executedByServer: false },
        c: ['executedByServer: false', 'requiresHostConfirmation: true', 'Allowlisted binaries', 'No shell metacharacters', 'Workspace containment']
      },
      list_memory_stats: {
        req: { name: 'list_memory_stats', arguments: {} },
        res: { records: 128, quarantined: 2, pendingApprovals: 1 },
        c: ['Read-only', 'Aggregate counts only']
      }
    };
    function hl(obj) {
      return esc(JSON.stringify(obj, null, 2)).split('\n').map(line => {
        let s = line.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\b\d+\.?\d*\b)/g, (m, str, colon, bool, num) => {
          if (str) return colon ? `<span class="jk">${str}</span>${colon}` : `<span class="js2">${str}</span>`;
          if (bool) return `<span class="jb">${bool}</span>`; if (num) return `<span class="jn">${num}</span>`; return m;
        });
        return /executedByServer|requiresHostConfirmation/.test(line) ? `<span class="hl">${s}</span>` : s;
      }).join('\n');
    }
    const body = $('#inspBody'), ctr = $('#contract'), title = $('#inspTitle'), list = $$('#toolList .tool'); let cur = 'find_fix';
    if (!body || !list.length) return;
    function render(k) {
      const t = T[k]; title.textContent = 'tools/call \u00b7 ' + k;
      body.innerHTML = `<h3>Request</h3><pre>${hl(t.req)}</pre><h3>Response</h3><pre>${hl(t.res)}</pre>`;
      ctr.innerHTML = t.c.map((c, i) => `<span style="--i:${i}">${ico('i-check')}${esc(c)}</span>`).join('');
    }
    function set(k, focus) {
      if (k === cur && body.innerHTML) return; cur = k;
      list.forEach(b => { const o = b.dataset.tool === k; b.classList.toggle('on', o); b.setAttribute('aria-selected', o); b.tabIndex = o ? 0 : -1; if (o && focus) b.focus(); });
      if (RM) return render(k);
      body.classList.add('swap'); setTimeout(() => { render(k); body.classList.remove('swap'); }, 200);
    }
    list.forEach((b, i) => {
      b.addEventListener('click', () => set(b.dataset.tool));
      b.addEventListener('keydown', e => {
        const n = list.length; let j = null;
        if (e.key === 'ArrowDown') j = (i + 1) % n; if (e.key === 'ArrowUp') j = (i + n - 1) % n;
        if (j !== null) { e.preventDefault(); set(list[j].dataset.tool, true); }
      });
    });
    render('find_fix');
  })();

  /* ---------- testimonials ---------- */
  (function () {
    const btns = $$('#people .person'), panes = $$('#qStage .pane');
    if (!btns.length) return;
    function set(i, focus) {
      btns.forEach((b, j) => { const o = i === j; b.classList.toggle('on', o); b.setAttribute('aria-selected', o); b.tabIndex = o ? 0 : -1; if (o && focus) b.focus(); });
      panes.forEach((p, j) => p.classList.toggle('on', i === j));
    }
    btns.forEach((b, i) => {
      b.addEventListener('click', () => set(i));
      b.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); set((i + 1) % btns.length, true); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); set((i + btns.length - 1) % btns.length, true); }
      });
    });
    $$('[data-av]').forEach(a => {
      const src = CONFIG.avatars[a.dataset.av];
      if (src) { const im = new Image(); im.alt = ''; im.src = src; im.onerror = () => im.remove(); a.appendChild(im); }
    });
  })();

  /* ---------- install / IDE switcher ---------- */
  (function () {
    const pre = $('#cfgCode'), file = $('#cfgFile'), seg = $$('#ideSeg button');
    if (!pre || !seg.length) return;
    const CFG = {
      antigravity: { file: 'mcp_config.json', lang: 'json', code: '{\n  "mcpServers": {\n    "comemor": {\n      "command": "npx",\n      "args": ["comemor"],\n      "cwd": "${workspaceFolder}"\n    }\n  }\n}' },
      claude: { file: 'terminal', lang: 'sh', code: 'claude mcp add comemor -- npx comemor' },
      cursor: { file: '.cursor/mcp.json', lang: 'json', code: '{\n  "mcpServers": {\n    "comemor": {\n      "command": "npx",\n      "args": ["comemor"],\n      "cwd": "${workspaceFolder}"\n    }\n  }\n}' },
      vscode: { file: '.vscode/mcp.json', lang: 'json', code: '{\n  "servers": {\n    "comemor": {\n      "type": "stdio",\n      "command": "npx",\n      "args": ["comemor"],\n      "cwd": "${workspaceFolder}"\n    }\n  }\n}' },
      windsurf: { file: '~/.codeium/windsurf/mcp_config.json', lang: 'json', code: '{\n  "mcpServers": {\n    "comemor": {\n      "command": "npx",\n      "args": ["comemor"],\n      "cwd": "${workspaceFolder}"\n    }\n  }\n}' }
    };
    let cur = 'antigravity';
    function fmt(c) {
      const e = esc(c.code);
      if (c.lang === 'sh') return e.replace(/^(claude)(\s+)(mcp add)/, '<span class="jk">$1</span>$2<span class="js2">$3</span>');
      return e.replace(/(&quot;[^&]*?&quot;)(\s*:)|(&quot;[^&]*?&quot;)/g, (m, k, col, s) => k ? `<span class="jk">${k}</span>${col}` : `<span class="js2">${s}</span>`);
    }
    function render(k) { pre.innerHTML = fmt(CFG[k]); file.textContent = CFG[k].file; }
    function set(k) {
      if (k === cur) return; cur = k;
      seg.forEach(b => { const o = b.dataset.ide === k; b.classList.toggle('on', o); b.setAttribute('aria-selected', o); });
      if (RM) return render(k); pre.classList.add('swap'); setTimeout(() => { render(k); pre.classList.remove('swap'); }, 180);
    }
    seg.forEach(b => b.addEventListener('click', () => set(b.dataset.ide)));
    $('#cfgCopy').addEventListener('click', e => copyText(CFG[cur].code).then(() => flash(e.currentTarget)).catch(() => { }));
    render('antigravity');
  })();

  /* ---------- FAQ ---------- */
  $$('#acc .acc-i').forEach(it => {
    const q = $('.acc-q', it);
    q.addEventListener('click', () => {
      const open = !it.classList.contains('open');
      $$('#acc .acc-i').forEach(o => { o.classList.remove('open'); $('.acc-q', o).setAttribute('aria-expanded', 'false'); });
      if (open) { it.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
    });
  });

  onScroll(); scrub(); stageScale(); markParallax();
})();

/* =====================================================================
   WAITLIST MODAL
   ===================================================================== */
(function () {
  'use strict';
  const WAITLIST_CONFIG = {
    endpoint: '/api/waitlist',
    userGroup: 'team-cloud-waitlist',
    source: 'comemor-waitlist'
  };
  const dlg = document.getElementById('wlDialog');
  if (!dlg) return;
  const $ = id => document.getElementById(id);
  const form = $('wlForm'), card = $('wlCard'), submit = $('wlSubmit'), status = $('wlStatus');
  const fields = {
    email: { el: $('wlEmail'), err: $('wlEmailErr') },
    teamSize: { el: $('wlTeam'), err: $('wlTeamErr') },
    primaryHost: { el: $('wlHost'), err: $('wlHostErr') }
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const hasNative = typeof dlg.showModal === 'function';
  let lastTrigger = null, busy = false;

  function open(trigger) {
    lastTrigger = trigger || null;
    if (hasNative) { if (!dlg.open) dlg.showModal(); }
    else { dlg.setAttribute('open', ''); dlg.classList.add('wl-fallback'); }
    document.body.classList.add('wl-open');
    setTimeout(() => fields.email.el.focus(), 30);
  }
  function close() {
    if (hasNative) { if (dlg.open) dlg.close(); }
    else { dlg.removeAttribute('open'); dlg.classList.remove('wl-fallback'); }
    document.body.classList.remove('wl-open');
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
  }
  document.querySelectorAll('[data-wl-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(a); }));
  $('wlClose').addEventListener('click', close);
  $('wlDone').addEventListener('click', close);
  dlg.addEventListener('close', () => document.body.classList.remove('wl-open'));
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target === $('wlShell')) close(); });
  if (!hasNative) addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.hasAttribute('open')) close(); });

  function check(name) {
    const f = fields[name], v = f.el.value.trim(); let msg = '';
    if (name === 'email') {
      if (!v) msg = 'Please enter your email address.';
      else if (v.length > 254 || !EMAIL_RE.test(v)) msg = 'Please enter a valid email address.';
    } else if (!v) {
      msg = name === 'teamSize' ? 'Please select your team size.' : 'Please select your primary host.';
    }
    f.err.textContent = msg;
    f.el.closest('.wl-field').classList.toggle('bad', !!msg);
    f.el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) f.el.setAttribute('aria-describedby', f.err.id); else f.el.removeAttribute('aria-describedby');
    return !msg;
  }
  Object.keys(fields).forEach(n => {
    fields[n].el.addEventListener('blur', () => { if (fields[n].el.value || fields[n].el.closest('.wl-field').classList.contains('bad')) check(n); });
    fields[n].el.addEventListener('input', () => { if (fields[n].el.closest('.wl-field').classList.contains('bad')) check(n); });
    fields[n].el.addEventListener('change', () => check(n));
  });
  function setStatus(msg) { status.textContent = msg || ''; status.classList.toggle('show', !!msg); }
  function setBusy(b) { busy = b; submit.disabled = b; submit.textContent = b ? 'Joining\u2026' : 'Join the waitlist'; }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    setStatus('');
    const results = Object.keys(fields).map(check);
    if (results.includes(false)) {
      const first = Object.keys(fields).find(n => fields[n].el.getAttribute('aria-invalid') === 'true');
      if (first) fields[first].el.focus();
      return;
    }
    if ($('wlHp').value) { card.classList.add('done'); return; }

    const data = new FormData(form);
    const body = new URLSearchParams({
      email: String(data.get('email')).trim().toLowerCase(),
      teamSize: data.get('teamSize'),
      primaryHost: data.get('primaryHost'),
      website: $('wlHp').value || '',
      userGroup: WAITLIST_CONFIG.userGroup,
      source: WAITLIST_CONFIG.source
    }).toString();

    setBusy(true);
    try {
      const res = await fetch(WAITLIST_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      let json = null; try { json = await res.json(); } catch (_) { }
      if (res.ok && (!json || json.success !== false)) {
        card.classList.add('done');
        form.reset();
      } else if (res.status === 429) {
        setStatus('Too many attempts. Please wait a moment and try again.');
      } else {
        setStatus((json && json.message) || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setStatus('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  });
})();
