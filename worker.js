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

const COMMON_HEADERS = {
  'X-Frame-Options': 'ALLOWALL',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Referrer-Policy': 'no-referrer-when-downgrade',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...COMMON_HEADERS, 'Access-Control-Max-Age': '86400' },
      });
    }

    // ── Route: /api/* → enterprise API (health, AI insights, WhatsApp notify) ─
    // External secrets (GEMINI_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
    // live only in Worker secrets/environment and are read from `env` here.
    if (url.pathname.startsWith('/api/')) {
      return handleEnterpriseRoute(request, env, url);
    }

    const GAS_BASE_URL = env.GAS_URL;
    const GAS_SCRIPT_URL = env.GAS_SCRIPT_URL;

    if (!GAS_BASE_URL || !GAS_SCRIPT_URL) {
      return new Response('Worker not configured', { status: 500, headers: COMMON_HEADERS });
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
      proxyHeaders.set('User-Agent', 'Mozilla/5.0');
      // Read body as text to avoid ReadableStream-passthrough issues in Workers
      const isGetHead = request.method === 'GET' || request.method === 'HEAD';
      const bodyText = isGetHead ? undefined : await request.text();
      const resp = await fetch(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: bodyText,
        redirect: 'follow',
      });
      const newHeaders = new Headers(resp.headers);
      Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
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
        const resp = await fetchFromPages(path, url.search);
        const newHeaders = new Headers(resp.headers);
        Object.entries(headers).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(resp.body, { status: resp.status, headers: newHeaders });
      }
    }

    return fetchFromPages(path, url.search);
  },
};

