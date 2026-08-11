/**
 * Unit tests for the deferred Users-generation bump batching in Auth.js.
 *
 * Multi-mutation flows (password change, admin update, bulk import) used to
 * bump the Users cache generation after EVERY cell write — each bump orphans
 * the cached Users payload, so the next read inside the flow paid a full sheet
 * read and the cache sat cold during the whole flow. The batched helpers
 * (markUserDirty_ / flushUserBumps_ / runWithBatchedUserBumps_) collapse all
 * mutations in a flow into ONE bump, flushed on exit (even on throw) or before
 * any read, so the cache stays warm between mutations.
 *
 * The helpers live in Auth.js (a GAS server file, not a client). We extract
 * the contiguous helper region from the real file and run it in a vm sandbox
 * with a stubbed bumpUserGen_ so the bump count is observable.
 *
 * Run with:  node --test tests/users-bump-batching.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'Auth.js'), 'utf8');

/**
 * Extracts the helper block: the two `let` state declarations plus
 * markUserDirty_ / flushUserBumps_ / runWithBatchedUserBumps_.
 * Returns the source text and the matching closing brace offset.
 */
function extractHelperBlock(src) {
  const start = src.indexOf('let __usersBumpsDeferred__ = false;');
  assert.notStrictEqual(start, -1, 'defer state declaration not found in Auth.js');

  const fnMark = 'function runWithBatchedUserBumps_(fn) {';
  const fnStart = src.indexOf(fnMark);
  assert.notStrictEqual(fnStart, -1, 'runWithBatchedUserBumps_ not found in Auth.js');

  const open = fnStart + fnMark.length - 1; // the '{' of runWithBatchedUserBumps_
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.strictEqual(depth, 0, 'unbalanced braces in helper block');
  return src.slice(start, i + 1);
}

/** Builds a fresh sandbox whose bumpUserGen_ counts every call. */
function makeSandbox() {
  const state = { bumps: 0 };
  const sandbox = {
    console,
    bumpUserGen_: function () { state.bumps++; },
  };
  const src = extractHelperBlock(AUTH_JS);
  vm.runInNewContext(src, sandbox, { filename: 'Auth.js (users bump batching)' });
  return { sandbox, state };
}

/* ----------------------- Cache co-write (patch helpers) ----------------------- */

/** Extracts a contiguous block from the first `startMark` to the end of
 *  `endFn`. Both must exist; the block is brace-matched on endFn. */
function extractBlock(src, startMark, endFn) {
  const start = src.indexOf(startMark);
  assert.notStrictEqual(start, -1, startMark + ' not found in Auth.js');
  const fnStart = src.indexOf('function ' + endFn + '(');
  assert.notStrictEqual(fnStart, -1, endFn + ' not found in Auth.js');
  const open = src.indexOf('{', fnStart);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.strictEqual(depth, 0, 'unbalanced braces in block');
  return src.slice(start, i + 1);
}

/** Builds a sandbox with the real patch helpers, USER_COL/USER_FIELD_COL and
 *  emailList_, plus a stubbed in-memory cache so writes are observable. */
/** Extracts the contiguous USER_COL + USER_FIELD_COL declarations (USER_FIELD_COL
 *  references USER_COL values at definition time, so both must be evaluated
 *  together, in order). */
function extractColBlocks(src) {
  const start = src.indexOf('const USER_COL = Object.freeze({');
  assert.notStrictEqual(start, -1, 'USER_COL not found in Auth.js');
  const fieldStart = src.indexOf('const USER_FIELD_COL = Object.freeze({');
  assert.notStrictEqual(fieldStart, -1, 'USER_FIELD_COL not found in Auth.js');
  // Brace-match from USER_FIELD_COL's '{' (it ends the contiguous pair).
  const open = src.indexOf('{', fieldStart);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.strictEqual(depth, 0, 'unbalanced braces in USER_FIELD_COL');
  // Object.freeze({ ... }) closes with `})` — include the paren + semicolon.
  let end = i + 1;
  if (src[end] === ')') end++;
  if (src[end] === ';') end++;
  return src.slice(start, end);
}

/** Builds a sandbox with the real patch helpers, USER_COL/USER_FIELD_COL and
 *  emailList_, plus a stubbed in-memory cache so writes are observable. */
