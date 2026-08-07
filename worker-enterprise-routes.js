/**
 * worker-enterprise-routes.js
 * Optional Cloudflare Worker module for the enterprise addons (PWA).
 *
 * The base worker (worker.js) already serves every file in docs/ via the raw
 * GitHub CDN, so manifest.json, sw.js, offline-queue.js and the PWA icon all
 * resolve automatically. This module only upgrades their response headers
 * (MIME type, cache policy, Service-Worker-Allowed) and is safe to import.
 *
 * Wiring into worker.js (3 lines):
 *   import { isEnterprisePath, enterpriseHeadersForPath } from './worker-enterprise-routes.js';
 *   // in fetch(), before the static-bundle fallback:
 *   if (isEnterprisePath(path)) {
 *     const resp = await fetchFromPages(path, url.search);
 *     const headers = new Headers(resp.headers);
 *     Object.entries(enterpriseHeadersForPath(path)).forEach(([k, v]) => headers.set(k, v));
 *     return new Response(resp.body, { status: resp.status, headers });
 *   }
 */

const ENTERPRISE_MANIFEST_PATH = '/manifest.json';
const ENTERPRISE_SW_PATH = '/sw.js';
const ENTERPRISE_QUEUE_PATH = '/offline-queue.js';
const ENTERPRISE_ICON_PATH = '/docs-pwa-icon.svg';

/* Returns the extra response headers for a PWA path, or null when the path is
   not managed by the enterprise module. */
export function enterpriseHeadersForPath(path) {
  const clean = String(path || '').split('?')[0];

  if (clean === ENTERPRISE_MANIFEST_PATH) {
    return {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    };
  }

  if (clean === ENTERPRISE_SW_PATH) {
    return {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/'
    };
  }

  if (clean === ENTERPRISE_QUEUE_PATH) {
    return {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    };
  }

  if (clean === ENTERPRISE_ICON_PATH) {
    return {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400'
    };
  }

  return null;
}

/* True when the path is one of the enterprise-managed PWA assets. */
export function isEnterprisePath(path) {
  return enterpriseHeadersForPath(path) !== null;
}