/**
 * Cloudflare Worker — Reverse proxy for Google Apps Script web app
 *
 * Serves the GAS web app at the worker URL, stripping the
 * "This application was created by a Google Apps Script user" banner that
 * Google injects via client-side JavaScript on all Apps Script web app pages.
 *
 * CSP-safe approach:
 *   - NO <base> tag injection (blocked by Google's base-uri 'self' CSP)
 *   - Rewrite all relative /static/... URLs to absolute script.google.com URLs
 *   - Inject disclaimer-killer CSS/JS using the page's own nonce so it passes
 *     Google's strict-dynamic nonce-based CSP
 */

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
    let targetUrl = GAS_BASE_URL;

    const gasScriptOrigin = new URL(GAS_SCRIPT_URL).origin; // https://script.google.com

    if (!path || path === '/' || path === '/index.html' || path.startsWith('/app')) {
      const suffix = (path.startsWith('/app') && path.length > 4) ? path.slice(4) : '';
      let p = suffix;
      if (p && p !== '/') {
        targetUrl = GAS_SCRIPT_URL + p + '/exec';
      }
    } else if (path.startsWith('/static/')) {
      targetUrl = gasScriptOrigin + path;
    } else if (path.startsWith('/favicon.ico')) {
      targetUrl = gasScriptOrigin + '/favicon.ico';
    } else {
      targetUrl = GAS_SCRIPT_URL + path;
    }

    const gasHeaders = new Headers(request.headers);
    gasHeaders.delete('Host');
    gasHeaders.delete('Referer');

    const response = await fetch(targetUrl, {
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

    if (contentType.includes('javascript') || path.endsWith('.js')) {
      let js = await response.text();
      js = stripDisclaimerJs(js);
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Content-Type', 'application/javascript; charset=utf-8');
      Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(js, { status: response.status, headers: newHeaders });
    }

    if (contentType.includes('text/css') || path.endsWith('.css')) {
      const css = await response.text();
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Content-Type', 'text/css; charset=utf-8');
      Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(css, { status: response.status, headers: newHeaders });
    }

    const body = await response.arrayBuffer();
    const newHeaders = new Headers(response.headers);
    Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(body, { status: response.status, headers: newHeaders });
  },
};

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

  // 2. Rewrite relative URLs to absolute (covers href, src, action attributes)
  //    Matches quoted: href="/...", src="/...", action="/..."
  //    Does NOT touch already-absolute URLs (http/https/data/blob/://)
  result = result.replace(
    /((?:href|src|action)\s*=\s*)(["'])(\/((?!\/)([^"']*)))(["'])/gi,
    (match, attr, openQ, slashPath, rest, inner, closeQ) => {
      return attr + openQ + gasOrigin + slashPath + closeQ;
    }
  );

  // 3. Extract the nonce Google put on the page (used for strict-dynamic CSP)
  //    Google sets nonce="<value>" on <script> and <link> tags
  const nonceMatch = result.match(/\snonce=["']([^"']+)["']/i);
  const pageNonce = nonceMatch ? nonceMatch[1] : '';
  const nonceAttr = pageNonce ? ` nonce="${pageNonce}"` : '';

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
