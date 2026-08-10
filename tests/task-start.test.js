/**
 * Unit tests for the Start-task optimistic logic (startTask).
 *
 * startTask lives in the synced core and is extracted from docs/app.js (the
 * deployed PWA client, kept in sync with script.html) at load time, then run
 * inside a Node vm sandbox with stubbed DOM + ApiService — same harness as
 * tests/optimistic-rollback.test.js.
 *
 * Run with:  node --test tests/task-start.test.js
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

/* ------------------------------ Sandbox helpers ------------------------------ */

function parseBadge(html) {
  const m = html.match(/<span class="([^"]*)">([^<]*)<\/span>/);
  return m ? { textContent: m[2], className: m[1] } : { textContent: '', className: '' };
}

function parseButtons(html) {
  return Array.from(html.matchAll(/<button([^>]*)>/g)).map((m) => ({ disabled: /disabled/.test(m[1]) }));
}

function makeRow(initialHtml) {
  const badge = parseBadge(initialHtml);
  const buttons = parseButtons(initialHtml);
  return {
    _innerHTML: initialHtml,
    classList: { _set: new Set(), add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); }, contains(c) { return this._set.has(c); } },
    querySelector(sel) { return sel === '.badge' ? badge : null; },
    querySelectorAll(sel) { return sel === 'button' ? buttons : []; },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; },
    _badge: badge,
    _buttons: buttons,
  };
}

function runStart({ row, api, appStateTasks, handleServerFailure }) {
  const calls = { toasts: [], renderTasks: 0, serverFailures: 0 };

  const sandbox = {
    console,
    document: {
      querySelector(sel) {
        assert.strictEqual(sel, 'tr[data-task-id="42"]', 'querySelector called with unescaped id');
        return row;
      },
    },
    ApiService: api,
    appState: { tasks: appStateTasks || [] },
    newClientId_: function () { return 'test-idempotency-key'; },
    showToast(msg, type) { calls.toasts.push({ msg, type }); },
    handleServerFailure(err) {
      calls.serverFailures++;
      return handleServerFailure ? handleServerFailure(err) : false;
    },
    renderTasks() { calls.renderTasks++; },
    Date: Date,
    setTimeout,
  };

  const fnSrc = extractFunction(APP_JS, 'startTask') +
    '\n;startTask(42);';
  vm.runInNewContext(fnSrc, sandbox, { filename: 'docs/app.js (startTask)' });

  return { calls, row };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/* --------------------------------- Tests --------------------------------- */

test('start applies optimistic IN_PROGRESS before network resolves', () => {
  const row = makeRow('<span class="badge badge-danger">OPEN</span><button>Start</button><button>Complete</button>');
  const api = { updateTaskField: () => new Promise(() => {}) };
  const { row: r } = runStart({ row, api, appStateTasks: [] });

  assert.strictEqual(r._badge.textContent, 'IN_PROGRESS');
  assert.strictEqual(r._badge.className, 'badge badge-warning');
  assert.ok(r.classList.contains('task-pending'), 'row is pending while in flight');
  assert.ok(r._buttons.every(b => b.disabled === true), 'buttons disabled while in flight');
});

test('start success commits: clears pending, updates appState, toasts', async () => {
  const row = makeRow('<span class="badge badge-danger">OPEN</span><button>Start</button>');
  const d = deferred();
  const task = { id: 42, status: 'OPEN', rowVersion: 1 };
  const { calls } = runStart({
    row,
    api: { updateTaskField: () => d.promise },
    appStateTasks: [task],
  });

  d.resolve({ success: true, task: { rowVersion: 2 } });
  await d.promise;

  assert.strictEqual(task.status, 'IN_PROGRESS');
  assert.strictEqual(task.rowVersion, 2, 'rowVersion updated from server response');
  assert.ok(!row.classList.contains('task-pending'), 'pending removed on success');
  assert.ok(row._buttons.every(b => b.disabled === false), 'buttons re-enabled on success');
  assert.deepStrictEqual(calls.toasts, [{ msg: 'Task started.', type: 'success' }]);
});

test('start failure rolls back: snapshot restored, buttons re-enabled, error toast', async () => {
  const initialHtml = '<span class="badge badge-danger">OPEN</span><button data-act="a">Start</button>';
  const row = makeRow(initialHtml);
  const d = deferred();
  const { calls } = runStart({
    row,
    api: { updateTaskField: () => d.promise },
    appStateTasks: [],
  });

  d.reject(new Error('boom'));
  await assert.rejects(d.promise);

  assert.strictEqual(row.innerHTML, initialHtml, 'row DOM restored to snapshot');
  assert.ok(!row.classList.contains('task-pending'), 'pending cleared on rollback');
  assert.deepStrictEqual(calls.toasts, [{ msg: 'Could not start task: boom', type: 'error' }]);
});

test('start conflict restores the snapshot DOM and re-renders', async () => {
  const initialHtml = '<span class="badge badge-danger">OPEN</span><button>Start</button>';
  const row = makeRow(initialHtml);
  const d = deferred();
  const { calls } = runStart({
    row,
    api: { updateTaskField: () => d.promise },
    appStateTasks: [],
  });

  d.resolve({ success: false, conflict: { expectedVersion: 1, actualVersion: 3 } });
  await d.promise;

  // In the real DOM the snapshot restore replaces the row's children entirely
  // (the pre-optimistic badge/buttons come back verbatim), so the observable
  // contract is the restored innerHTML, not the stale badge reference.
  assert.strictEqual(row.innerHTML, initialHtml, 'row DOM restored to snapshot');
  assert.ok(!row.classList.contains('task-pending'), 'pending cleared on conflict');
  assert.strictEqual(calls.renderTasks, 1, 'full re-render on conflict');
  assert.deepStrictEqual(calls.toasts, [{ msg: 'This task changed elsewhere. Reloading…', type: 'warning' }]);
});
