/**
 * Cloudflare Worker — Split-routing proxy
 *
 * Routing:
 *   dashboardharyana.site/app.html  → GAS exec URL (banner-stripped via processHtml)
 *   dashboardharyana.site/*         → GitHub Pages static bundle (docs/ via raw CDN)
 *
 * Why raw CDN for GitHub Pages:
 *   vcharyanaco-tech.github.io/dashv1/* 301-redirects to the custom domain,
 *   which Cloudflare forwards back to this Worker — an infinite loop.
 *   raw.githubusercontent.com serves the same files with correct Content-Type
 *   and no redirect.
 *
 * GAS CSP-safe approach (for /app.html):
 *   - NO <base> tag injection (blocked by Google's base-uri 'self' CSP)
 *   - Rewrite all relative /static/... URLs to absolute script.google.com URLs
 *   - Inject disclaimer-killer CSS/JS using the page's own nonce
 */

import { isEnterprisePath, enterpriseHeadersForPath } from './worker-enterprise-routes.js';

const GITHUB_RAW = 'https://raw.githubusercontent.com/vcharyanaco-tech/dashv1/main/docs';

// ── Trusted origins for CORS ────────────────────────────────────────────────
// The Access-Control-Allow-Origin header is echoed back ONLY when the request's
// Origin matches one of these. Same-origin requests (dashboardharyana.site)
// send no Origin header and are unaffected. Anything else gets no ACAO header,
// so a foreign page can never read our responses (CSRF / data-theft hardening).
const TRUSTED_ORIGINS = new Set([
  'https://dashboardharyana.site',
  'https://www.dashboardharyana.site',
  'https://vcharyanaco-tech.github.io',
]);

const BASE_HEADERS = {
  // Clickjacking defence: refuse to render inside any cross-origin frame.
  // SAMEORIGIN (not ALLOWALL) lets the page frame itself when needed while
  // blocking third-party embedding.
  'X-Frame-Options': 'SAMEORIGIN',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Referrer-Policy': 'no-referrer-when-downgrade',
};

/**
 * Builds response headers for a given request, echoing the Origin header only
 * when it matches a trusted domain. Returns a fresh object per call so a
 * single request never mutates a shared constant.
 * @param {Request} request Incoming request (used for its Origin header).
 * @returns {Object<string,string>}
 */
