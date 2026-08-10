/**
 * Regression tests for the cross-execution Tasks-sheet cache added to
 * Tasks.js (readTasksUnchecked_ / getTasks / getMyTasks). The cache must:
 *   - round-trip parsed task records losslessly through CacheService (they are
 *     already JSON-safe: taskRecordFromRow_ normalizes every date to a millis
 *     number, so a plain stringify/parse is exact — no Date tagging needed),
 *   - be served on cache hit for any filter combination (filters are applied
 *     AFTER the cache read, so one shared entry covers every filter),
 *   - be invalidated on task writes so edits surface on the next read,
 *   - stay a no-op when the sheet is missing or empty.
 *
 * The helpers are extracted from Tasks.js and run in a vm sandbox with a stubbed
 * CacheService (same harness as tests/users-cache.test.js).
 *
 * Run with:  node --test tests/tasks-cache.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const TASKS = fs.readFileSync(path.join(ROOT, 'Tasks.js'), 'utf8');

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

/** A single task sheet row (15 columns, matching TASK_SHEET_HEADERS). */
function taskRow(overrides) {
  const o = overrides || {};
  return [
    o.id !== undefined ? o.id : 't1',
    o.recordRow !== undefined ? o.recordRow : 42,
    o.recordId !== undefined ? o.recordId : 'r1',
    o.title !== undefined ? o.title : 'Review entry',
    o.description !== undefined ? o.description : '',
    o.assignee !== undefined ? o.assignee : 'alice@example.com',
    o.status !== undefined ? o.status : 'OPEN',
    o.priority !== undefined ? o.priority : 'MEDIUM',
    o.dueDate !== undefined ? o.dueDate : new Date(2026, 7, 15, 0, 0, 0),
    'boss@example.com',
    o.createdAt !== undefined ? o.createdAt : new Date(2026, 7, 10, 9, 0, 0),
    new Date(2026, 7, 10, 9, 0, 0),
    null,
    1,
    'boss@example.com',
  ];
}

/** Loads the cache helpers + readTasksUnchecked_ together so the module vars
 *  (__tasksCache__, cache keys) are shared, mirroring the real file. */
