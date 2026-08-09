/**
 * Unit tests for the Point 7 security helpers in Utils.js:
 *   - sanitizeHtml_   (allow-listed rich-text sanitizer)
 *   - withIdempotency_ (idempotency-key result replay)
 *
 * To test the actual shipped code rather than a re-typed copy, the real
 * function bodies are extracted from Utils.js at load time and executed in a
 * Node vm sandbox (stubbing CacheService where needed).
 *
 * Run with:  node --test tests/sanitizer-idempotency.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UTILS = fs.readFileSync(path.join(__dirname, '..', 'Utils.js'), 'utf8');

/** Extracts a top-level `function name(` block from the Utils.js source. */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, 'function ' + name + ' not found in Utils.js');
  const open = src.indexOf('{', start);
  assert.notStrictEqual(open, -1, 'open brace not found for ' + name);

  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.strictEqual(depth, 0, 'unbalanced braces in ' + name);
  return src.slice(start, i + 1);
}

/* ------------------------------ sanitizeHtml_ ------------------------------ */

/**
 * Loads sanitizeHtml_ plus its const dependencies (SAFE_RICH_TAGS,
 * SAFE_STYLE_PROPS, safeLinkScheme_) into a fresh sandbox and returns the
 * function. The block is sliced from the sanitizer section header to the
 * following "JSON Helpers" section comment.
 */
function loadSanitizer() {
  const start = UTILS.indexOf('const SAFE_RICH_TAGS');
  assert.notStrictEqual(start, -1, 'SAFE_RICH_TAGS not found');
  const jh = UTILS.indexOf('* JSON Helpers', start);
  assert.notStrictEqual(jh, -1, 'JSON Helpers section not found');
  const end = UTILS.lastIndexOf('/*', jh);
  assert.ok(end > start, 'sanitizer block boundary invalid');
  const block = UTILS.slice(start, end);

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox, { filename: 'Utils.js (sanitizer block)' });
  assert.strictEqual(typeof sandbox.sanitizeHtml_, 'function', 'sanitizeHtml_ missing');
  return sandbox.sanitizeHtml_;
}

const sanitize = loadSanitizer();

/* ------------------------------ withIdempotency_ ------------------------------ */

/** Builds a tiny in-memory CacheService stub (get/put/remove on a Map). */
function fakeCache() {
  const store = new Map();
  return {
    getScriptCache() {
      return {
        get: (k) => (store.has(k) ? store.get(k) : null),
        put: (k, v) => { store.set(k, v); },
        remove: (k) => { store.delete(k); },
        _store: store,
      };
    },
  };
}

/** Loads withIdempotency_ into a sandbox with the given CacheService stub. */
function loadIdempotency(cacheStub) {
  const src = extractFunction(UTILS, 'withIdempotency_');
  const sandbox = { CacheService: cacheStub, JSON, console };
  vm.createContext(sandbox);
  vm.runInContext(src + '\n;this.withIdempotency_ = withIdempotency_;', sandbox, {
    filename: 'Utils.js (withIdempotency_)',
  });
  return sandbox.withIdempotency_;
}

/* ---------------------------------- Tests ---------------------------------- */

test('sanitize: strips script tags but keeps the text content', () => {
  const out = sanitize('<script>alert(1)</script>Hello');
  assert.ok(!/script/i.test(out), 'no script tag remains');
  assert.ok(out.includes('Hello'), 'plain text content preserved');
});

test('sanitize: blocks javascript: and data: hrefs, keeps the anchor', () => {
  const js = sanitize('<a href="javascript:alert(1)">x</a>');
  assert.ok(!/javascript/i.test(js), 'javascript: scheme removed');
  assert.ok(js.includes('href="#"'), 'unsafe href rewritten to #');

  const data = sanitize('<a href="data:text/html;base64,x">d</a>');
  assert.ok(!/data:/i.test(data), 'data: scheme removed');
  assert.ok(data.includes('href="#"'), 'data: href rewritten to #');
});

test('sanitize: strips event handlers including the no-space variant', () => {
  const spaced = sanitize('<a href="https://ok.com" onclick="bad()">link</a>');
  assert.ok(!/onclick/i.test(spaced), 'spaced onclick removed');
  assert.ok(spaced.includes('href="https://ok.com"'), 'safe href kept');

  // No whitespace before the handler — the previously exploitable case.
  const tight = sanitize('<a href="https://ok.com"onclick="evil()">x</a>');
  assert.ok(!/onclick/i.test(tight), 'no-space onclick removed');
  assert.ok(tight.includes('href="https://ok.com"'), 'href kept for tight attack');

  const tightMulti = sanitize('<a href="#"onerror="alert(1)"onload="bad()">x</a>');
  assert.ok(!/onerror/i.test(tightMulti), 'no-space onerror removed');
  assert.ok(!/onload/i.test(tightMulti), 'no-space onload removed');
});

