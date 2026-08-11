/**
 * Unit tests for the hardened apiCall_ (defined in each client's head, outside
 * the SYNCED-FRONTEND markers, identical in script.html and docs/app.js).
 *
 * Background: the live app intermittently received Google's anti-abuse
 * interstitial (an HTML page with `ppConfig`) instead of JSON from the GAS
 * /exec endpoint. The old apiCall_ did `res.json()` unconditionally, so the
 * app threw `Unexpected token '<', "<!DOCTYPE"... is not valid JSON` and
 * showed "Error loading app: <cryptic message>" with no recovery path.
 *
 * The fix: read the body as text, only JSON.parse when it actually looks like
 * JSON, auto-retry ONCE on non-JSON (interstitial/HTML) responses, and surface
 * a friendly retryable message instead of a JSON parse error.
 *
 * Run with:  node --test tests/api-call-resilience.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'script.html'), 'utf8');
const MATCH = SCRIPT.match(/<script>([\s\S]*)<\/script>/);
assert.ok(MATCH, 'script.html <script> block not found');
const JS = MATCH[1];

/** Extracts apiCall_ from the client head. It sits immediately before the
 *  SYNCED-FRONTEND:BEGIN marker comment, so the slice is exact. */
function extractApiCall(src) {
  const mark = 'function apiCall_(fn){';
  const start = src.indexOf(mark);
  assert.notStrictEqual(start, -1, 'apiCall_ not found in script.html');
  const end = src.indexOf('/* ===== SYNCED-FRONTEND:BEGIN ===== */', start);
  assert.ok(end > start, 'SYNCED-FRONTEND:BEGIN marker not found after apiCall_');
  return src.slice(start, end);
}

/** fetch stub: serves `responses` in order (last one repeats). */
function makeSandbox(responses) {
  let call = 0;
  const sandbox = {
    console,
    Promise,
    String,
    JSON,
    Error,
    // Fire the 1500ms backoff immediately so tests are fast.
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    API_URL: 'https://example.com/exec',
    fetch: () => {
      const r = responses[Math.min(call, responses.length - 1)];
      call++;
      return Promise.resolve({
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        text: () => Promise.resolve(r.body),
      });
    },
  };
  vm.runInNewContext(extractApiCall(JS), sandbox);
  return sandbox;
}

const JSON_OK = { status: 200, body: '{"result":{"success":true,"token":"t1"}}' };
const HTML_PAGE = { status: 200, body: '<!DOCTYPE html><html><head><script>window["ppConfig"] = {};</script></head><body>challenge</body></html>' };

/* ---------------------------------- Tests ---------------------------------- */

test('apiCall_ returns data.result for a normal JSON success', async () => {
  const s = makeSandbox([JSON_OK]);
  const out = await s.apiCall_('login', 'a@x.com', 'pw');
  assert.deepStrictEqual(out, { success: true, token: 't1' });
});

test('apiCall_ surfaces server error messages (data.error) verbatim', async () => {
  const s = makeSandbox([{ status: 200, body: '{"success":false,"error":"Invalid credentials."}' }]);
  await assert.rejects(s.apiCall_('login', 'a', 'b'), /Invalid credentials\./);
});

test('apiCall_ retries once when the response is an HTML interstitial, then succeeds', async () => {
  const s = makeSandbox([HTML_PAGE, JSON_OK]);
  const out = await s.apiCall_('getAppData', 'token');
  assert.deepStrictEqual(out, { success: true, token: 't1' });
});

test('apiCall_ rejects with a FRIENDLY message (not a JSON parse error) after two HTML responses', async () => {
  const s = makeSandbox([HTML_PAGE, HTML_PAGE]);
  await assert.rejects(s.apiCall_('getAppData', 'token'), /unexpected response\.?/i);
});

test('apiCall_ throws HTTP errors immediately (no retry on non-retryable errors)', async () => {
  let calls = 0;
  const s = makeSandbox([{ status: 500, body: 'boom' }]);
  s.fetch = () => {
    calls++;
    return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') });
  };
  await assert.rejects(s.apiCall_('getTasks', {}), /HTTP 500/);
  assert.strictEqual(calls, 1, 'must not retry a plain HTTP error');
});

test('the documented user-facing symptom is gone: no "Unexpected token" leak', async () => {
  const s = makeSandbox([HTML_PAGE, HTML_PAGE]);
  try {
    await s.apiCall_('getAppData', 'token');
    assert.fail('expected rejection');
  } catch (err) {
    assert.ok(!/Unexpected token/.test(err.message), 'message must not leak a JSON parse error');
    assert.ok(!/DOCTYPE/.test(err.message), 'message must not leak raw HTML');
  }
});
