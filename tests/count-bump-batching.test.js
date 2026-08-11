/**
 * Unit tests for the deferred count-generation bump batching in Counts.js.
 *
 * Multi-mutation flows (task create/update with notifications, submission add
 * with per-recipient staff notifications, stable-ID migration) used to bump a
 * count generation after EVERY write or notification — each bump orphaned
 * cached payloads (tasks list, submissions overview) and count tiles. Inside
 * runWithBatchedCountBumps_, invalidateCounts_() only records the family as
 * pending; the wrapper flushes each pending family exactly once on exit
 * (finally — even on throw), and the cached read funnels flush pending first.
 *
 * The helpers live in Counts.js (a GAS server file, not a client). We extract
 * the contiguous machinery region from the real file and run it in a vm
 * sandbox with a stubbed bumpCountGen_ so the bump count is observable.
 *
 * Run with:  node --test tests/count-bump-batching.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const COUNTS_JS = fs.readFileSync(path.join(__dirname, '..', 'Counts.js'), 'utf8');
const TASKS_JS = fs.readFileSync(path.join(__dirname, '..', 'Tasks.js'), 'utf8');
const SUBS_JS = fs.readFileSync(path.join(__dirname, '..', 'Submissions.js'), 'utf8');
const MIGRATION_JS = fs.readFileSync(path.join(__dirname, '..', 'Migration.js'), 'utf8');

/**
 * Extracts the machinery block: the defer state declaration plus
 * COUNT_FAMILY_PROP / bumpCountFamily_ / invalidateCounts_ / flushCountBumps_ /
 * runWithBatchedCountBumps_. Returns the source text.
 */
function extractMachineryBlock(src) {
  const start = src.indexOf('let __countBumpsDeferred__ = false;');
  assert.notStrictEqual(start, -1, 'defer state declaration not found in Counts.js');

  const fnMark = 'function runWithBatchedCountBumps_(fn) {';
  const fnStart = src.indexOf(fnMark);
  assert.notStrictEqual(fnStart, -1, 'runWithBatchedCountBumps_ not found in Counts.js');

  const open = fnStart + fnMark.length - 1; // the '{' of runWithBatchedCountBumps_
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.strictEqual(depth, 0, 'unbalanced braces in machinery block');
  return src.slice(start, i + 1);
}

/** Builds a fresh sandbox whose bumpCountGen_ counts every call per prop. */
function makeSandbox() {
  const state = { bumps: {} };
  const sandbox = {
    console,
    COUNT_GEN_PROP: Object.freeze({
      RECORDS: 'dashv1:countGen:records',
      TASKS: 'dashv1:countGen:tasks',
      NOTIF: 'dashv1:countGen:notif',
      SUBMISSIONS: 'dashv1:countGen:submissions'
    }),
    bumpCountGen_: function (prop) {
      state.bumps[prop] = (state.bumps[prop] || 0) + 1;
    }
  };
  const src = extractMachineryBlock(COUNTS_JS);
  vm.runInNewContext(src, sandbox, { filename: 'Counts.js (count bump batching)' });
  return { sandbox, state };
}

const T = 'dashv1:countGen:tasks';
const N = 'dashv1:countGen:notif';
const S = 'dashv1:countGen:submissions';
const R = 'dashv1:countGen:records';

function bumpCount(state, prop) {
  return state.bumps[prop] || 0;
}

test('invalidateCounts_ bumps immediately outside a deferred flow', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.invalidateCounts_('tasks');
  sandbox.invalidateCounts_('notif');
  sandbox.invalidateCounts_('submissions');
  sandbox.invalidateCounts_('records');
  assert.strictEqual(bumpCount(state, T), 1);
  assert.strictEqual(bumpCount(state, N), 1);
  assert.strictEqual(bumpCount(state, S), 1);
  assert.strictEqual(bumpCount(state, R), 1);
});

test('unknown family is a silent no-op', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.invalidateCounts_('nope');
  assert.strictEqual(Object.keys(state.bumps).length, 0);
});

