/**
 * Regression test for the task status state machine (Tasks.js).
 *
 * The server's isValidTaskStatusTransition_ enforces a transition allow-list.
 * Live testing exposed that the UI's Complete button sends status: DONE
 * directly from OPEN (there is no UI to set IN_PROGRESS), which the server
 * rejected. Fix: OPEN -> DONE is now allowed.
 *
 * These are source-level contract tests: they load the shipped Tasks.js
 * function in a vm sandbox, so a future edit to the allow-list is caught here.
 *
 * Run with:  node --test tests/task-status-transition.test.js
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

/** Evaluates a single function body in a fresh sandbox and returns it. */
function loadFunction(src, name) {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(src, name), sandbox, { filename: name });
  return sandbox[name];
}

const isValidTaskStatusTransition_ = loadFunction(TASKS, 'isValidTaskStatusTransition_');

test('OPEN -> DONE is allowed (Complete button on a new task)', () => {
  assert.strictEqual(
    isValidTaskStatusTransition_('OPEN', 'DONE'),
    true,
    'Completing a newly created task must be allowed'
  );
});

test('existing valid transitions remain allowed', () => {
  // The normal workflow the UI and API rely on.
  assert.strictEqual(isValidTaskStatusTransition_('OPEN', 'IN_PROGRESS'), true);
  assert.strictEqual(isValidTaskStatusTransition_('IN_PROGRESS', 'DONE'), true);
  assert.strictEqual(isValidTaskStatusTransition_('IN_PROGRESS', 'CANCELLED'), true);
  assert.strictEqual(isValidTaskStatusTransition_('DONE', 'OPEN'), true);
  assert.strictEqual(isValidTaskStatusTransition_('CANCELLED', 'OPEN'), true);
  // No-op self-transitions that callers may issue on refresh.
  assert.strictEqual(isValidTaskStatusTransition_('OPEN', 'OPEN'), true);
});

test('invalid transitions remain rejected', () => {
  assert.strictEqual(isValidTaskStatusTransition_('DONE', 'IN_PROGRESS'), false);
  assert.strictEqual(isValidTaskStatusTransition_('DONE', 'CANCELLED'), false);
  assert.strictEqual(isValidTaskStatusTransition_('DONE', 'DONE'), false);
  assert.strictEqual(isValidTaskStatusTransition_('CANCELLED', 'DONE'), false);
});

test('unknown statuses are rejected, not silently accepted', () => {
  // Unknown from/to statuses fall off the allow-list; the guard is falsy.
  assert.ok(!isValidTaskStatusTransition_('OPEN', 'SHIPPED'), 'unknown target rejected');
  assert.ok(!isValidTaskStatusTransition_('SOMETHING', 'DONE'), 'unknown source rejected');
  assert.ok(!isValidTaskStatusTransition_('', 'DONE'), 'empty source rejected');
  assert.ok(!isValidTaskStatusTransition_(null, 'DONE'), 'null source rejected');
});
