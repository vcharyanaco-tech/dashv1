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
    return fetchFromPages(path, url.search);
  },
};

// ── GitHub Pages static bundle fetcher ──────────────────────────────────────
async function fetchFromPages(path, search) {
  // Map request path to a docs/ file on the raw GitHub CDN.
  // / and /index.html → docs/index.html (the landing page)
  let filePath = path;
  if (!filePath || filePath === '/') filePath = '/index.html';

  // Strip query string from path for file lookup (pass it through on redirect)
  const rawUrl = GITHUB_RAW + filePath;

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