test('N mutations inside a wrapper collapse to one bump per family', () => {
  const { sandbox, state } = makeSandbox();
  const out = sandbox.runWithBatchedCountBumps_(function () {
    sandbox.invalidateCounts_('tasks');
    sandbox.invalidateCounts_('tasks');
    sandbox.invalidateCounts_('tasks');
    sandbox.invalidateCounts_('notif');
    sandbox.invalidateCounts_('notif');
    sandbox.invalidateCounts_('notif');
    sandbox.invalidateCounts_('notif');
    sandbox.invalidateCounts_('notif');
    sandbox.invalidateCounts_('submissions');
    sandbox.invalidateCounts_('submissions');
    return 'done';
  });
  assert.strictEqual(out, 'done');
  assert.strictEqual(bumpCount(state, T), 1, 'tasks bumped exactly once');
  assert.strictEqual(bumpCount(state, N), 1, 'notif bumped exactly once');
  assert.strictEqual(bumpCount(state, S), 1, 'submissions bumped exactly once');
  // Deferral restored: a fresh invalidate outside the wrapper bumps immediately.
  sandbox.invalidateCounts_('tasks');
  assert.strictEqual(bumpCount(state, T), 2);
  // Pending cleared: an extra flush after the wrapper is a no-op.
  sandbox.flushCountBumps_();
  assert.strictEqual(bumpCount(state, T), 2);
});

test('flush-on-read collapses pending into one bump and clears it', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.runWithBatchedCountBumps_(function () {
    sandbox.invalidateCounts_('tasks');
    sandbox.flushCountBumps_(); // e.g. cachedTasksList_ read inside the flow
    assert.strictEqual(bumpCount(state, T), 1);

    sandbox.invalidateCounts_('notif');
    sandbox.flushCountBumps_();
    assert.strictEqual(bumpCount(state, N), 1);

    sandbox.flushCountBumps_(); // nothing pending — no-op
    assert.strictEqual(bumpCount(state, N), 1);
  });
  assert.strictEqual(bumpCount(state, T), 1);
  assert.strictEqual(bumpCount(state, N), 1);
});

test('error path still flushes and restores the deferral', () => {
  const { sandbox, state } = makeSandbox();
  assert.throws(function () {
    sandbox.runWithBatchedCountBumps_(function () {
      sandbox.invalidateCounts_('tasks');
      throw new Error('boom');
    });
  }, /boom/);
  assert.strictEqual(bumpCount(state, T), 1, 'pending flushed despite the throw');
  // Deferral restored after the throw: a fresh invalidate bumps immediately.
  sandbox.invalidateCounts_('tasks');
  assert.strictEqual(bumpCount(state, T), 2);
});

test('nested wrappers flush each batch exactly once', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.runWithBatchedCountBumps_(function () {
    sandbox.invalidateCounts_('tasks');
    sandbox.invalidateCounts_('notif');
    sandbox.runWithBatchedCountBumps_(function () {
      sandbox.invalidateCounts_('tasks');
    });
    // The inner exit flushes the WHOLE pending set (outer's included) — one
    // bump invalidates both batches, so a nested flush is safe and correct.
    assert.strictEqual(bumpCount(state, T), 1);
    assert.strictEqual(bumpCount(state, N), 1);
  });
  assert.strictEqual(bumpCount(state, T), 1);
  assert.strictEqual(bumpCount(state, N), 1);
  // Deferral restored after nested wrappers.
  sandbox.invalidateCounts_('tasks');
  assert.strictEqual(bumpCount(state, T), 2);
});

test('flush outside a deferred context is a no-op', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.flushCountBumps_();
  assert.strictEqual(Object.keys(state.bumps).length, 0);
});

/* ------------------------- Source guards (wiring) ------------------------- */

