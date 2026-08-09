/**
 * Unit tests for the Optimistic UI rollback logic (completeTaskOptimistic).
 *
 * The function lives inside app.js / docs/app.js / script.html (three
 * in-sync copies). To test the actual shipped code rather than a re-typed
 * copy, we extract the function body from app.js (the master copy) at load
 * time and run it inside a Node vm sandbox with stubbed DOM + ApiService.
 *
 * Run with:  node --test tests/optimistic-rollback.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

/** Extracts a top-level `function name(` block from the app.js source. */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, 'function ' + name + ' not found in app.js');
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

/* ---------------------------------- Sandbox helpers ---------------------------------- */

/** Parses "<span class="...">TEXT</span>" and "<button...>" out of a row's
 *  HTML so the fake row's live nodes track innerHTML restores like the real
 *  DOM does (badge text/class and button set are derived from the markup). */
function parseBadge(html) {
  const m = html.match(/<span class="([^"]*)">([^<]*)<\/span>/);
  return m ? { textContent: m[2], className: m[1] } : { textContent: '', className: '' };
}

function parseButtons(html) {
  return Array.from(html.matchAll(/<button([^>]*)>/g)).map((m) => ({ disabled: /disabled/.test(m[1]) }));
}

/** Minimal fake DOM row: exposes the parts completeTaskOptimistic touches. */
function makeRow(initialHtml) {
  const badge = parseBadge(initialHtml);
  const buttons = parseButtons(initialHtml);
  const row = {
    _innerHTML: initialHtml,
    classList: { _set: new Set(), add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); }, contains(c) { return this._set.has(c); } },
    querySelector(sel) { return sel === '.badge' ? badge : null; },
    querySelectorAll(sel) { return sel === 'button' ? buttons : []; },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; },
    _badge: badge,
    _buttons: buttons,
  };
  return row;
}

/**
 * Builds the vm sandbox and calls completeTaskOptimistic.
 * @param {Object} opts
 * @param {Object} opts.row Fake row (from makeRow).
 * @param {Object} opts.api updateTask stub returning a promise.
 * @param {Array} opts.appStateTasks appState.tasks array.
 * @param {Function} [opts.handleServerFailure]
 * @returns {Promise} the result of completeTaskOptimistic (a promise chain).
 */