function loadCacheHarness(cache, sheetRows, taskSheet) {
  const sandbox = {
    console,
    TASK_SHEET_HEADERS: ['Id', 'RecordRow', 'RecordId', 'Title', 'Description', 'Assignee', 'Status', 'Priority', 'DueDate', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'CompletedAt', 'RowVersion', 'UpdatedBy'],
    TASK_COL: Object.freeze({ ID: 1, RECORD_ROW: 2, RECORD_ID: 3, TITLE: 4, DESCRIPTION: 5, ASSIGNEE: 6, STATUS: 7, PRIORITY: 8, DUE_DATE: 9, CREATED_BY: 10, CREATED_AT: 11, UPDATED_AT: 12, COMPLETED_AT: 13, ROW_VERSION: 14, UPDATED_BY: 15 }),
    TASK_STATUS: Object.freeze({ OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', DONE: 'DONE', CANCELLED: 'CANCELLED' }),
    TASK_PRIORITY: Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT' }),
    CacheService: { getScriptCache: () => cache },
    tasksSheet_: () => (taskSheet === null ? null : { getLastRow: () => 1 + (sheetRows ? sheetRows.length : 0), getRange: () => ({ getValues: () => sheetRows || [] }) }),
    taskRecordFromRow_: (row) => ({
      id: String(row[0] || ''),
      recordRow: Number(row[1]) || 0,
      recordId: String(row[2] || ''),
      title: String(row[3] || ''),
      description: String(row[4] || ''),
      assignee: String(row[5] || '').toLowerCase(),
      status: String(row[6] || 'OPEN'),
      priority: String(row[7] || 'MEDIUM'),
      dueDate: row[8] ? new Date(row[8]).getTime() : 0,
      createdBy: String(row[9] || '').toLowerCase(),
      createdAt: row[10] ? new Date(row[10]).getTime() : 0,
      updatedAt: row[11] ? new Date(row[11]).getTime() : 0,
      completedAt: row[12] ? new Date(row[12]).getTime() : 0,
      updatedBy: String(row[14] || '').toLowerCase(),
      rowVersion: Number(row[13]) || 1,
    }),
  };
  vm.createContext(sandbox);
  // Module-level declarations referenced by the extracted functions.
  vm.runInContext('var __tasksCache__ = null;', sandbox);
  vm.runInContext("var TASKS_CACHE_KEY = 'dashv1:tasks:v1';", sandbox);
  vm.runInContext('var TASKS_CACHE_TTL = 15;', sandbox);
  for (const name of ['getCachedTasks_', 'putCachedTasks_', 'invalidateTasksCache_', 'readTasksUnchecked_']) {
    vm.runInContext(extractFunction(TASKS, name), sandbox, { filename: name });
  }
  return sandbox;
}

test('tasks cache round-trips records losslessly and serves every filter', () => {
  const cache = makeCache();
  const due = new Date(2026, 7, 15, 0, 0, 0);
  const rows = [
    taskRow({ id: 't1', assignee: 'alice@example.com', status: 'OPEN', dueDate: due }),
    taskRow({ id: 't2', assignee: 'bob@example.com', status: 'DONE', dueDate: due }),
  ];
  const sb = loadCacheHarness(cache, rows, {});

  const first = sb.readTasksUnchecked_({});
  assert.ok(Array.isArray(first), 'fresh read returns an array');
  assert.strictEqual(first.length, 2, 'both tasks parsed from the sheet');
  // Order is NOT asserted: the existing sort ranks OPEN as 99 (the `0 || 99`
  // guard turns the OPEN:0 entry into 99), which is pre-existing behavior the
  // cache must preserve byte-for-byte. Assert the id SET instead (realm-safe:
  // Array.from re-creates the array in the test realm before comparison).
  assert.deepStrictEqual(Array.from(first, (t) => t.id).sort(), ['t1', 't2'], 'rows parsed into records');
  assert.ok(cache._store['dashv1:tasks:v1'], 'records written to CacheService');

  // Fresh execution: clear the memo, read only from the cache store.
  sb.__tasksCache__ = null;
  const cached = sb.readTasksUnchecked_({});
  assert.ok(Array.isArray(cached), 'cached read returns an array');
  assert.strictEqual(cached.length, 2, 'both tasks served from cache');
  assert.deepStrictEqual(Array.from(cached, (t) => t.id).sort(), ['t1', 't2']);
  const t1 = Array.from(cached).find((t) => t.id === 't1');
  const t2 = Array.from(cached).find((t) => t.id === 't2');
  assert.strictEqual(t1.dueDate, due.getTime(), 'millis date preserved exactly through JSON');
  assert.strictEqual(t1.createdAt, rows[0][10].getTime(), 'createdAt preserved exactly');

  // Filters apply after the cache read — one shared entry serves all combos.
  const onlyAlice = sb.readTasksUnchecked_({ assignee: 'ALICE@EXAMPLE.COM' });
  assert.strictEqual(onlyAlice.length, 1, 'assignee filter applied to cached records');
  assert.strictEqual(onlyAlice[0].id, 't1');
  const onlyDone = sb.readTasksUnchecked_({ status: 'done' });
  assert.strictEqual(onlyDone.length, 1, 'status filter applied (case-insensitive)');
  assert.strictEqual(onlyDone[0].id, 't2');
  assert.strictEqual(t2.rowVersion, 1, 'numeric fields preserved');
});

test('returned records are copies — caller mutation cannot corrupt the cache', () => {
  const cache = makeCache();
  const rows = [taskRow({ id: 't1' }), taskRow({ id: 't2' })];
  const sb = loadCacheHarness(cache, rows, {});

  const firstRead = sb.readTasksUnchecked_({});
  // Mutate the returned record as a hostile caller might.
  firstRead[0].title = 'MUTATED';
  firstRead[0].status = 'DONE';

  // A second read must serve pristine records from the cache (memo intact).
  const secondRead = sb.readTasksUnchecked_({});
  const t1 = Array.from(secondRead).find((t) => t.id === 't1');
  assert.strictEqual(t1.title, 'Review entry', 'title not corrupted by caller mutation');
  assert.strictEqual(t1.status, 'OPEN', 'status not corrupted by caller mutation');

  // Fresh execution from the serialized cache store: still pristine.
  sb.__tasksCache__ = null;
  const thirdRead = sb.readTasksUnchecked_({});
  const t1c = Array.from(thirdRead).find((t) => t.id === 't1');
  assert.strictEqual(t1c.title, 'Review entry', 'serialized cache entry not corrupted');
});

test('invalidateTasksCache_ drops the memo and the cache entry', () => {
  const cache = makeCache();
  const rows = [taskRow({})];
  const sb = loadCacheHarness(cache, rows, {});

  sb.readTasksUnchecked_({});
  assert.ok(sb.__tasksCache__, 'memo populated');
  assert.ok(cache._store['dashv1:tasks:v1'], 'cache populated');

  sb.invalidateTasksCache_();
  assert.strictEqual(sb.__tasksCache__, null, 'memo cleared');
  assert.ok(!cache._store['dashv1:tasks:v1'], 'CacheService entry removed');
});

test('readTasksUnchecked_ tolerates a missing or empty tasks sheet', () => {
  // Missing sheet → empty array, nothing cached.
  const cache1 = makeCache();
  const sb1 = loadCacheHarness(cache1, null, null);
  const got1 = sb1.readTasksUnchecked_({});
  assert.ok(Array.isArray(got1), 'empty array for missing sheet');
  assert.strictEqual(got1.length, 0);
  assert.ok(!cache1._store['dashv1:tasks:v1'], 'nothing cached for a missing sheet');

  // Empty sheet (only header row) → empty array, nothing cached.
  const cache2 = makeCache();
  const sb2 = loadCacheHarness(cache2, [], {});
  const got2 = sb2.readTasksUnchecked_({});
  assert.ok(Array.isArray(got2), 'empty array for header-only sheet');
  assert.strictEqual(got2.length, 0);
  assert.ok(!cache2._store['dashv1:tasks:v1'], 'nothing cached for an empty sheet');
});

test('cached records are not returned when the cache entry is corrupt', () => {
  const cache = makeCache();
  const rows = [taskRow({})];
  const sb = loadCacheHarness(cache, rows, {});
  cache._store['dashv1:tasks:v1'] = '{not valid json';
  sb.__tasksCache__ = null;
  const got = sb.readTasksUnchecked_({});
  assert.ok(Array.isArray(got), 'falls back to the sheet read on corrupt cache');
  assert.strictEqual(got[0].id, 't1', 'sheet rows parsed on cache miss');
});