test('read funnels flush pending before their cache read', () => {
  // countCacheRead_ (Counts.js)
  const cc = COUNTS_JS.slice(COUNTS_JS.indexOf('function countCacheRead_'), COUNTS_JS.indexOf('function countCacheRead_') + 400);
  const flushIdx = cc.indexOf('flushCountBumps_();');
  const cacheIdx = cc.indexOf('CacheService.getScriptCache().get');
  assert.ok(flushIdx !== -1 && flushIdx < cacheIdx, 'countCacheRead_ must flush before reading');

  // cachedTasksList_ (Tasks.js)
  const cl = TASKS_JS.slice(TASKS_JS.indexOf('function cachedTasksList_'), TASKS_JS.indexOf('function cachedTasksList_') + 400);
  const clFlush = cl.indexOf('flushCountBumps_();');
  const clCache = cl.indexOf('payloadCacheRead_');
  assert.ok(clFlush !== -1 && clFlush < clCache, 'cachedTasksList_ must flush before reading');

  // getSubmissionOverview_ (Submissions.js)
  const so = SUBS_JS.slice(SUBS_JS.indexOf('function getSubmissionOverview_'), SUBS_JS.indexOf('function getSubmissionOverview_') + 400);
  const soFlush = so.indexOf('flushCountBumps_();');
  const soCache = so.indexOf('payloadCacheRead_');
  assert.ok(soFlush !== -1 && soFlush < soCache, 'getSubmissionOverview_ must flush before reading');
});

test('Tasks multi-mutation flows are wrapped in runWithBatchedCountBumps_', () => {
  // Exactly the three multi-bump flows (createTask, updateTask, updateTaskField)
  const count = (TASKS_JS.match(/return runWithBatchedCountBumps_\(function \(\) \{/g) || []).length;
  assert.strictEqual(count, 3, 'expected 3 wrapped flows in Tasks.js, got ' + count);

  // The wrapper must sit inside the runWithLock_ body, before any body statement.
  for (const fn of ['createTask', 'updateTask', 'updateTaskField']) {
    const fnIdx = TASKS_JS.indexOf('function ' + fn + '(');
    const nextFn = TASKS_JS.indexOf('\nfunction ', fnIdx + 1);
    const region = TASKS_JS.slice(fnIdx, nextFn === -1 ? undefined : nextFn);
    const lockIdx = region.indexOf('return runWithLock_(function () {');
    const wrapIdx = region.indexOf('return runWithBatchedCountBumps_(function () {');
    assert.ok(lockIdx !== -1, fn + ' must use runWithLock_');
    assert.ok(wrapIdx > lockIdx, fn + ' must wrap inside its runWithLock_ body');
  }
});

test('addSubmission is wrapped in runWithBatchedCountBumps_', () => {
  const count = (SUBS_JS.match(/return runWithBatchedCountBumps_\(function \(\) \{/g) || []).length;
  assert.strictEqual(count, 1, 'expected exactly 1 wrapped flow in Submissions.js, got ' + count);
  const fnIdx = SUBS_JS.indexOf('function addSubmission(');
  const region = SUBS_JS.slice(fnIdx, SUBS_JS.indexOf('\nfunction ', fnIdx + 1));
  const lockIdx = region.indexOf('return runWithLock_(function () {');
  const wrapIdx = region.indexOf('return runWithBatchedCountBumps_(function () {');
  assert.ok(lockIdx !== -1 && wrapIdx > lockIdx, 'addSubmission must wrap inside its runWithLock_ body');
});

test('adminMigrateStableIds invalidates every family it rewrites', () => {
  const fnIdx = MIGRATION_JS.indexOf('function adminMigrateStableIds(');
  const nextFn = MIGRATION_JS.indexOf('\nfunction ', fnIdx + 1);
  const region = MIGRATION_JS.slice(fnIdx, nextFn === -1 ? undefined : nextFn);
  for (const probe of [
    "invalidateCounts_('tasks')",
    "invalidateCounts_('submissions')",
    "invalidateCounts_('notif')",
    'markUserDirty_()'
  ]) {
    assert.ok(region.indexOf(probe) !== -1, 'adminMigrateStableIds must contain ' + probe);
  }
  // Dry runs never write, so they must not invalidate.
  assert.ok(region.indexOf("if (!dryRun)") !== -1, 'invalidation must be gated on !dryRun');
  // Only families that actually changed rows should bump.
  assert.ok(region.indexOf('if (!e.rowsBackfilled && !e.columnsAdded) return;') !== -1, 'invalidation must be gated on rowsBackfilled/columnsAdded');
});