function headersFor(request) {
  const headers = { ...BASE_HEADERS };
  const origin = request && request.headers ? request.headers.get('Origin') : null;
  if (origin && TRUSTED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...headersFor(request), 'Access-Control-Max-Age': '86400' },
      });
    }

    // ── Route: /api/* → enterprise API (health, AI insights, WhatsApp notify) ─
    // External secrets (GEMINI_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
    // live only in Worker secrets/environment and are read from `env` here.
    if (url.pathname.startsWith('/api/')) {
      if (isRateLimited(request)) {
        return jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '60' }, request);
      }
      if (url.pathname === '/api/preview-check') {
        return handlePreviewCheck(request, url);
      }
      return handleEnterpriseRoute(request, env, url, ctx);
    }

    const GAS_SCRIPT_URL = env.GAS_SCRIPT_URL;

    if (!GAS_SCRIPT_URL) {
      // Never cache this: it's a transient misconfiguration, not a stable
      // payload — a cached 500 here would keep failing after the config is
      // fixed until the edge TTL expires.
      return new Response('Worker not configured', { status: 500, headers: { ...headersFor(request), 'Cache-Control': 'no-store, max-age=0' } });
    }

    const path = url.pathname;

    // ── Route: /static/* → script.google.com (GAS warden sub-resources) ──────
    // ── Route: /macros/* → script.google.com (API calls from docs/app.js) ────
    // Passes through method + body so POST API calls work with CORS headers.
    const gasScriptOrigin = new URL(GAS_SCRIPT_URL).origin;
    if (path.startsWith('/static/') || path.startsWith('/macros/')) {
      const targetUrl = gasScriptOrigin + path + (url.search || '');
      const proxyHeaders = new Headers();
      // Copy safe headers only — avoid sending Host/Origin which confuse GAS
      const ct = request.headers.get('Content-Type');
      if (ct) proxyHeaders.set('Content-Type', ct);
      proxyHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
      // Read body as text to avoid ReadableStream-passthrough issues in Workers
      const isGetHead = request.method === 'GET' || request.method === 'HEAD';
      const bodyText = isGetHead ? undefined : await request.text();
      // Google intermittently returns an anti-bot interstitial (HTML page or a
      // bare 404) for proxy requests to the GAS /exec endpoint, ~25-40% of the
      // time. Transient per-request, so retry here (with backoff) instead of
      // forwarding it to clients, which would surface as a "login error".
      let resp;
      let upstreamErr = null;
      for (let attemptIdx = 0; attemptIdx < 3; attemptIdx++) {
        if (attemptIdx > 0) {
          await new Promise((r) => setTimeout(r, 300 * attemptIdx));
        }
        try {
          resp = await fetch(targetUrl, {
            method: request.method,
            headers: proxyHeaders,
            body: bodyText,
            redirect: 'follow',
            // GAS can be slow to spin up a cold container (10-45s). Bound the
            // subrequest so a wedged upstream can't leave the client hanging;
            // the frontend apiCall_ retries transient 502s on its own.
            signal: AbortSignal.timeout(90000),
          });
          upstreamErr = null;
        } catch (err) {
          upstreamErr = err;
          continue;
        }
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        const isHtml = ct.indexOf('text/html') !== -1;
        const retryableStatus = resp.status === 404 || resp.status === 429 || resp.status >= 500;
        if (isHtml || retryableStatus) {
          // Drain the body so the connection is reusable, then retry.
          await resp.arrayBuffer().catch(() => {});
          if (attemptIdx < 2) continue;
        }
        break;
      }
      if (!resp) {
        return jsonResponse(
          { error: upstreamErr && upstreamErr.name === 'AbortError' ? 'upstream timeout' : 'upstream error' },
          upstreamErr && upstreamErr.name === 'AbortError' ? 502 : 503,
          {},
          request
        );
      }
      const newHeaders = new Headers(resp.headers);
      // Strip any upstream CORS header first: raw.githubusercontent.com sends
      // `Access-Control-Allow-Origin: *`, which must never survive for
      // non-trusted origins — otherwise the origin restriction below is
      // defeated on proxied routes.
      newHeaders.delete('Access-Control-Allow-Origin');
      newHeaders.delete('Vary');
      // API responses must NEVER be edge-cached. GAS passes its own
      // Cache-Control through; if that ever allows caching (or an error
      // response is produced), the edge can keep serving a stale payload
      // from an OLD worker version after a redeploy — which previously
      // surfaced as the "Worker not configured" 500 persisting post-deploy.
      // no-store makes every proxied API/static response bypass the edge
      // cache entirely, so a fresh deploy is always live immediately.
      newHeaders.set('Cache-Control', 'no-store, max-age=0');
      Object.entries(headersFor(request)).forEach(([k, v]) => newHeaders.set(k, v));
      const respBody = await resp.arrayBuffer();
      return new Response(respBody, { status: resp.status, headers: newHeaders });
    }

    // ── Route: everything else → GitHub Pages static bundle (docs/) ─────────
    // /app.html is served as docs/app.html (standalone static page, no GAS wrapper).
    // The GAS proxy approach can't work cross-domain: googleusercontent.com's
    // maeInit_ only accepts postMessage from script.google.com, so proxying the
    // GAS outer wrapper from dashboardharyana.site always produces a blank page.

    // PWA assets: upgrade response headers for manifest / sw / offline-queue / icon
    if (isEnterprisePath(path)) {
      const headers = enterpriseHeadersForPath(path);
      if (headers) {
        // Pass `request` so fetchFromPages applies the same trusted-origin
        // CORS logic here as everywhere else.
        const resp = await fetchFromPages(path, url.search, request);
        const newHeaders = new Headers(resp.headers);
        Object.entries(headers).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(resp.body, { status: resp.status, headers: newHeaders });
      }
    }

    return fetchFromPages(path, url.search, request);
  },
};

