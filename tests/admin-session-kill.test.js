/**
 * Unit tests for the admin session-kill wiring:
 *   - Auth.js defines adminKillUserSessions(email, token) (token last)
 *   - code.js registers it in the API_ROUTES allowlist
 *   - BOTH clients (script.html GAS + docs/app.js PWA) expose
 *     ApiService.adminKillUserSessions(email) that appends the auth token last
 *
 * These are source-level contract tests: they assert the shipped files wire
 * the endpoint consistently, so a future rename or a param-order swap in one
 * copy is caught immediately.
 *
 * Run with:  node --test tests/admin-session-kill.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const AUTH = fs.readFileSync(path.join(ROOT, 'Auth.js'), 'utf8');
const CODE = fs.readFileSync(path.join(ROOT, 'code.js'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'script.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'docs', 'app.js'), 'utf8');

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
function loadFunction(src, name, sandboxExtra) {
  const sandbox = Object.assign({ console }, sandboxExtra || {});
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(src, name), sandbox, { filename: name });
  return sandbox[name];
}

test('server: adminKillUserSessions bumps the epoch, requires admin, audits', () => {
  const calls = { epoch: [], audit: [], notify: [], locked: 0 };
  const fn = loadFunction(AUTH, 'adminKillUserSessions', {
    requireAdmin_(token) { assert.strictEqual(token, 'tok'); return { email: 'admin@x.com' }; },
    checkRateLimit_() {},
    AppUtils: { safeCacheKey(v) { return String(v); } },
    CONFIG: { RATE_LIMIT: { ADMIN_USER_MAX: 20, ADMIN_USER_WINDOW: 60 } },
    runWithLock_(cb) { calls.locked++; return cb(); },
    findUserRecord_(email) { return email === 'victim@x.com' ? { email: email } : null; },
    bumpSessionEpoch_(email) { calls.epoch.push(email); },
    logAudit_(action, id, details, who) { calls.audit.push({ action, details, who }); },
    notify_(to, type, subject, body) { calls.notify.push({ to, subject }); },
    ACTIONS: { USER_KILL_SESSIONS: 'USER_KILL_SESSIONS' },
    NOTIFICATION_TYPES: { USER: 'USER' },
  });

  const out = fn('victim@x.com', 'tok');
  assert.strictEqual(out.success, true);
  assert.strictEqual(out.reAuth, false, 'no reAuth when targeting someone else');
  assert.deepStrictEqual(calls.epoch, ['victim@x.com'], 'session epoch bumped for target');
  assert.strictEqual(calls.locked, 1, 'mutation ran under the script lock');
  assert.ok(calls.audit.length >= 1 && calls.audit[0].action === 'USER_KILL_SESSIONS');
  assert.ok(calls.notify.length >= 1 && calls.notify[0].to === 'victim@x.com');
});

test('server: self-target sets reAuth so the client prompts for sign-in', () => {
  const fn = loadFunction(AUTH, 'adminKillUserSessions', {
    requireAdmin_() { return { email: 'me@x.com' }; },
    checkRateLimit_() {},
    AppUtils: { safeCacheKey(v) { return String(v); } },
    CONFIG: { RATE_LIMIT: { ADMIN_USER_MAX: 20, ADMIN_USER_WINDOW: 60 } },
    runWithLock_(cb) { return cb(); },
    findUserRecord_(email) { return { email: email }; },
    bumpSessionEpoch_() {},
    logAudit_() {},
    notify_() {},
  });
  const out = fn('me@x.com', 'tok');
  assert.strictEqual(out.reAuth, true, 'self-target must signal reAuth');
});

test('server: adminKillUserSessions rejects unknown users', () => {
  const fn = loadFunction(AUTH, 'adminKillUserSessions', {
    requireAdmin_() { return { email: 'admin@x.com' }; },
    checkRateLimit_() {},
    AppUtils: { safeCacheKey(v) { return String(v); } },
    CONFIG: { RATE_LIMIT: { ADMIN_USER_MAX: 20, ADMIN_USER_WINDOW: 60 } },
    runWithLock_(cb) { return cb(); },
    findUserRecord_() { return null; },
    clientError_(m) { const e = new Error(m); e.clientSafe = true; return e; },
  });
  assert.throws(() => fn('ghost@x.com', 'tok'), /User not found/);
});

test('server: adminKillUserSessions does NOT touch the password hash', () => {
  const calls = { userFields: [] };
  const fn = loadFunction(AUTH, 'adminKillUserSessions', {
    requireAdmin_() { return { email: 'admin@x.com' }; },
    checkRateLimit_() {},
    AppUtils: { safeCacheKey(v) { return String(v); } },
    CONFIG: { RATE_LIMIT: { ADMIN_USER_MAX: 20, ADMIN_USER_WINDOW: 60 } },
    runWithLock_(cb) { return cb(); },
    findUserRecord_(email) { return { email: email }; },
    bumpSessionEpoch_() {},
    logAudit_() {},
    notify_() {},
    setUserField_(email, field) { calls.userFields.push({ email, field }); },
  });
  const out = fn('victim@x.com', 'tok');
  assert.strictEqual(out.success, true);
  assert.deepStrictEqual(calls.userFields, [],
    'endpoint must never write user fields (esp. salt/passwordHash)');
});

test('server: route is registered in the API_ROUTES allowlist', () => {
  // Contract check on the shipped code: the route table must map the name to
  // the function, and doPost must resolve only through that allowlist.
  const start = CODE.indexOf('var API_ROUTES = {');
  assert.notStrictEqual(start, -1, 'API_ROUTES not found in code.js');
  const open = CODE.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < CODE.length; i++) {
    if (CODE[i] === '{') depth++;
    else if (CODE[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = CODE.slice(start, i + 1);
  assert.ok(/adminKillUserSessions:\s*adminKillUserSessions/.test(block),
    'API_ROUTES must map adminKillUserSessions to the Auth.js function');
  // Guard rails: doPost resolves strictly from the allowlist (no eval of
  // arbitrary names), and the function exists in Auth.js.
  assert.ok(CODE.includes('Object.prototype.hasOwnProperty.call(API_ROUTES, fn)'),
    'doPost must only resolve allowlisted names');
  assert.ok(AUTH.includes('function adminKillUserSessions('),
    'adminKillUserSessions must be defined in Auth.js');
});

test('clients: wrapper exists in BOTH copies with token appended last', () => {
  // Formatting-tolerant: name + first-arg email + token LAST via getAuthToken().
  const re = /adminKillUserSessions:\s*function\s*\(\s*email\s*\)\s*\{\s*return\s+apiCall_\(\s*'adminKillUserSessions'\s*,\s*email\s*,\s*getAuthToken\(\)\s*\)\s*;\s*\},?/;
  for (const [label, src] of [['script.html (GAS client)', SCRIPT], ['docs/app.js (PWA client)', APP]]) {
    assert.ok(re.test(src), label + ' missing/incorrect adminKillUserSessions wrapper');
  }
});

test('client: wrapper calls apiCall_ with (email, token) in that order', () => {
  // Evaluate the REAL wrapper line extracted from docs/app.js. Strip the
  // trailing ',' from the object literal so it parses as a standalone fn.
  const line = APP.split('\n').find((l) => l.includes("adminKillUserSessions: function (email)"));
  assert.ok(line, 'wrapper line not found in docs/app.js');
  // CRLF source: strip trailing \r and the object-literal comma.
  const body = line.replace(/\r/g, '').replace(/\s*,$/, '').replace('adminKillUserSessions: function', 'function');

  const calls = [];
  const sandbox = {
    console,
    apiCall_(fn) {
      const args = Array.prototype.slice.call(arguments, 1);
      calls.push({ fn, args });
      return Promise.resolve({ success: true });
    },
    getAuthToken() { return 'the-token'; },
  };
  vm.createContext(sandbox);
  vm.runInContext('this.wrapper = ' + body + ';', sandbox, { filename: 'adminKillUserSessions wrapper' });
  return sandbox.wrapper('victim@x.com').then(function () {
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].fn, 'adminKillUserSessions');
    assert.deepStrictEqual(calls[0].args, ['victim@x.com', 'the-token'],
      'client must send (email, token) with the token LAST');
  });
});

test('client: users table has a Sign out everywhere button in BOTH copies', () => {
  const re = /data-action="killSessions"[^>]*>Sign out everywhere<\/button>/;
  for (const [label, src] of [['script.html (GAS client)', SCRIPT], ['docs/app.js (PWA client)', APP]]) {
    assert.ok(re.test(src), label + ' missing Sign out everywhere button');
    assert.ok(src.includes('colspan="9"'), label + ' empty-state colspan not bumped to 9');
  }
});

test('client: delegation routes data-action killSessions to killUserSessions', () => {
  const re = /btn\.dataset\.action === 'killSessions'\) killUserSessions\(user\.email\)/;
  for (const [label, src] of [['script.html (GAS client)', SCRIPT], ['docs/app.js (PWA client)', APP]]) {
    assert.ok(re.test(src), label + ' missing killSessions delegation');
  }
});

test('client: killUserSessions handler confirms, calls wrapper, toasts, handles reAuth', () => {
  // Run the REAL handler from BOTH copies so a divergence can't slip through.
  const runOne = (label, src) => {
    const fn = extractFunction(src, 'killUserSessions');
    const events = [];
    let sessionMsg = null;
    const sandbox = {
      console,
      showConfirm(opts) {
        events.push('confirm');
        assert.strictEqual(opts.okLabel, 'Sign out');
        assert.strictEqual(opts.danger, true);
        return Promise.resolve(true);
      },
      showOverlay(msg) { events.push('overlay:' + msg); },
      hideOverlay() { events.push('hideOverlay'); },
      ApiService: {
        adminKillUserSessions(email) {
          events.push('api:' + email);
          return Promise.resolve({ message: 'All sessions for x@y.z have been invalidated.', reAuth: true });
        },
      },
      showToast(msg, type) { events.push('toast:' + msg + '|' + type); },
      setAuthToken(t) { events.push('setAuthToken:' + t); },
      STORAGE_REAUTH_MSG: 'indiaPostReauthMsg',
      window: {
        sessionStorage: {
          setItem(k, v) { sessionMsg = k + '=' + v; },
        },
        location: { reload() { events.push('reload'); } },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(fn, sandbox, { filename: 'killUserSessions' });
    return sandbox.killUserSessions('x@y.z').then(function () {
      assert.deepStrictEqual(events, [
        'confirm',
        'overlay:Signing out x@y.z…',
        'api:x@y.z',
        'hideOverlay',
        'toast:All sessions for x@y.z have been invalidated.|success',
        'setAuthToken:',
        'reload',
      ], label + ' handler flow diverged');
      assert.strictEqual(sessionMsg, 'indiaPostReauthMsg=You signed yourself out everywhere. Please sign in again.', label);
    });
  };
  return runOne('script.html (GAS client)', SCRIPT).then(function () {
    return runOne('docs/app.js (PWA client)', APP);
  });
});
