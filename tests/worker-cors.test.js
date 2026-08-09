/**
 * Worker CORS contract tests (Task 1.1 hardening).
 *
 * The Cloudflare Worker previously sent `Access-Control-Allow-Origin: *` on
 * every response. After hardening, `headersFor(request)` in worker.js echoes
 * the Origin header ONLY when it matches TRUSTED_ORIGINS; non-trusted origins
 * get no ACAO header at all (so a foreign page can never read our responses),
 * and `X-Frame-Options` is SAMEORIGIN.
 *
 * These tests execute the REAL `headersFor`/`TRUSTED_ORIGINS`/`BASE_HEADERS`
 * extracted from worker.js at load time (same convention as the other tests:
 * test the shipped code, not a re-typed copy), and add source-level guards
 * against the two permissive patterns the hardening removed.
 *
 * Run with:  node --test tests/worker-cors.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WORKER = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

/**
 * Loads the CORS block (TRUSTED_ORIGINS + BASE_HEADERS + headersFor) from
 * worker.js into a fresh vm sandbox and returns the real headersFor function.
 * The block runs from the TRUSTED_ORIGINS const to just before `export default`
 * (the next top-level statement after headersFor).
 */
function loadHeadersFor() {
  const start = WORKER.indexOf('const TRUSTED_ORIGINS');
  assert.notStrictEqual(start, -1, 'TRUSTED_ORIGINS not found in worker.js');
  const end = WORKER.indexOf('export default', start);
  assert.notStrictEqual(end, -1, 'export default not found after TRUSTED_ORIGINS');
  const block = WORKER.slice(start, end);

  // Provide a minimal Request-like object: only headers.get('Origin') is used.
  const sandbox = {};
  vm.createContext(sandbox);
  const fn = vm.runInContext(block + '\n; headersFor;', sandbox);
  assert.strictEqual(typeof fn, 'function', 'headersFor did not load');
  return fn;
}

const headersFor = loadHeadersFor();

/** Builds a minimal request stub with an optional Origin header. */
function requestWithOrigin(origin) {
  return {
    headers: {
      get: function (name) {
        if (name === 'Origin') return origin || null;
        return null;
      },
    },
  };
}

const TRUSTED = [
  'https://dashboardharyana.site',
  'https://www.dashboardharyana.site',
  'https://vcharyanaco-tech.github.io',
];

test('non-trusted origins get NO Access-Control-Allow-Origin header', () => {
  const attacks = [
    'https://evil.example.com',
    'https://dashboardharyana.site.evil.com', // suffix spoof
    'http://dashboardharyana.site',           // wrong scheme
    'https://dashboardharyana.site:8080',     // wrong port
    'https://dashboardharyana.site.evil.io',
    'https://vcharyanaco-tech.github.io.evil.com',
    'null',                                   // sandboxed iframe/file://
    'https://sub.dashboardharyana.site',      // unlisted subdomain
  ];
  for (const origin of attacks) {
    const h = headersFor(requestWithOrigin(origin));
    assert.ok(!('Access-Control-Allow-Origin' in h),
      'ACAO must be absent for non-trusted origin: ' + origin);
    assert.ok(!('Vary' in h), 'Vary must be absent when ACAO is not echoed: ' + origin);
  }
});

test('trusted origins get their exact Origin echoed with Vary: Origin', () => {
  for (const origin of TRUSTED) {
    const h = headersFor(requestWithOrigin(origin));
    assert.strictEqual(h['Access-Control-Allow-Origin'], origin,
      'ACAO must echo the trusted origin exactly: ' + origin);
    assert.strictEqual(h['Vary'], 'Origin', 'Vary: Origin required for ' + origin);
  }
});

test('no Origin header (same-origin navigation) gets no ACAO', () => {
  const h = headersFor(requestWithOrigin(null));
  assert.ok(!('Access-Control-Allow-Origin' in h));
  assert.ok(!('Vary' in h));
});

test('no request object at all is handled safely', () => {
  const h = headersFor(undefined);
  assert.ok(!('Access-Control-Allow-Origin' in h));
  // BASE_HEADERS are still present for every response.
  assert.strictEqual(h['X-Frame-Options'], 'SAMEORIGIN');
});

test('X-Frame-Options is SAMEORIGIN for trusted AND non-trusted origins', () => {
  assert.strictEqual(headersFor(requestWithOrigin('https://evil.example.com'))['X-Frame-Options'], 'SAMEORIGIN');
  assert.strictEqual(headersFor(requestWithOrigin(TRUSTED[0]))['X-Frame-Options'], 'SAMEORIGIN');
  assert.strictEqual(headersFor(requestWithOrigin(null))['X-Frame-Options'], 'SAMEORIGIN');
});

test('every call returns a fresh object (shared header const is never mutated)', () => {
  const h1 = headersFor(requestWithOrigin(TRUSTED[0]));
  const h2 = headersFor(requestWithOrigin(TRUSTED[0]));
  assert.notStrictEqual(h1, h2, 'headersFor must not return the shared BASE_HEADERS object');
  h1['X-Frame-Options'] = 'BREACHED';
  // Mutating one result must not leak into another call or the base.
  assert.strictEqual(headersFor(requestWithOrigin(null))['X-Frame-Options'], 'SAMEORIGIN');
  assert.strictEqual(h2['X-Frame-Options'], 'SAMEORIGIN');
});

test('no permissive CORS or clickjacking settings remain in worker.js source', () => {
  // The two patterns the hardening removed must never come back.
  assert.ok(!/'Access-Control-Allow-Origin'\s*:\s*'\*'/.test(WORKER),
    "wildcard ACAO 'Access-Control-Allow-Origin': '*' must not be in worker.js");
  assert.ok(!/X-Frame-Options'\s*:\s*'ALLOWALL'/.test(WORKER),
    "X-Frame-Options: ALLOWALL must not be in worker.js");
  assert.ok(/X-Frame-Options'\s*:\s*'SAMEORIGIN'/.test(WORKER),
    'X-Frame-Options: SAMEORIGIN must be present');
});

test('proxy path strips any upstream ACAO before applying trusted headers', () => {
  // raw.githubusercontent.com sends `Access-Control-Allow-Origin: *`; the proxy
  // must delete it (and Vary) before setting our headers, or the origin
  // restriction is defeated on proxied routes.
  const strip = WORKER.indexOf("newHeaders.delete('Access-Control-Allow-Origin')");
  assert.notStrictEqual(strip, -1, 'proxy path must delete upstream ACAO');
  const set = WORKER.indexOf('Object.entries(headersFor(request))', strip);
  assert.ok(set > strip, 'headersFor must be applied AFTER the upstream ACAO delete');
  assert.ok(WORKER.indexOf("newHeaders.delete('Vary')") > strip,
    'proxy path must also delete upstream Vary');
});
