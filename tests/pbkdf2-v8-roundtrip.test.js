/**
 * Regression tests for the GAS V8 PBKDF2 fix in Auth.js.
 *
 * Background: GAS V8 rejects a plain JS number[] for the bytes parameter of
 * Utilities.computeHmacSha256Signature ("The parameters (number[],String,
 * Utilities.Charset) don't match the method signature"), so every user-creation
 * path (adminAddUser / adminImportUsers / bootstrap / password change) crashed
 * with a masked error. The fix round-trips the intermediate byte array through
 * a Latin-1 (ISO_8859_1) string (String.fromCharCode -> exact byte) and uses
 * ISO_8859_1 for EVERY call so the HMAC key bytes stay identical across all
 * PBKDF2 iterations.
 *
 * These tests pin the derivation to real crypto.pbkdf2Sync reference vectors so
 * a future change back to UTF_8 (or dropping the fromCharCode round-trip) fails
 * loudly instead of silently corrupting stored hashes.
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

/** Extracts pbkdf2HmacSha256_ (whole function body, brace-matched). */
function extractPbkdf2(src) {
  const mark = 'function pbkdf2HmacSha256_(password, salt, iterations, dkLen) {';
  const start = src.indexOf(mark);
  assert.notStrictEqual(start, -1, 'pbkdf2HmacSha256_ not found in Auth.js');
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
  assert.strictEqual(depth, 0, 'unbalanced braces in pbkdf2HmacSha256_');
  return src.slice(start, i + 1);
}

/** Emulates GAS semantics: ISO_8859_1 encodes charCodes 0-255 byte-exact;
 *  the digest comes back as SIGNED bytes (Java Byte[]), like GAS. */
function makeUtilitiesStub() {
  const toBuf = (v, enc) => {
    if (typeof v === 'string') return Buffer.from(v, enc);
    return Buffer.from(Array.from(v, (b) => (((b % 256) + 256) % 256)));
  };
  return {
    Charset: { ISO_8859_1: 'ISO-8859-1', UTF_8: 'UTF-8' },
    computeHmacSha256Signature(value, key, charset) {
      const enc = charset === 'ISO-8859-1' ? 'latin1' : 'utf8';
      const digest = crypto
        .createHmac('sha256', toBuf(key, enc))
        .update(toBuf(value, enc))
        .digest();
      return Array.from(digest, (b) => (b > 127 ? b - 256 : b)); // signed
    },
  };
}

function makeSandbox() {
  const sandbox = {
    console,
    Utilities: makeUtilitiesStub(),
    CONFIG: { USERS: { PBKDF2_ITERATIONS: 3000 } },
  };
  vm.runInNewContext(extractPbkdf2(AUTH_JS), sandbox, {
    filename: 'Auth.js (pbkdf2HmacSha256_)',
  });
  return sandbox;
}

/** Reference for the Latin-1 semantics GAS actually computes. */
function latin1Pbkdf2Hex(password, salt, iterations, dkLen) {
  return crypto
    .pbkdf2Sync(
      Buffer.from(String(password), 'latin1'),
      Buffer.from(String(salt), 'latin1'),
      iterations,
      dkLen,
      'sha256'
    )
    .toString('hex');
}

/* ---------------------------------- Tests ---------------------------------- */

test('pbkdf2HmacSha256_ matches the reference vector (default iterations/dkLen)', () => {
  const s = makeSandbox();
  const out = s.pbkdf2HmacSha256_('Vish@9194', 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  assert.strictEqual(out, latin1Pbkdf2Hex('Vish@9194', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 3000, 32));
});

test('pbkdf2HmacSha256_ matches reference across iterations (10000) and dkLen 64 (multi-block)', () => {
  const s = makeSandbox();
  const out = s.pbkdf2HmacSha256_('correct horse battery staple', 'deadbeef', 10000, 64);
  assert.strictEqual(out, latin1Pbkdf2Hex('correct horse battery staple', 'deadbeef', 10000, 64));
});

test('unicode passwords are self-consistent (Latin-1 key bytes, byte-exact reference)', () => {
  const s = makeSandbox();
  const pw = 'p\u00e4ssw\u00f6rd'; // Latin-1 representable (chars <= 0xFF)
  const out = s.pbkdf2HmacSha256_(pw, '7f7f7f7f7f7f', 5000, 32);
  assert.strictEqual(out, latin1Pbkdf2Hex(pw, '7f7f7f7f7f7f', 5000, 32));
});

test('the V8 fix is present: ISO_8859_1 round-trip, no UTF_8 charset in hmac (source guard)', () => {
  const src = extractPbkdf2(AUTH_JS);
  assert.ok(src.includes('ISO_8859_1'), 'hmac must use ISO_8859_1 (byte-exact round-trip)');
  assert.ok(
    src.includes('String.fromCharCode.apply(null, msg)'),
    'byte arrays must be round-tripped through fromCharCode'
  );
  const utf8Usage = src.indexOf('Charset.UTF_8');
  assert.strictEqual(utf8Usage, -1, 'hmac must NOT use UTF_8 (corrupts bytes >= 0x80)');
});

test('signed GAS byte arrays still derive the same hash (Java Byte[] semantics)', () => {
  // u values may arrive signed (-128..127) from GAS; fromCharCode + Latin-1
  // round-trips them byte-exact, and XOR is bitwise-identical either way.
  const s = makeSandbox();
  const out = s.pbkdf2HmacSha256_('signed-bytes-probe', 'abcdef0123456789', 2000, 32);
  assert.strictEqual(out, latin1Pbkdf2Hex('signed-bytes-probe', 'abcdef0123456789', 2000, 32));
});