function runOptimistic({ row, api, appStateTasks, handleServerFailure }) {
  const calls = { toasts: [], renderTasks: 0, serverFailures: 0 };

  const sandbox = {
    console,
    document: {
      querySelector(sel) {
        assert.strictEqual(
          sel,
          'tr[data-task-id="' + '42' + '"]',
          'querySelector called with unescaped id'
        );
        return row;
      },
    },
    ApiService: api,
    appState: { tasks: appStateTasks || [] },
    showToast(msg, type) { calls.toasts.push({ msg, type }); },
    handleServerFailure(err) {
      calls.serverFailures++;
      return handleServerFailure ? handleServerFailure(err) : false;
    },
    renderTasks() { calls.renderTasks++; },
    Date: Date,
    setTimeout,
  };

  const fnSrc = extractFunction(APP_JS, 'completeTaskOptimistic') +
    '\n;completeTaskOptimistic(42);';
  vm.runInNewContext(fnSrc, sandbox, { filename: 'app.js (completeTaskOptimistic)' });

  return { calls, row };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/* ---------------------------------- Tests ---------------------------------- */

test('optimistic state applied synchronously before network resolves', () => {
  const row = makeRow('<span class="badge badge-warning">OPEN</span><button>Done</button>');
  const api = { updateTask: () => new Promise(() => {}) };
  const { row: r } = runOptimistic({ row, api, appStateTasks: [] });

  assert.strictEqual(r._badge.textContent, 'DONE');
  assert.strictEqual(r._badge.className, 'badge badge-success');
  assert.ok(r.classList.contains('task-pending'), 'row is pending while in flight');
  assert.ok(r._buttons.every(b => b.disabled === true), 'buttons disabled while in flight');
});

test('success commits: clears pending, re-enables buttons, updates appState, toasts', async () => {
  const row = makeRow('<span class="badge badge-warning">OPEN</span><button>Done</button>');
  const d = deferred();
  const task = { id: 42, status: 'OPEN' };
  const { calls } = runOptimistic({
    row,
    api: { updateTask: () => d.promise },
    appStateTasks: [task],
  });

  d.resolve({ success: true });
  await d.promise;

  assert.strictEqual(task.status, 'DONE');
  assert.ok(task.completedAt, 'completedAt set on success');
  assert.ok(!row.classList.contains('task-pending'), 'pending removed on success');
  assert.ok(row._buttons.every(b => b.disabled === false), 'buttons re-enabled on success');
  assert.deepStrictEqual(calls.toasts, [{ msg: 'Task marked complete.', type: 'success' }]);
});

test('failure rolls back: snapshot restored, buttons re-enabled, pending cleared, error toast', async () => {
  const initialHtml = '<span class="badge badge-warning">OPEN</span><button data-act="a">Done</button>';
  const row = makeRow(initialHtml);
  const d = deferred();
  const { calls } = runOptimistic({
    row,
    api: { updateTask: () => d.promise },
    appStateTasks: [],
  });

  d.reject(new Error('boom'));
  await assert.rejects(d.promise);

  assert.strictEqual(row.innerHTML, initialHtml, 'row DOM restored to snapshot');
  assert.ok(!row.classList.contains('task-pending'), 'pending cleared on rollback');
  assert.deepStrictEqual(
    calls.toasts,
    [{ msg: 'Could not update task: boom', type: 'error' }]
  );
});

test('rollback preserves original badge text and re-enables buttons from snapshot', async () => {
  const initialHtml = '<span class="badge badge-warning">REVIEW</span><button disabled="disabled">x</button>';
  const row = makeRow(initialHtml);
  const d = deferred();
  const { row: r } = runOptimistic({
    row,
    api: { updateTask: () => d.promise },
    appStateTasks: [],
  });

  d.reject(new Error('nope'));
  await assert.rejects(d.promise);

  assert.strictEqual(r.innerHTML, initialHtml, 'exact prior DOM restored');
  assert.strictEqual(r._badge.textContent, 'REVIEW');
});

test('server failure helper suppresses the error toast when it returns true', async () => {
  const row = makeRow('<span class="badge badge-warning">OPEN</span><button>Done</button>');
  const d = deferred();
  const { calls } = runOptimistic({
    row,
    api: { updateTask: () => d.promise },
    appStateTasks: [],
    handleServerFailure: () => true,
  });

  d.reject(new Error('auth expired'));
  await assert.rejects(d.promise);

  assert.strictEqual(calls.serverFailures, 1, 'handleServerFailure invoked');
  assert.deepStrictEqual(calls.toasts, [], 'no toast when server failure handled');
});

test('missing row falls back to a full re-render', () => {
  let renders = 0;
  const sandbox = {
    console,
    document: { querySelector: () => null },
    ApiService: { updateTask: () => new Promise(() => {}) },
    appState: { tasks: [] },
    showToast() {},
    handleServerFailure() { return false; },
    renderTasks() { renders++; },
  };
  const fnSrc = extractFunction(APP_JS, 'completeTaskOptimistic') +
    '\n;completeTaskOptimistic(7);';
  vm.runInNewContext(fnSrc, sandbox, { filename: 'app.js (completeTaskOptimistic)' });
  assert.strictEqual(renders, 1, 'renderTasks called for missing row');
});

test('task id is escaped before being interpolated into the selector', async () => {
  const tricky = '12"3\\4';
  const row = makeRow('<span class="badge">OPEN</span><button>Done</button>');
  let selectorSeen = '';
  const d = deferred();

  const sandbox = {
    console,
    document: {
      querySelector(sel) {
        selectorSeen = sel;
        return row;
      },
    },
    ApiService: { updateTask: () => d.promise },
    appState: { tasks: [] },
    showToast() {},
    handleServerFailure() { return false; },
    renderTasks() {},
  };
  const fnSrc = extractFunction(APP_JS, 'completeTaskOptimistic') +
    '\n;completeTaskOptimistic(' + JSON.stringify(tricky) + ');';
  vm.runInNewContext(fnSrc, sandbox, { filename: 'app.js (completeTaskOptimistic)' });

  // The escaping turns the hostile " and \ into \" and \\ so the attribute
  // value can never close the selector early. Assert the exact escaped form:
  // id `12"3\4` must become the CSS-safe value `12\"3\\4`.
  assert.strictEqual(
    selectorSeen,
    'tr[data-task-id="12\\"3\\\\4"]',
    'hostile id must be CSS-escaped in the selector'
  );
});

test('id with a numeric id resolves via loose equality on appState', async () => {
  const row = makeRow('<span class="badge badge-warning">OPEN</span><button>Done</button>');
  const d = deferred();
  const task = { id: 42, status: 'OPEN' };
  const { calls } = runOptimistic({
    row,
    api: { updateTask: () => d.promise },
    appStateTasks: [task],
  });
  d.resolve({});
  await d.promise;

  assert.strictEqual(task.status, 'DONE');
  assert.strictEqual(calls.toasts[0].type, 'success');
});