// ── GitHub Pages static bundle fetcher ──────────────────────────────────────
async function fetchFromPages(path, search) {
  // Map request path to a docs/ file on the raw GitHub CDN.
  // / and /index.html → docs/index.html (the landing page)
  let filePath = path;
  if (!filePath || filePath === '/') filePath = '/index.html';

  // Include query string when fetching from GitHub Raw to bypass CDN caching
  const rawUrl = GITHUB_RAW + filePath + (search || '');

  const resp = await fetch(rawUrl, { redirect: 'follow' });

  if (resp.status === 404) {
    // Fallback: serve index.html for unknown paths (SPA-style)
    const fallback = await fetch(GITHUB_RAW + '/index.html');
    const html = await fallback.text();
    return new Response(html, {
      status: 200,
      headers: {
        ...COMMON_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Determine content-type from path extension since raw CDN may not set it
  const ct = guessContentType(filePath) || resp.headers.get('Content-Type') || 'application/octet-stream';
  const body = await resp.arrayBuffer();

  const headers = {
    ...COMMON_HEADERS,
    'Content-Type': ct,
    'Cache-Control': filePath.match(/\.(js|css|png|ico|jpg|svg|woff2?)(\?|$)/)
      ? 'public, max-age=3600'
      : 'public, max-age=300',
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

// ── GAS proxy fetcher (banner-stripped) ─────────────────────────────────────
async function fetchFromGas(request, GAS_BASE_URL, GAS_SCRIPT_URL) {
  const gasScriptOrigin = new URL(GAS_SCRIPT_URL).origin;

  const gasHeaders = new Headers(request.headers);
  gasHeaders.delete('Host');
  gasHeaders.delete('Referer');

  const response = await fetch(GAS_BASE_URL, {
    method: request.method,
    headers: gasHeaders,
    body: request.method === 'GET' ? undefined : request.body,
    redirect: 'manual',
  });

  const contentType = response.headers.get('Content-Type') || '';

  if (contentType.includes('text/html')) {
    let html = await response.text();
    html = processHtml(html, gasScriptOrigin);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Content-Type', 'text/html; charset=utf-8');
    Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(html, { status: response.status, headers: newHeaders });
  }

  if (contentType.includes('javascript') || request.url.endsWith('.js')) {
    let js = await response.text();
    js = stripDisclaimerJs(js);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Content-Type', 'application/javascript; charset=utf-8');
    Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(js, { status: response.status, headers: newHeaders });
  }

  const body = await response.arrayBuffer();
  const newHeaders = new Headers(response.headers);
  Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
  return new Response(body, { status: response.status, headers: newHeaders });
}

/**
 * Main HTML processor:
 *  1. Remove any <base> tags (we use absolute URL rewriting instead)
 *  2. Rewrite relative /static/... and /macros/... URLs to absolute
 *  3. Extract the page's nonce so injected scripts/styles pass CSP
 *  4. Inject disclaimer-killer CSS and JS using that nonce
 *  5. Strip disclaimer text from HTML
 */
function processHtml(html, gasOrigin) {
  let result = html;

  // 1. Remove ALL <base> tags — they violate base-uri 'self' CSP
  result = result.replace(/<base[^>]*>/gi, '');

  // 3. Extract the nonce Google put on the page (used for strict-dynamic CSP)
  //    Google sets nonce="<value>" on <script> and <link> tags
  const nonceMatch = result.match(/\snonce=["']([^"']+)["']/i);
  const pageNonce = nonceMatch ? nonceMatch[1] : '';
  const nonceAttr = pageNonce ? ` nonce="${pageNonce}"` : '';

  // 3b. Add the page nonce to the warden external <script src> tag so it
  //     passes strict-dynamic CSP (external scripts need a nonce under strict-dynamic)
  if (pageNonce) {
    result = result.replace(
      /(<script\b)([^>]*\bsrc=["']https:\/\/script\.google\.com\/static\/[^"']+["'][^>]*)(>)/gi,
      (match, open, attrs, close) => {
        // Only add nonce if not already present
        if (attrs.includes('nonce=')) return match;
        return `${open}${attrs} nonce="${pageNonce}"${close}`;
      }
    );
  }

  // 4. Remove the empty #warning div (initially empty, populated by warden JS)
  result = result.replace(
    /<div[^>]*id=["']warning["'][^>]*>\s*<\/div>/gi, ''
  );

  // 5. Strip standalone disclaimer text
  result = result.replace(
    /[\s]*This application was created by a Google Apps Script user[^<]*(<[^>]+>[^<]*<\/[^>]+>)*[\s]*/gi, ''
  );

  // 6. Inject disclaimer-killer CSS with the page nonce so it passes CSP
  //    IMPORTANT: Do NOT hide #warning-bar-table — it contains the sandboxFrame iframe
  const hideCss =
    `<style${nonceAttr} id="gas-disclaimer-killer">`
    + '#warning{display:none!important}'
    + '.warning-bar{display:none!important}'
    + '.warning-banner{display:none!important}'
    + '.warning-banner-text{display:none!important}'
    + '.warning-banner-icon{display:none!important}'
    + '.warning-banner-header{display:none!important}'
    + '.warning-banner-buttons{display:none!important}'
    + '.warning-banner-close-icon{display:none!important}'
    + '[id*="warning-text"]{display:none!important}'
    + '[class*="warning-banner"]{display:none!important}'
    + '[id*="ga-web-app-banner"]{display:none!important}'
    + '[id*="disclaimer"]{display:none!important}'
    + '[class*="disclaimer"]{display:none!important}'
    + '</style>';

  result = result.replace(/(<\/head>)/i, hideCss + '$1');

  // 7. Inject disclaimer-killer JS with the page nonce so it passes CSP
  const killScript =
    `<script${nonceAttr}>(function(){'use strict';`
    + 'function killDisclaimer(){'
    + 'var sel=['
    + '"#warning",'
    + '".warning-bar",'
    + '".warning-banner",'
    + '".warning-banner-text",'
    + '".warning-banner-icon",'
    + '".warning-banner-header",'
    + '".warning-banner-buttons",'
    + '".warning-banner-close-icon",'
    + '"[id*=\\"warning-text\\"]",'
    + '"[class*=\\"warning-banner\\"]",'
    + '"[id*=\\"disclaimer\\"]",'
    + '"[class*=\\"disclaimer\\"]"'
    + '];'
    + 'sel.forEach(function(s){'
    + 'var els=document.querySelectorAll(s);'
    + 'for(var i=0;i<els.length;i++){'
    + 'var el=els[i];'
    + 'if(el.id==="warning-bar-table")continue;'
    + 'el.style.setProperty("display","none","important");'
    + 'el.style.setProperty("visibility","hidden","important");'
    + 'el.style.height="0";'
    + 'el.style.overflow="hidden";'
    + 'try{el.parentNode.removeChild(el)}catch(e){}'
    + '}'
    + '});'
    + '}'
    + 'if(document.readyState==="loading"){'
    + 'document.addEventListener("DOMContentLoaded",killDisclaimer);'
    + '}else{killDisclaimer();}'
    + 'setTimeout(killDisclaimer,100);'
    + 'setTimeout(killDisclaimer,500);'
    + 'setTimeout(killDisclaimer,1000);'
    + 'setTimeout(killDisclaimer,3000);'
    + 'if(window.MutationObserver){'
    + 'var mo=new MutationObserver(function(mutations){'
    + 'mutations.forEach(function(m){'
    + 'm.addedNodes.forEach(function(n){'
    + 'if(n.nodeType===1&&((n.id||"")+(n.className||"")).match(/warning|disclaimer|banner/)){'
    + 'n.style.setProperty("display","none","important");'
    + 'try{n.parentNode.removeChild(n)}catch(e){}'
    + '}'
    + '});'
    + '});'
    + '});'
    + 'mo.observe(document.documentElement,{childList:true,subtree:true});'
    + '}'
    + '})();'
    + '<\/script>';

  result = result.replace(/(<body[^>]*>)/i, '$1' + killScript);

  return result;
}

/**
 * Strips the disclaimer text from warden JavaScript source.
 */
function stripDisclaimerJs(js) {
  let result = js;

  result = result.replace(
    /"This application was created by a Google Apps Script user"/g,
    '""'
  );

  result = result.replace(
    /function kB\(a,b\)\{[\s\S]*?d\.appendChild\(a\);[\s\S]*?d\.appendChild\(e\);[\s\S]*?\}/g,
    'function kB(a,b){}'
  );

  return result;
}

// ── Enterprise /api/* routes ────────────────────────────────────────────────
// Authorization: shared internal bearer token (env.WORKER_API_TOKEN).
// External secrets (GEMINI_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
// are read only from Worker environment/secrets and never echoed in responses.

const AI_INSIGHTS_TTL = 3600; // seconds; 1h keeps insights fresh-ish

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function handleEnterpriseRoute(request, env, url) {
  if (url.pathname === '/api/health') {
    return jsonResponse({ ok: true, service: 'dashv1-proxy' });
  }

  const token = bearerToken(request);
  if (!token || token !== (env.WORKER_API_TOKEN || '')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  if (url.pathname === '/api/ai-insights' && request.method === 'POST') {
    return handleAiInsights(request, env, ctx);
  }
  if (url.pathname === '/api/notify-whatsapp' && request.method === 'POST') {
    return handleWhatsApp(request, env);
  }
  return jsonResponse({ error: 'not found' }, 404);
}

async function handleAiInsights(request, env, ctx) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'AI not configured' }, 500);
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
        }, 200, { 'X-AI-Cache': 'HIT' });
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
    if (!text) return jsonResponse({ error: 'AI returned no content' }, 502);
  } catch (err) {
    return jsonResponse({ error: 'AI request failed' }, 502);
  }

  // 3) Persist asynchronously so the response is not blocked by the KV write.
  if (kv) {
    ctx.waitUntil(kv.put(cacheKey, JSON.stringify({
      insights: text, cachedAt: Date.now(), prompt: prompt
    }), { expirationTtl: AI_INSIGHTS_TTL }));
  }

  return jsonResponse({ success: true, insights: text }, 200, { 'X-AI-Cache': 'MISS' });
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
    return jsonResponse({ error: 'WhatsApp not configured' }, 500);
  }
  let payload;
  try { payload = await request.json(); } catch (e) { return jsonResponse({ error: 'invalid json' }, 400); }
  try {
    const resp = await fetch(
      'https://graph.facebook.com/v20.0/' + env.WHATSAPP_PHONE_NUMBER_ID + '/messages', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    return jsonResponse(await resp.json(), resp.status);
  } catch (err) {
    return jsonResponse({ error: 'WhatsApp request failed' }, 502);
  }
}
