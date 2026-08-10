/**
 * Regression tests for the cross-execution Users-sheet row cache added to
 * Auth.js (readUserRecords_). The cache must:
 *   - round-trip Date cells losslessly through CacheService (JSON stores only
 *     strings, so a naive stringify would silently turn Date cells into ISO
 *     strings and change the Users-table display format),
 *   - be invalidated on user writes so admin edits surface on the next read,
 *   - stay a no-op when the underlying sheet has no rows.
 *
 * The helpers are extracted from Auth.js and run in a vm sandbox with a stubbed
 * CacheService (same harness as tests/admin-session-kill.test.js).
 *
 * Run with:  node --test tests/users-cache.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const AUTH = fs.readFileSync(path.join(ROOT, 'Auth.js'), 'utf8');

/** Extracts a top-level `function name(` block from a source string. */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, 'function ' + name + ' not found');
  const open = src.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(start, i + 1);
}

/** Fake CacheService with a localStorage-like backing store. */
function makeCache() {
  const store = {};
  return {
    _store: store,
    put(key, value, ttl) { store[key] = String(value); },
    get(key) { return store[key] !== undefined ? store[key] : null; },
    remove(key) { delete store[key]; },
  };
}

/** Loads the cache helpers + readUserRecords_ together so the module vars
 *  (__usersRowsCache__, cache keys) are shared, mirroring the real file. */
function loadCacheHarness(cache, sheetRows, userSheet) {
  const sandbox = {
    console,
    USER_SHEET_HEADERS: ['EMAIL', 'ROLE', 'SALT', 'PASSWORD_HASH', 'MUST_CHANGE', 'CREATED_BY', 'CREATED_AT', 'RESET_TOKEN', 'RESET_EXPIRES', 'GROUP', 'DEPARTMENT', 'OFFICE', 'PREFERENCES', 'RESET_REQUESTED', 'USERNAME', 'ID'],
    CacheService: { getScriptCache: () => cache },
    usersSheet_: () => (userSheet === null ? null : { getLastRow: () => 1 + (sheetRows ? sheetRows.length : 0), getRange: () => ({ getValues: () => sheetRows || [] }) }),
  };
  vm.createContext(sandbox);
  // Module-level declarations referenced by the extracted functions.
  vm.runInContext('var __usersRowsCache__ = null;', sandbox);
  vm.runInContext('var USERS_ROWS_CACHE_KEY = \'dashv1:usersrows:v1\';', sandbox);
  vm.runInContext('var USERS_ROWS_CACHE_TTL = 15;', sandbox);
  for (const name of ['__usersRowsReviver_', 'getCachedUserRows_', 'putCachedUserRows_', 'invalidateUsersCache_', 'readUserRecords_']) {
    vm.runInContext(extractFunction(AUTH, name), sandbox, { filename: name });
  }
  return sandbox;
}

test('users rows cache round-trips Date cells losslessly', () => {
  const cache = makeCache();
  const createdAt = new Date(2026, 7, 10, 12, 30, 0); // 2026-08-10 12:30 local
  const rows = [['alice@example.com', 'ADMIN', 'salt', 'hash', false, 'bob@example.com', createdAt, '', null, '', '', '', '', null, 'alice', 'u1']];
  const sb = loadCacheHarness(cache, rows, {});

  const first = sb.readUserRecords_();
  assert.strictEqual(first, rows, 'fresh read returns the sheet rows');
  assert.ok(cache._store['dashv1:usersrows:v1'], 'rows written to CacheService');

  // A second call must hit the in-memory memo; simulate a fresh execution by
  // clearing the memo and reading from the cache store only.
  sb.__usersRowsCache__ = null;
  const second = sb.readUserRecords_();
  assert.ok(Array.isArray(second), 'cached read returns an array');
  assert.strictEqual(second[0][0], 'alice@example.com');
  const roundTripped = second[0][6];
  // Realm-safe Date check (the sandbox Date is a different realm than the
  // test's Date, so `instanceof` is unreliable across the vm boundary).
  assert.strictEqual(
    Object.prototype.toString.call(roundTripped),
    '[object Date]',
    'Date cell restored as a Date, not a string'
  );
  assert.strictEqual(roundTripped.getTime(), createdAt.getTime(), 'Date value preserved exactly');
});

test('invalidateUsersCache_ drops the memo and the cache entry', () => {
  const cache = makeCache();
  const rows = [['alice@example.com', 'VIEWER', 's', 'h', false, '', new Date(), '', null, '', '', '', '', null, '', 'u1']];
  const sb = loadCacheHarness(cache, rows, {});

  sb.readUserRecords_();
  assert.ok(sb.__usersRowsCache__, 'memo populated');
  assert.ok(cache._store['dashv1:usersrows:v1'], 'cache populated');

  sb.invalidateUsersCache_();
  assert.strictEqual(sb.__usersRowsCache__, null, 'memo cleared');
  assert.ok(!cache._store['dashv1:usersrows:v1'], 'CacheService entry removed');
});

test('readUserRecords_ tolerates a missing users sheet', () => {
  const cache = makeCache();
  const sb = loadCacheHarness(cache, null, null);
  const got = sb.readUserRecords_();
  // Realm-safe empty check (deepStrictEqual compares prototypes across realms).
  assert.ok(Array.isArray(got), 'empty array for missing sheet');
  assert.strictEqual(got.length, 0, 'empty array for missing sheet');
  assert.ok(!cache._store['dashv1:usersrows:v1'], 'nothing cached for an empty sheet');
});

test('cached rows are not returned when the cache entry is corrupt', () => {
  const cache = makeCache();
  const rows = [['alice@example.com', 'ADMIN', 's', 'h', false, '', new Date(), '', null, '', '', '', '', null, '', 'u1']];
  const sb = loadCacheHarness(cache, rows, {});
  cache._store['dashv1:usersrows:v1'] = '{not valid json';
  sb.__usersRowsCache__ = null;
  const got = sb.readUserRecords_();
  assert.strictEqual(got, rows, 'falls back to the sheet read on corrupt cache');
});