function makePatchSandbox() {
  const state = { writes: [], rows: null };
  const helpers = extractBlock(AUTH_JS, 'function userCacheHandle_() {', 'patchUserCacheRemoveRow_');
  const emailList = extractBlock(AUTH_JS, 'function emailList_(value) {', 'emailList_');

  const sandbox = {
    console,
    userGen_: () => 1,
    payloadCacheRead_(key) {
      assert.strictEqual(key, 'users:v1:g1', 'patch helpers must use the current gen key');
      return state.rows;
    },
    payloadCacheWrite_(key, payload, ttl) {
      state.writes.push({ key: key, rows: payload, ttl: ttl });
      state.rows = payload;
    },
    CONFIG: { CACHE: { COUNTS_TTL_SLOW: 300 } },
    String: String,
  };
  vm.runInNewContext(extractColBlocks(AUTH_JS), sandbox, { filename: 'Auth.js (USER_COL)' });
  vm.runInNewContext(emailList, sandbox, { filename: 'Auth.js (emailList_)' });
  vm.runInNewContext(helpers, sandbox, { filename: 'Auth.js (patch helpers)' });
  return { sandbox, state };
}

function makeRow(email) {
  const row = new Array(16).fill('');
  row[0] = email;
  row[1] = 'VIEWER';
  return row;
}

/* ---------------------------------- Tests ---------------------------------- */

test('markUserDirty_ outside a batched flow bumps immediately', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.markUserDirty_();
  sandbox.markUserDirty_();
  assert.strictEqual(state.bumps, 2, 'each dirty mark bumps when not deferred');
});

test('mutations inside runWithBatchedUserBumps_ collapse into a single bump', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.runWithBatchedUserBumps_(function () {
    sandbox.markUserDirty_();
    sandbox.markUserDirty_();
    sandbox.markUserDirty_();
    assert.strictEqual(state.bumps, 0, 'no bump while deferred');
  });
  assert.strictEqual(state.bumps, 1, 'one bump flushed on exit');
});

test('flushUserBumps_ (read before flush) collapses pending mutations once', () => {
  const { sandbox, state } = makeSandbox();
  let seen = false;
  sandbox.runWithBatchedUserBumps_(function () {
    sandbox.markUserDirty_();
    sandbox.markUserDirty_();
    sandbox.flushUserBumps_(); // what readUserRecords_ does before a read
    seen = true;
    assert.strictEqual(state.bumps, 1, 'pending mutations flushed into one bump');
    sandbox.flushUserBumps_(); // no-op: nothing pending
    assert.strictEqual(state.bumps, 1, 'empty flush does not bump');
    sandbox.markUserDirty_(); // mutations after the read stay pending
  });
  assert.ok(seen);
  assert.strictEqual(state.bumps, 2, 'second batch flushed as one bump on exit');
});

test('an error inside the batch still flushes once and restores deferral', () => {
  const { sandbox, state } = makeSandbox();
  let threw = false;
  try {
    sandbox.runWithBatchedUserBumps_(function () {
      sandbox.markUserDirty_();
      sandbox.markUserDirty_();
      throw new Error('boom');
    });
  } catch (err) {
    threw = true;
  }
  assert.ok(threw, 'error propagated');
  assert.strictEqual(state.bumps, 1, 'finally flushed the pending bump despite the throw');
  sandbox.markUserDirty_();
  assert.strictEqual(state.bumps, 2, 'deferral restored: later marks bump immediately');
});

test('readUserRecords_ flushes pending bumps before the cache read (source guard)', () => {
  const start = AUTH_JS.indexOf('function readUserRecords_() {');
  assert.notStrictEqual(start, -1, 'readUserRecords_ not found in Auth.js');
  const open = AUTH_JS.indexOf('{', start);
  const flushPos = AUTH_JS.indexOf('flushUserBumps_();', start);
  const readPos = AUTH_JS.indexOf('payloadCacheRead_(key)', start);
  assert.notStrictEqual(flushPos, -1, 'readUserRecords_ must call flushUserBumps_');
  assert.notStrictEqual(readPos, -1, 'readUserRecords_ must contain the cache read');
  assert.ok(
    flushPos > open && flushPos < readPos,
    'flushUserBumps_ must run before the cache read so intra-flow reads see fresh rows'
  );
});

test('nested batches flush their own bumps and restore the outer deferral', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.runWithBatchedUserBumps_(function () {
    sandbox.markUserDirty_();
    sandbox.runWithBatchedUserBumps_(function () {
      sandbox.markUserDirty_();
      sandbox.markUserDirty_();
    });
    assert.strictEqual(state.bumps, 1, 'inner batch flushed on its exit');
    sandbox.markUserDirty_(); // outer still deferred
  });
  assert.strictEqual(state.bumps, 2, 'outer batch flushed on exit');
});

/* ---------------------------------- Co-write tests ---------------------------------- */