// ── GitHub Pages static bundle fetcher ──────────────────────────────────────
async function fetchFromPages(path, search, request) {
  // Map request path to a docs/ file on the raw GitHub CDN.
  // / and /index.html → docs/index.html (the landing page)
  let filePath = path;
  if (!filePath || filePath === '/') filePath = '/index.html';

  // HTML entry documents are never versioned (no ?v=), so append a unique
  // query string to the raw fetch. That guarantees the GitHub raw CDN can
  // never serve a stale copy after a push — the file is small and fetched
  // at most once per page load, so always-fresh is the right tradeoff.
  // js/css are already cache-busted by the client's ?v= stamps.
  const isHtml = !filePath.match(/\.[a-z0-9]+$/i) || filePath.endsWith('.html');
  const cb = isHtml ? ((search ? '&' : '?') + 'cb=' + Date.now()) : '';
  const rawUrl = GITHUB_RAW + filePath + (search || '') + cb;

  const resp = await fetch(rawUrl, { redirect: 'follow' });

  if (resp.status === 404) {
    // Fallback: serve index.html for unknown paths (SPA-style)
    const fallback = await fetch(GITHUB_RAW + '/index.html?cb=' + Date.now());
    const html = await fallback.text();
    return new Response(html, {
      status: 200,
      headers: {
        ...headersFor(request),
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  }

  // Determine content-type from path extension since raw CDN may not set it
  const ct = guessContentType(filePath) || resp.headers.get('Content-Type') || 'application/octet-stream';
  const body = await resp.arrayBuffer();

  const headers = {
    ...headersFor(request),
    'Content-Type': ct,
    // HTML: browsers always revalidate, so a fresh app.html (with its new ?v=
    // asset stamps) is picked up on the very next load. Assets stay versioned
    // with a long TTL — each deploy bumps ?v=, giving a brand-new URL.
    'Cache-Control': isHtml
      ? 'public, max-age=0, must-revalidate'
      : (filePath.match(/\.(js|css|png|ico|jpg|svg|woff2?)(\?|$)/)
          ? 'public, max-age=3600'
          : 'public, max-age=300'),
  };

  return new Response(body, { status: resp.status, headers });
}

function guessContentType(path) {
  const p = path.split('?')[0];
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js'))   return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css'))  return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.png'))  return 'image/png';
  if (p.endsWith('.ico'))  return 'image/x-icon';
  if (p.endsWith('.svg'))  return 'image/svg+xml';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.woff2')) return 'font/woff2';
  if (p.endsWith('.woff'))  return 'font/woff';
  return null;
}

// ── Enterprise /api/* routes ────────────────────────────────────────────────
// Authorization: shared internal bearer token (env.WORKER_API_TOKEN).
// External secrets (GEMINI_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
// are read only from Worker environment/secrets and never echoed in responses.

// ── Best-effort per-IP rate limiting (in-memory, per-isolate) ───────────────
// Not a hard guarantee across isolates, but enough to blunt brute-forcing of
// the shared /api/* endpoints (AI + WhatsApp) without any external store.
const RATE_BUCKETS = new Map();
const RATE_LIMIT_MAX = 60;       // requests
const RATE_LIMIT_WINDOW = 60000; // per minute per IP
const RATE_BUCKET_CLEAN_EVERY = 256; // sweep stale buckets every N lookups
let rateLookupCount = 0;

function isRateLimited(request) {
  const ip = request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    'unknown';
  const now = Date.now();
  // Periodically drop expired buckets so the map cannot grow unboundedly.
  rateLookupCount++;
  if (rateLookupCount >= RATE_BUCKET_CLEAN_EVERY) {
    rateLookupCount = 0;
    if (RATE_BUCKETS.size) {
      for (const [key, b] of RATE_BUCKETS) {
        if (now - b.start > RATE_LIMIT_WINDOW) RATE_BUCKETS.delete(key);
      }
    }
  }
  const entry = RATE_BUCKETS.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    RATE_BUCKETS.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

const AI_INSIGHTS_TTL = 3600; // seconds; 1h keeps insights fresh-ish

function jsonResponse(obj, status, extraHeaders, request) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...headersFor(request), 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/**
 * /api/preview-check?u=<url> — header probe for the in-page link preview.
 *
 * The frontend's floating preview iframe renders blank for sites that refuse
 * embedding (X-Frame-Options or CSP frame-ancestors), and a cross-origin
 * client can never read those headers itself. This same-origin endpoint does
 * a HEAD (GET fallback) fetch of the target URL and reports only framing-
 * relevant metadata — never the response body — so the frontend can show a
 * "this site can't be embedded" hint instead of a blank window.
 *
 * Safety: only http(s) targets are accepted and only header values are
 * returned (no body exfiltration); the route is already behind the per-IP
 * rate limiter. Unauthenticated by design so the frontend (which holds no
 * worker token) can call it.
 */
async function handlePreviewCheck(request, url) {
  const target = url.searchParams.get('u') || '';
  let parsed;
  try { parsed = new URL(target); } catch (e) { parsed = null; }
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    return jsonResponse({ error: 'missing or invalid url' }, 400, null, request);
  }
  try {
    let resp;
    try {
      resp = await fetch(parsed.href, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
    } catch (e) {
      // Some servers reject HEAD; retry with GET and discard the body.
      resp = await fetch(parsed.href, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
    }
    const xfo = (resp.headers.get('x-frame-options') || '').toUpperCase();
    const csp = resp.headers.get('content-security-policy') || '';
    const frameAncestorsMatch = (csp.match(/frame-ancestors[^;]*/i) || [''])[0].trim();
    // An X-Frame-Options value other than the (extremely rare) ALLOWALL forbids
    // framing, and so does any CSP frame-ancestors directive.
    const embeddable = !((xfo && xfo !== 'ALLOWALL') || /frame-ancestors/i.test(csp));
    return jsonResponse({
      url: resp.url || parsed.href,
      status: resp.status,
      xFrameOptions: xfo || null,
      frameAncestors: frameAncestorsMatch || null,
      embeddable: embeddable,
    }, 200, null, request);
  } catch (err) {
    return jsonResponse({ error: 'check failed', embeddable: null }, 502, null, request);
  }
}

async function handleEnterpriseRoute(request, env, url, ctx) {
  if (url.pathname === '/api/health') {
    return jsonResponse({ ok: true, service: 'dashv1-proxy' }, 200, null, request);
  }

  const token = bearerToken(request);
  if (!token || token !== (env.WORKER_API_TOKEN || '')) {
    return jsonResponse({ error: 'unauthorized' }, 401, null, request);
  }

  if (url.pathname === '/api/ai-insights' && request.method === 'POST') {
    return handleAiInsights(request, env, ctx);
  }
  if (url.pathname === '/api/notify-whatsapp' && request.method === 'POST') {
    return handleWhatsApp(request, env);
  }
  return jsonResponse({ error: 'not found' }, 404, null, request);
}

async function handleAiInsights(request, env, ctx) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'AI not configured' }, 500, null, request);
  }
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  // Build the same deterministic prompt as before — its hash IS the cache key,
  // so identical summaries share one edge entry.
  const s = body.summary || {};
  const prompt = body.prompt ||
    'India Post dashboard: total=' + (s.total || 0) + ', reviewDue=' + (s.flagged || s.reviewDue || 0) +
    ', normal=' + (s.normal || 0) + '. Give exactly 3 concise bullet follow-up actions.';

  const cacheKey = 'ai:' + hashText(prompt); // fnv-1a of the prompt
  const kv = env.AI_INSIGHTS_KV;

  // 1) KV read first — sub-10ms when warm, zero Gemini cost.
  if (kv) {
    try {
      const hit = await kv.get(cacheKey, 'json');
      if (hit && hit.insights) {
        return jsonResponse({
          success: true, insights: hit.insights,
          cachedAt: hit.cachedAt, stale: false
        }, 200, { 'X-AI-Cache': 'HIT' }, request);
      }
    } catch (e) { /* cache error = bypass, still call Gemini */ }
  }

  // 2) Cache miss → expensive Gemini call.
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    (env.GEMINI_MODEL || 'gemini-2.0-flash') + ':generateContent';
  let text = '';
  try {
    const resp = await fetch(endpoint + '?key=' + encodeURIComponent(env.GEMINI_API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const gem = await resp.json();
    text = gem && gem.candidates && gem.candidates[0] && gem.candidates[0].content &&
      gem.candidates[0].content.parts && gem.candidates[0].content.parts[0] &&
      gem.candidates[0].content.parts[0].text || '';
    if (!text) return jsonResponse({ error: 'AI returned no content' }, 502, null, request);
  } catch (err) {
    return jsonResponse({ error: 'AI request failed' }, 502, null, request);
  }

  // 3) Persist asynchronously so the response is not blocked by the KV write.
  if (kv) {
    ctx.waitUntil(kv.put(cacheKey, JSON.stringify({
      insights: text, cachedAt: Date.now(), prompt: prompt
    }), { expirationTtl: AI_INSIGHTS_TTL }));
  }

  return jsonResponse({ success: true, insights: text }, 200, { 'X-AI-Cache': 'MISS' }, request);
}

/** FNV-1a 64-bit → hex (fast, dependency-free, fine for cache keys). */
function hashText(str) {
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

async function handleWhatsApp(request, env) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return jsonResponse({ error: 'WhatsApp not configured' }, 500, null, request);
  }
  let payload;
  try { payload = await request.json(); } catch (e) { return jsonResponse({ error: 'invalid json' }, 400, null, request); }
  try {
    const resp = await fetch(
      'https://graph.facebook.com/v20.0/' + env.WHATSAPP_PHONE_NUMBER_ID + '/messages', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    return jsonResponse(await resp.json(), resp.status, null, request);
  } catch (err) {
    return jsonResponse({ error: 'WhatsApp request failed' }, 502, null, request);
  }
}
