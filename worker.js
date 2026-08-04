/**
 * Cloudflare Worker — Reverse proxy for Google Apps Script web app
 *
 * Serves the GAS web app from app.dashboardharyana.site, stripping the
 * "This application was created by a Google Apps Script user" banner that
 * Google injects on all Apps Script web app pages.
 *
 * Deployment: https://dash.cloudflare.com  →  Workers  →  Create
 * Route: app.dashboardharyana.site/*
 *
 * Usage after deploy:
 *   https://app.dashboardharyana.site/     →  loads the GAS web app
 *   The iframe in docs/index.html should point here, NOT to script.google.com
 */

const GAS_BASE_URL =
  'https://script.google.com/macros/s/AKfycbzLwxHpeudnLydvoPmFry1WkRrRayBMuSWd-VqPt6zehFOJocLw1CJqCzHbt3NDOLsJ/exec';

const GAS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzLwxHpeudnLydvoPmFry1WkRrRayBMuSWd-VqPt6zehFOJocLw1CJqCzHbt3NDOLsJ';

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

    let targetUrl = GAS_BASE_URL;
    const path = url.pathname;

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
 * Google injects a div at the bottom of every Apps Script web app page with
 * text like:
 *   "This application was created by a Google Apps Script user, not by Google.
 *    It is not offered, endorsed, or supported by Google.
 *    To report abuse, click here."
 *
 * The exact HTML structure varies, so we use multiple patterns.
 */
function stripDisclaimer(html) {
  const patterns = [
    /<div[^>]*>\s*<div[^>]*>\s*This application was created by a Google Apps Script user[^<]*<\/div>\s*<\/div>/gis,
    /<div[^>]*>\s*This application was created by a Google Apps Script user[\s\S]*?<\/div>/gi,
    /<div[^>]*class="[^"]*ga-web-app-banner[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<div[^>]*>[\s\S]*?This application was created by a Google Apps Script user[\s\S]*?<\/div>/gi,
    /This application was created by a Google Apps Script user[^<]*(<[^>]+>[^<]*<\/[^>]+>)*[\s]*/gi,
  ];

  let result = html;
  for (const pattern of patterns) {
    result = result.replace(pattern, '');
  }

  result = result.replace(/<\/body>\s*$/i, '</body>');

  return result;
}