test('patchUserCacheSetField_ updates the cached row cell and writes back', () => {
  const { sandbox, state } = makePatchSandbox();
  state.rows = [makeRow('a@x.com')];

  const ok = sandbox.patchUserCacheSetField_('a@x.com', 'role', 'ADMIN');
  assert.strictEqual(ok, true, 'patch succeeds when the cache is present');
  assert.strictEqual(state.rows[0][1], 'ADMIN', 'role cell updated in place');
  assert.strictEqual(state.writes.length, 1, 'payload written back once');
  assert.strictEqual(state.writes[0].key, 'users:v1:g1', 'written under the SAME gen key');
});

test('setField resolves comma-separated alias cells like findUserRecord_', () => {
  const { sandbox, state } = makePatchSandbox();
  state.rows = [makeRow('a@x.com,b@x.com')];

  const ok = sandbox.patchUserCacheSetField_('b@x.com', 'office', 'HQR');
  assert.strictEqual(ok, true, 'alias match succeeds');
  assert.strictEqual(state.rows[0][11], 'HQR', 'office cell updated via alias');
});

test('patchUserCacheAddRow_ appends the new row to the cached payload', () => {
  const { sandbox, state } = makePatchSandbox();
  state.rows = [makeRow('a@x.com')];
  const newRow = makeRow('b@x.com');
  newRow[1] = 'EDITOR';

  const ok = sandbox.patchUserCacheAddRow_(newRow);
  assert.strictEqual(ok, true);
  assert.strictEqual(state.rows.length, 2, 'row appended');
  assert.strictEqual(state.rows[1][0], 'b@x.com');
});

test('patchUserCacheRemoveRow_ removes the matching row', () => {
  const { sandbox, state } = makePatchSandbox();
  state.rows = [makeRow('a@x.com'), makeRow('b@x.com')];

  const ok = sandbox.patchUserCacheRemoveRow_('a@x.com');
  assert.strictEqual(ok, true);
  assert.strictEqual(state.rows.length, 1, 'row removed');
  assert.strictEqual(state.rows[0][0], 'b@x.com');
});

test('co-write helpers return false and never bump when the cache is absent', () => {
  const { sandbox, state } = makePatchSandbox();
  assert.strictEqual(state.rows, null, 'no cache present');

  assert.strictEqual(sandbox.patchUserCacheSetField_('a@x.com', 'role', 'ADMIN'), false);
  assert.strictEqual(sandbox.patchUserCacheAddRow_(makeRow('b@x.com')), false);
  assert.strictEqual(sandbox.patchUserCacheRemoveRow_('a@x.com'), false);
  assert.strictEqual(state.writes.length, 0, 'no cache writes attempted');
});

test('setField with an unknown field or missing user returns false (caller bumps)', () => {
  const { sandbox, state } = makePatchSandbox();
  state.rows = [makeRow('a@x.com')];

  assert.strictEqual(sandbox.patchUserCacheSetField_('a@x.com', 'nope', 'x'), false, 'unknown field');
  assert.strictEqual(sandbox.patchUserCacheSetField_('ghost@x.com', 'role', 'ADMIN'), false, 'missing user');
  assert.strictEqual(state.writes.length, 0, 'no writes for failed patches');
});

test('mutators fall back to markUserDirty_ when the co-write finds no cache (source guards)', () => {
  const guards = [
    'function setUserField_(email, field, value) {',
    'if (!patchUserCacheSetField_(email, field, value)) markUserDirty_();',
  ];
  const addGuards = [
    'function addUserRecord_(email, role, salt, passwordHash, createdBy, group, department, office, username) {',
    'if (!patchUserCacheAddRow_(row)) markUserDirty_();',
  ];
  const delGuards = [
    'function deleteUserRecord_(email) {',
    'if (!patchUserCacheRemoveRow_(email)) markUserDirty_();',
  ];
  for (const [fn, guard] of [guards, addGuards, delGuards]) {
    const fnPos = AUTH_JS.indexOf(fn);
    assert.notStrictEqual(fnPos, -1, fn + ' not found');
    const guardPos = AUTH_JS.indexOf(guard, fnPos);
    assert.ok(guardPos !== -1 && guardPos < fnPos + 900, guard + ' must appear inside ' + fn);
  }
  // renameUserEmail_ must co-write the cache (or bump if absent) AND orphan the other families.
  const renamePos = AUTH_JS.indexOf('function renameUserEmail_(oldEmail, newEmail) {');
  assert.notStrictEqual(renamePos, -1, 'renameUserEmail_ not found');
  assert.ok(AUTH_JS.indexOf('userCacheHandle_()', renamePos) > renamePos, 'renameUserEmail_ patches the cache');
  assert.ok(AUTH_JS.indexOf("invalidateCounts_('tasks');", renamePos) > renamePos, 'other families still orphaned');
});
