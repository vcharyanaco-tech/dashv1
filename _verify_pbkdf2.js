// Verifies that the ISO_8859_1 string round-trip in pbkdf2HmacSha256_
// (Auth.js) produces byte-identical PBKDF2-HMAC-SHA256 output to a reference.
const crypto = require('crypto');

// ==== Mirrors the FIXED hmac in Auth.js (Latin-1 round-trip) ====
function hmacNew(msg, password) {
  const m = typeof msg === 'string' ? msg : String.fromCharCode.apply(null, msg);
  // GAS semantics: ISO_8859_1 encodes each charCode (0-255) to one byte.
  return Array.from(
    crypto.createHmac('sha256', Buffer.from(password, 'latin1')).update(Buffer.from(m, 'latin1')).digest()
  );
}

// ==== Old code path (raw number[] into hash; works in node, fails in GAS V8) ====
function hmacOld(msg, password) {
  const key = Buffer.from(password, 'utf8');
  const m = typeof msg === 'string' ? Buffer.from(msg, 'utf8') : Buffer.from(msg);
  return Array.from(crypto.createHmac('sha256', key).update(m).digest());
}

function int32be(n) {
  return String.fromCharCode((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}
const hex = (b) => ((b + 256) % 256).toString(16).padStart(2, '0');

function pbkdf2(hmac, password, salt, iterations, dkLen) {
  const out = [];
  let blockIndex = 1;
  while (out.length < dkLen) {
    let u = hmac((salt || '') + int32be(blockIndex), password);
    let t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmac(u, password);
      t = t.map((v, j) => (v ^ u[j]) & 0xff);
    }
    out.push.apply(out, t);
    blockIndex++;
  }
  return out.slice(0, dkLen).map(hex).join('');
}

const cases = [
  ['Vish@9194', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 3000, 32],
  ['correct horse battery staple', 'deadbeef', 10000, 32],
  ['pässwörd-日本語', '7f7f7f7f7f7f', 5000, 32],
  ['Vish@9194', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 3000, 64],
];

let ok = true;
for (const [pw, salt, it, dk] of cases) {
  const ref = crypto.pbkdf2Sync(pw, salt, it, dk, 'sha256').toString('hex');
  const fixed = pbkdf2(hmacNew, pw, salt, it, dk);
  const old = pbkdf2(hmacOld, pw, salt, it, dk);
  const sameAsRef = ref === fixed;
  const oldMatchesForAscii = pw.split('').every((c) => c.charCodeAt(0) < 128) ? old === ref : 'n/a(unicode)';
  if (!sameAsRef) ok = false;
  console.log(
    `pw=${JSON.stringify(pw).slice(0, 30)} it=${it} dk=${dk}: fixed==ref ${sameAsRef ? 'OK' : 'MISMATCH'} | old==ref ${oldMatchesForAscii}`
  );
}
console.log(ok ? '\nALL CASES MATCH crypto.pbkdf2Sync — fix is byte-exact' : '\nFAILURE');
process.exit(ok ? 0 : 1);