test('sanitize: strips event handlers on non-anchor allowed tags', () => {
  const out = sanitize('<strong onmouseover="evil()">b</strong>');
  assert.ok(!/onmouseover/i.test(out), 'onmouseover removed');
  assert.ok(/<strong>/i.test(out), 'strong tag retained');
});

test('sanitize: drops dangerous elements (iframe, img, svg, div)', () => {
  assert.strictEqual(sanitize('<iframe src="https://evil.com"></iframe>'), '');
  assert.strictEqual(sanitize('<img src="x" onerror="alert(1)">'), '');
  assert.strictEqual(sanitize('<svg onload="alert(1)"></svg>'), '');
  const div = sanitize('<div onmouseover="evil()">t</div>');
  assert.ok(!/<div/i.test(div), 'div tag stripped');
  assert.ok(div.includes('t'), 'div text preserved');
});

test('sanitize: allow-lists safe tags and adds rel=noopener to links', () => {
  const strong = sanitize('<strong>bold</strong>');
  assert.strictEqual(strong, '<strong>bold</strong>');

  const link = sanitize('<a href="https://ok.com">link</a>');
  assert.ok(/rel="noopener noreferrer"/.test(link), 'rel added to links');
  assert.ok(!/target="_blank"/.test(link), 'target not injected');

  const b = sanitize('plain <b>bold</b> text');
  assert.ok(!/<b\b/i.test(b), 'b tag stripped (not allow-listed)');
  assert.ok(b.includes('bold'), 'b text preserved');
});

test('sanitize: does not mangle words containing "on"', () => {
  const out = sanitize('<span>condition=ok</span>');
  assert.ok(out.includes('condition=ok'), 'condition=ok survives intact');
});

test('idempotency: second call with the same key replays the stored result', () => {
  const cache = fakeCache();
  const withIdem = loadIdempotency(cache);
  let executions = 0;
  const fn = () => { executions++; return { value: 42 }; };

  const first = withIdem('k1', 300, fn);
  assert.strictEqual(first.idempotent, false);
  assert.deepStrictEqual(first.result, { value: 42 });
  assert.strictEqual(executions, 1, 'fn ran once for the first call');

  const second = withIdem('k1', 300, fn);
  assert.strictEqual(second.idempotent, true, 'second call is a replay');
  assert.deepStrictEqual(second.result, { value: 42 });
  assert.strictEqual(executions, 1, 'fn did NOT re-run for the duplicate key');
});

test('idempotency: distinct keys each execute once', () => {
  const cache = fakeCache();
  const withIdem = loadIdempotency(cache);
  let executions = 0;
  const fn = () => { executions++; return { n: executions }; };

  withIdem('a', 300, fn);
  withIdem('b', 300, fn);
  withIdem('a', 300, fn);
  assert.strictEqual(executions, 2, 'two distinct keys, one execution each');
});

test('idempotency: shouldCache=false prevents storing the result', () => {
  const cache = fakeCache();
  const withIdem = loadIdempotency(cache);
  let executions = 0;
  const fn = () => { executions++; return { transient: true }; };
  const shouldCache = (r) => !!r && r.transient !== true;

  withIdem('k2', 300, fn, shouldCache);
  withIdem('k2', 300, fn, shouldCache);
  assert.strictEqual(executions, 2, 'non-cacheable results are not replayed');
});

test('idempotency: a conflict result can be excluded from caching', () => {
  const cache = fakeCache();
  const withIdem = loadIdempotency(cache);
  let executions = 0;
  // Mirrors updateTaskField: only successful mutations are cached.
  const fn = () => {
    executions++;
    return executions === 1
      ? { success: false, conflict: { latestTask: {} } }
      : { success: true, task: { id: 'T' } };
  };
  const shouldCache = (r) => !!r && r.success === true;

  const first = withIdem('task:x', 300, fn, shouldCache);
  assert.strictEqual(first.result.success, false, 'first call returned a conflict');
  const second = withIdem('task:x', 300, fn, shouldCache);
  assert.strictEqual(second.result.success, true, 'retry was not replayed as the conflict');
  assert.strictEqual(executions, 2, 'conflicts are transient and not cached');
});
