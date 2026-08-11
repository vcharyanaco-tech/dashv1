/**
 * Unit tests for the renderTasks force flag.
 *
 * renderTasks caches the tasks list for 30s so tab switches paint instantly
 * and refresh in the background. After a create/update/delete/complete
 * mutation the callers pass force=true so the freshly saved change is fetched
 * immediately instead of waiting for the background refresh.
 *
 * The function lives in docs/app.js (the deployed PWA client), which is kept
 * in sync with script.html (the GAS client). To test the actual shipped code
 * rather than a re-typed copy, we extract the function body from
 * docs/app.js at load time and run it inside a Node vm sandbox.
 *
 * Run with:  node --test tests/render-tasks-force.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');

/** Extracts a top-level `function name(` block from the app.js source. */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, 'function ' + name + ' not found in docs/app.js');
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

/**
 * Builds the vm sandbox and calls renderTasks with the given state.
 * @param {Object} opts
 * @param {Array}  opts.tasks Cached appState.tasks (may be null/undefined).
 * @param {number} opts.tasksLoadedAt Timestamp of the last successful load.
 * @param {boolean} [opts.force] Passed to renderTasks.
 * @param {string} [opts.filterKey] appState.tasksFilterKey (default '{}').
 * @returns {{overlays:number, listRenders:number, fetches:Array}} recorded calls.
 */
function runRenderTasks({ tasks, tasksLoadedAt, force, filterKey }) {
  const calls = { overlays: 0, listRenders: 0, fetches: [] };

  const sandbox = {
    console,
    getEl() { return null; }, // no status/priority filters active -> filters {}
    appState: {
      tasks: tasks === undefined ? null : tasks,
      tasksLoadedAt: tasksLoadedAt === undefined ? null : tasksLoadedAt,
      tasksFilterKey: filterKey === undefined ? '{}' : filterKey,
    },
    renderTaskList() { calls.listRenders++; },
    fetchTasks_(filters, silent) { calls.fetches.push({ filters, silent }); },
    showOverlay() { calls.overlays++; },
    hideOverlay() {},
    TASKS_CACHE_TTL_MS: 30000,
    Date: Date,
    JSON: JSON,
    Array: Array,
  };

  const fnSrc = extractFunction(APP_JS, 'renderTasks') +
    '\n;renderTasks(' + (force ? 'true' : '') + ');';
  vm.runInNewContext(fnSrc, sandbox, { filename: 'docs/app.js (renderTasks)' });

  return calls;
}

/* ---------------------------------- Tests ---------------------------------- */

test('fresh cache paints instantly and refreshes silently in the background', () => {
  const calls = runRenderTasks({ tasks: [], tasksLoadedAt: Date.now() });

  assert.strictEqual(calls.listRenders, 1, 'cached list rendered immediately');
  assert.strictEqual(calls.overlays, 0, 'no overlay for a fresh cache');
  assert.strictEqual(calls.fetches.length, 1, 'background refresh fired');
  assert.strictEqual(calls.fetches[0].silent, true, 'background refresh is silent');
});

test('force=true bypasses the fresh cache and fetches immediately', () => {
  const calls = runRenderTasks({ tasks: [], tasksLoadedAt: Date.now(), force: true });

  assert.strictEqual(calls.overlays, 1, 'overlay shown for a forced fetch');
  assert.strictEqual(calls.fetches.length, 1, 'forced fetch fired');
  assert.strictEqual(calls.fetches[0].silent, false, 'forced fetch is not silent');
  assert.strictEqual(calls.listRenders, 0, 'stale list not painted over the overlay');
});

test('stale cache still fetches with an overlay when not forced', () => {
  const calls = runRenderTasks({ tasks: [], tasksLoadedAt: 0 });

  assert.strictEqual(calls.overlays, 1, 'overlay shown for a stale cache');
  assert.strictEqual(calls.fetches[0].silent, false, 'stale fetch is not silent');
});

test('no cached tasks (first load) fetches with an overlay', () => {
  const calls = runRenderTasks({ tasks: null, tasksLoadedAt: null });

  assert.strictEqual(calls.overlays, 1, 'overlay shown when nothing is cached');
  assert.strictEqual(calls.fetches[0].silent, false);
});

test('changed filters skip the cache even when recent', () => {
  const calls = runRenderTasks({
    tasks: [],
    tasksLoadedAt: Date.now(),
    filterKey: '{"status":"OPEN"}',
  });

  assert.strictEqual(calls.overlays, 1, 'filter change is never served from cache');
  assert.strictEqual(calls.fetches[0].silent, false);
});

test('invalidateTasksCache_ clears the cache so the next render fetches fresh', () => {
  const sandbox = {
    console,
    appState: { tasks: [{ id: 1 }], tasksLoadedAt: Date.now(), tasksFilterKey: '{}' },
  };
  const fnSrc = extractFunction(APP_JS, 'invalidateTasksCache_') +
    '\n;invalidateTasksCache_();';
  vm.runInNewContext(fnSrc, sandbox, { filename: 'docs/app.js (invalidateTasksCache_)' });

  assert.strictEqual(sandbox.appState.tasks, null, 'tasks list dropped');
  assert.strictEqual(sandbox.appState.tasksLoadedAt, 0, 'freshness timestamp cleared');
  assert.strictEqual(sandbox.appState.tasksFilterKey, null, 'filter key cleared');
});

test('a cache invalidated by a quick-add is never served fresh again', () => {
  const calls = runRenderTasks({
    tasks: [{ id: 1 }],
    tasksLoadedAt: 0, // what invalidateTasksCache_ leaves behind
    filterKey: '{}',
  });

  assert.strictEqual(calls.overlays, 1, 'invalidated cache always refetches');
  assert.strictEqual(calls.fetches[0].silent, false);
});
