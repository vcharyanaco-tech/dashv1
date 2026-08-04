/**
 * Cloudflare Worker — Reverse proxy for Google Apps Script web app
 *
 * Serves the GAS web app from app.dashboardharyana.site, stripping the
 * "This application was created by a Google Apps Script user" banner that
 * Google injects via client-side JavaScript on all Apps Script web app pages.
 *
 * Deployment: https://dash.cloudflare.com  →  Workers  →  Create
 * Route: app.dashboardharyana.site/*
 *
 * Usage after deploy:
 *   https://dashv1-proxy.dashv1-proxy.workers.dev/    (default workers.dev)
 *   https://app.dashboardharyana.site/                (custom domain, when on Cloudflare)
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

    if (path.startsWith('/app')) {
      const suffix = path.slice(4);
      if (suffix && suffix !== '/') {
        targetUrl = GAS_SCRIPT_URL + suffix + '/exec';
      }
    } else if (path.startsWith('/')) {
      const suffix = path.slice(1);
      if (suffix && suffix !== 'index.html') {
        targetUrl = GAS_SCRIPT_URL + suffix + '/exec';
      }
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

      html = stripDisclaimer(html);

      html = html.replace(
        /<base[^>]*>/gi,
        '<base href="' + GAS_SCRIPT_URL + '/">'
      );

      const newHeaders = new Headers(response.headers);
      newHeaders.set('Content-Type', 'text/html; charset=utf-8');
      Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));

      return new Response(html, {
        status: response.status,
        headers: newHeaders,
      });
    }

    const body = await response.arrayBuffer();
    const newHeaders = new Headers(response.headers);
    Object.entries(COMMON_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));

    return new Response(body, {
      status: response.status,
      headers: newHeaders,
    });
  },
};

/**
 * Removes the Google Apps Script disclaimer banner from the HTML response.
 *
 * The disclaimer text ("This application was created by a Google Apps Script
 * user, not by Google…") is injected by Google's client-side JavaScript after
 * page load, populating a <div id="warning-bar-table"> element. We remove
 * this element and inject CSS to hide any remaining disclaimer-related nodes.
 *
 * We also strip the disclaimer text from any JavaScript that contains it.
 */
function stripDisclaimer(html) {
  let result = html;

  // Remove the warning-bar table div entirely (contains the sandbox iframe wrapper)
  result = result.replace(
    /<div[^>]*id=["']warning-bar-table["'][^>]*>[\s\S]*?<\/div>\s*<div[^>]*style=["'][^"']*height:\s*100%[^"']*[\s\S]*?<\/div>\s*<\/div>/gi,
    '<div id="sandboxRoot"></div>'
  );

  // Remove just the warning-bar div
  result = result.replace(
    /<div[^>]*id=["']warning["'][^>]*>[\s\S]*?<\/div>/gi,
    ''
  );
  result = result.replace(
    /<div[^>]*>[\s\S]*?This application was created by a Google Apps Script user[\s\S]*?<\/div>/gi,
    ''
  );
  result = result.replace(
    /<div[^>]*>\s*This application was created by a Google Apps Script user[^<]*<\/div>\s*<\/div>/gis,
    ''
  );
  result = result.replace(
    /This application was created by a Google Apps Script user[^<]*(<[^>]+>[^<]*<\/[^>]+>)*[\s]*/gi,
    ''
  );

  // Remove standalone disclaimer text
  result = result.replace(
    /[\s]*This application was created by a Google Apps Script user[^<]*(<[^>]+>[^<]*<\/[^>]+>)*[\s]*/gi,
    ''
  );

  // Inject CSS to hide any remaining disclaimer or warning-bar elements
  // This runs before the GAS JavaScript tries to populate them
  const hideCss =
    '<style id="gas-disclaimer-killer">'
    + '#warning-bar-table{display:none!important}'
    + '#warning{display:none!important}'
    + '.warning-bar{display:none!important}'
    + '[id*="warning-bar"]{display:none!important}'
    + '[id*="ga-web-app-banner"]{display:none!important}'
    + '.gas-disclaimer{display:none!important}'
    + '</style>';

  result = result.replace(/(<\/head>)/i, hideCss + '$1');

  // Inject a script that removes warning-bar elements after DOM load
  const killScript =
    '<script>(function(){'
    + 'function killDisclaimer(){'
    + 'var els=document.querySelectorAll("#warning-bar-table,#warning,.warning-bar");'
    + 'for(var i=0;i<els.length;i++){els[i].style.setProperty("display","none","important");'
    + 'els[i].parentNode&&els[i].parentNode.removeChild(els[i]);}'
    + '}'
    + 'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",killDisclaimer)}'
    + 'else{killDisclaimer()}'
    + 'setTimeout(killDisclaimer,500);'
    + 'setTimeout(killDisclaimer,2000);'
    + '})();'
    + '<\/script>';

  result = result.replace(/(<body)/i, killScript + '$1');

  // Clean up trailing whitespace before </body>
  result = result.replace(/<\/body>\s*$/i, '</body>');

  return result;
}
