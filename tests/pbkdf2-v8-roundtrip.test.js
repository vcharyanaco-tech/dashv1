/**
 * Regression tests for the PBKDF2 password hashing in Auth.js.
 *
 * Background: every user-creation path (adminAddUser / adminImportUsers /
 * bootstrap / password change) crashed under GAS V8. Two GAS pitfalls were
 * hit: (1) Utilities.computeHmacSha256Signature rejects a plain JS number[]
 * for its bytes parameter, and (2) Utilities.Charset.ISO_8859_1 was REMOVED
 * in the V8 runtime ("Invalid argument: charset"). The fix reimplements
 * SHA-256 / HMAC-SHA256 in pure JS over byte arrays (FIPS 180-4 / RFC 2104),
 * giving standard RFC 2898 PBKDF2 with UTF-8 password encoding — byte-
 * identical to crypto.pbkdf2Sync().
 *
 * These tests pin the derivation to real crypto reference vectors (incl.
 * unicode passwords and multi-block outputs) and guard the source so a
 * regression to Utilities-based hashing fails loudly.
 *
 * Run with:  node --test tests/pbkdf2-v8-roundtrip.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'Auth.js'), 'utf8');

/** Extracts the contiguous pure-JS block: utf8Bytes_ .. pbkdf2HmacSha256_. */
function extractPbkdf2(src) {
  const start = src.indexOf('function utf8Bytes_(str) {');
  assert.notStrictEqual(start, -1, 'utf8Bytes_ not found in Auth.js');

  const mark = 'function pbkdf2HmacSha256_(password, salt, iterations, dkLen) {';
  const fnStart = src.indexOf(mark);
  assert.notStrictEqual(fnStart, -1, 'pbkdf2HmacSha256_ not found in Auth.js');
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
  assert.strictEqual(depth, 0, 'unbalanced braces in pbkdf2HmacSha256_');
  return src.slice(start, i + 1);
}

function makeSandbox() {
  const sandbox = {
    console,
    CONFIG: { USERS: { PBKDF2_ITERATIONS: 3000 } },
  };
  vm.runInNewContext(extractPbkdf2(AUTH_JS), sandbox, {
    filename: 'Auth.js (pbkdf2 pure-JS block)',
  });
  return sandbox;
}

/** Standard UTF-8 reference: crypto.pbkdf2Sync. */
function refPbkdf2Hex(password, salt, iterations, dkLen) {
  return crypto
    .pbkdf2Sync(String(password), String(salt), iterations, dkLen, 'sha256')
    .toString('hex');
}

/* ---------------------------------- Tests ---------------------------------- */

test('pbkdf2HmacSha256_ matches crypto.pbkdf2Sync (default iterations/dkLen)', () => {
  const s = makeSandbox();
  const out = s.pbkdf2HmacSha256_('Vish@9194', 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  assert.strictEqual(out, refPbkdf2Hex('Vish@9194', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 3000, 32));
});

test('matches reference across iterations (10000) and dkLen 64 (multi-block)', () => {
  const s = makeSandbox();
  const out = s.pbkdf2HmacSha256_('correct horse battery staple', 'deadbeef', 10000, 64);
  assert.strictEqual(out, refPbkdf2Hex('correct horse battery staple', 'deadbeef', 10000, 64));
});

test('unicode passwords match the standard UTF-8 reference exactly', () => {
  const s = makeSandbox();
  const pw = 'p\u00e4ssw\u00f6rd-\u65e5\u672c\u8a9e'; // Latin-1 chars + CJK
  const out = s.pbkdf2HmacSha256_(pw, '7f7f7f7f7f7f', 5000, 32);
  assert.strictEqual(out, refPbkdf2Hex(pw, '7f7f7f7f7f7f', 5000, 32));
});

test('surrogate-pair (emoji) passwords match the UTF-8 reference', () => {
  const s = makeSandbox();
  const pw = 'pw-\u{1f600}-end'; // 😀 needs surrogate-pair encoding
  const out = s.pbkdf2HmacSha256_(pw, '0001020304050607', 2000, 32);
  assert.strictEqual(out, refPbkdf2Hex(pw, '0001020304050607', 2000, 32));
});

test('hmacSha256Bytes_ matches RFC 4231 test case 1', () => {
  const s = makeSandbox();
  const key = Array(20).fill(0x0b);
  const msg = Array.from(Buffer.from('Hi There'));
  const out = Buffer.from(s.hmacSha256Bytes_(key, msg)).toString('hex');
  assert.strictEqual(out, 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
});

test('sha256Bytes_ matches crypto for multi-block input (> 64 bytes)', () => {
  const s = makeSandbox();
  const msg = Array.from(Buffer.from('a'.repeat(200)));
  const out = Buffer.from(s.sha256Bytes_(msg)).toString('hex');
  assert.strictEqual(out, crypto.createHash('sha256').update('a'.repeat(200)).digest('hex'));
});

test('the hashing is pure JS: no Utilities/Charset dependency (source guard)', () => {
  const src = extractPbkdf2(AUTH_JS);
  assert.ok(src.includes('function hmacSha256Bytes_'), 'pure-JS HMAC helper must exist');
  assert.strictEqual(src.indexOf('Utilities.'), -1, 'PBKDF2 block must not use Utilities');
  assert.strictEqual(src.indexOf('Charset'), -1, 'PBKDF2 block must not use Charset');
  assert.strictEqual(src.indexOf('computeHmacSha256Signature'), -1, 'no GAS HMAC primitive');
});
