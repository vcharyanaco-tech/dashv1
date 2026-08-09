/**
 * Contract test: core CRUD API signatures never drift between the frontend
 * clients and the GAS backend.
 *
 * The web app calls the backend through an explicit allowlist (API_ROUTES in
 * code.js). A client wrapper such as:
 *
 *   updateItem: function (item) { return apiCall_('updateItem', item, getAuthToken()); },
 *
 * must agree with the server route:
 *
 *   API_ROUTES.updateItem === function updateItem(item, token)
 *
 * If a client renames an action, changes the number of args, or the server
 * changes a signature, this test fails and pinpoints the drift.
 *
 * It checks BOTH clients (script.html GAS template + docs/app.js static PWA)
 * against the SAME server file, and also asserts the two clients agree with
 * each other for the covered wrappers (they live in the SYNCED region, so any
 * asymmetry here is a genuine bug).
 *
 * Run with:  node --test tests/crud-api-contract.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'code.js'), 'utf8');

/** Inline <script> body of script.html (LAST closing tag: the JS itself
 *  contains a literal `</script>` inside a string, see sync-frontend.js). */
function scriptHtmlBody() {
  const raw = fs.readFileSync(path.join(ROOT, 'script.html'), 'utf8');
  const start = raw.indexOf('<script>');
  const end = raw.lastIndexOf('</script>');
  assert.notStrictEqual(start, -1, 'script.html: <script> open tag missing');
  assert.notStrictEqual(end, -1, 'script.html: </script> close tag missing');
  return raw.slice(start + '<script>'.length, end);
}

const CLIENTS = {
  'script.html (GAS)': scriptHtmlBody(),
  'docs/app.js (PWA)': fs.readFileSync(path.join(ROOT, 'docs', 'app.js'), 'utf8'),
};

/** Actions under contract: wrapper key -> expected server params. */
const CRUD = {
  addItem: ['item', 'token'],
  updateItem: ['item', 'token'],
  deleteItem: ['row', 'token'],
};

/**
 * Extracts a top-level `function name(` signature block from a server file.
 * Returns { params: [..], body: '...' } or null if not found.
 */
function extractServerFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) return null;
  const open = src.indexOf('{', start);
  if (open === -1) return null;
  const params = src
    .slice(start + ('function ' + name).length, open)
    .trim()
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return { params: params, body: src.slice(open, i + 1) };
}

/** Extracts the ApiService wrapper body for `key` from a client source. */
function clientWrapper(src, key) {
  const re = new RegExp(key + '\\s*:\\s*function\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\},');
  const m = src.match(re);
  if (!m) return null;
  return { params: m[1].split(',').map((p) => p.trim()).filter(Boolean), body: m[2].trim() };
}

/** Extracts the apiCall_ body (for reference in failure diagnostics). */
function apiCallBody(src) {
  const m = src.match(/function\s+apiCall_\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/);
  if (!m) return null;
  return { params: m[1].split(',').map((p) => p.trim()).filter(Boolean), body: m[2].trim() };
}

test('API_ROUTES allowlist exposes the CRUD actions', () => {
  const routes = CODE.match(/var API_ROUTES = \{[\s\S]*?\n\};/);
  assert.ok(routes, 'API_ROUTES block not found in code.js');
  for (const action of Object.keys(CRUD)) {
    assert.ok(new RegExp('\\b' + action + '\\s*:\\s*' + action + '\\b').test(routes[0]),
      'API_ROUTES missing ' + action + ' route');
  }
});

test('server CRUD signatures match the expected (payload, token) shape', () => {
  for (const [action, expectedParams] of Object.entries(CRUD)) {
    const fn = extractServerFunction(CODE, action);
    assert.ok(fn, 'function ' + action + ' not found in code.js');
    assert.deepStrictEqual(fn.params, expectedParams,
      action + ' server params changed; client call sites must be updated');
  }
});

test('every client wrapper routes to the correct server action with payload + token', () => {
  for (const [clientName, src] of Object.entries(CLIENTS)) {
    for (const action of Object.keys(CRUD)) {
      const w = clientWrapper(src, action);
      assert.ok(w, clientName + ': missing ApiService wrapper for ' + action);

      // The first argument to apiCall_ must be the exact server action name.
      assert.ok(w.body.includes(`apiCall_('${action}'`),
        `${clientName} ${action}: wrapper does not call apiCall_(${action})`);

      // payload param + getAuthToken() -> exactly 2 server args (payload, token).
      assert.ok(w.body.includes('getAuthToken()'),
        clientName + ' ' + action + ': wrapper does not pass getAuthToken()');
      const callPat = new RegExp(`apiCall_\\(['\"]${action}['\"],\\s*${w.params[0]},\\s*getAuthToken\\(\\)\\)`);
      assert.ok(callPat.test(w.body),
        `${clientName} ${action}: wrapper must pass (action, payload, token)`);
    }
  }
});

test('both clients agree on every CRUD wrapper (no client-to-client drift)', () => {
  const bodies = {};
  for (const action of Object.keys(CRUD)) {
    bodies[action] = new Set();
    for (const src of Object.values(CLIENTS)) {
      const w = clientWrapper(src, action);
      assert.ok(w, 'missing wrapper for ' + action);
      bodies[action].add(w.body.replace(/\s+/g, ' '));
    }
    assert.strictEqual(bodies[action].size, 1,
      'CRUD wrapper ' + action + ' differs between clients:\n  ' +
      [...bodies[action]].join('\n  vs\n  '));
  }
});

test('client apiCall_ implementations are functionally identical', () => {
  const normalized = new Set();
  for (const src of Object.values(CLIENTS)) {
    const a = apiCallBody(src);
    assert.ok(a, 'apiCall_ not found in client');
    // Functionally identical: params + body with whitespace collapsed.
    normalized.add(JSON.stringify({ p: a.params, b: a.body.replace(/\s+/g, ' ') }));
  }
  assert.strictEqual(normalized.size, 1, 'apiCall_ differs between clients');
});

test('payload structures: addItem/updateItem send an object, deleteItem sends an identifier', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'app.js'), 'utf8');
  // Wrapper parameter names are part of the contract: item (object) vs row (id).
  for (const action of ['addItem', 'updateItem']) {
    const w = clientWrapper(doc, action);
    assert.strictEqual(w.params[0], 'item', action + ' should take an item payload');
  }
  const del = clientWrapper(doc, 'deleteItem');
  assert.strictEqual(del.params[0], 'row', 'deleteItem should take a row identifier');
});
