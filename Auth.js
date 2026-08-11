/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Auth.gs
 * Password-based authentication, sessions and user management
 * ============================================================
 */

/* Point 7: the bootstrap admin password lives ONLY in Script Properties
 * (ADMIN_BOOTSTRAP_PASSWORD) — no credential ships in source. Set it with
 * setAdminBootstrapPassword (admin-gated) or in the Apps Script editor:
 *   PropertiesService.getScriptProperties()
 *     .setProperty('ADMIN_BOOTSTRAP_PASSWORD', '<min 8 chars>');
 * If the property is unset when the bootstrap admin account is first
 * created, a random password is generated, persisted, and emailed to the
 * admin (with a console note) so a fresh deployment still works — the
 * credential is never a hardcoded literal. */
function bootstrapAdminPassword_() {
  try {
    const p = PropertiesService.getScriptProperties().getProperty('ADMIN_BOOTSTRAP_PASSWORD');
    if (p && String(p).length >= 8) return String(p);
  } catch (err) {}
  const generated = 'Bp' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  try { PropertiesService.getScriptProperties().setProperty('ADMIN_BOOTSTRAP_PASSWORD', generated); } catch (err) {}
  console.warn('ADMIN_BOOTSTRAP_PASSWORD was not set; a random bootstrap password was generated and stored in Script Properties. Read it there or from the emailed credentials.');
  return generated;
}

/** Admin-gated: stores the bootstrap admin password in Script Properties so
 *  it never needs to ship in source. Never echoes the value back. Matches the
 *  codebase convention of token-as-last-argument. */
function setAdminBootstrapPassword(password, token) {
  requireAdmin_(token);
  const pw = String(password || '').trim();
  const pwError = validatePassword_(pw);
  if (pwError) return { ok: false, message: pwError };
  PropertiesService.getScriptProperties().setProperty('ADMIN_BOOTSTRAP_PASSWORD', pw);
  return { ok: true, message: 'Bootstrap admin password stored in Script Properties.' };
}

const ADMIN_USERS = [
  "vcharyanaco@gmail.com"
];

const EDITOR_USERS = [
];

const VIEWER_USERS = [
];

const USER_SHEET_HEADERS = ['Email', 'Role', 'Salt', 'PasswordHash', 'MustChange', 'CreatedBy', 'CreatedAt', 'ResetToken', 'ResetExpires', 'Group', 'Department', 'Office', 'Preferences', 'ResetRequested', 'Username', 'Id'];

const USER_COL = Object.freeze({
  EMAIL: 1,
  ROLE: 2,
  SALT: 3,
  PASSWORD_HASH: 4,
  MUST_CHANGE: 5,
  CREATED_BY: 6,
  CREATED_AT: 7,
  RESET_TOKEN: 8,
  RESET_EXPIRES: 9,
  GROUP: 10,
  DEPARTMENT: 11,
  OFFICE: 12,
  PREFERENCES: 13,
  RESET_REQUESTED: 14,
  USERNAME: 15,
  ID: 16
});

/* Fields writable via setUserField_ mapped to their USER_COL (1-based). */
const USER_FIELD_COL = Object.freeze({
  email: USER_COL.EMAIL,
  role: USER_COL.ROLE,
  salt: USER_COL.SALT,
  passwordHash: USER_COL.PASSWORD_HASH,
  mustChange: USER_COL.MUST_CHANGE,
  createdBy: USER_COL.CREATED_BY,
  createdAt: USER_COL.CREATED_AT,
  resetToken: USER_COL.RESET_TOKEN,
  resetExpires: USER_COL.RESET_EXPIRES,
  group: USER_COL.GROUP,
  department: USER_COL.DEPARTMENT,
  office: USER_COL.OFFICE,
  resetRequested: USER_COL.RESET_REQUESTED,
  username: USER_COL.USERNAME
});

function getCurrentUser() {
  try {
    return Session.getActiveUser().getEmail().toLowerCase();
  } catch (err) {
    return "";
  }
}

function getEffectiveUser() {
  try {
    return Session.getEffectiveUser().getEmail().toLowerCase();
  } catch (err) {
    return "";
  }
}


/* ============================================================
 * Helpers
 * ============================================================ */

function isBootstrapAdmin_(email) {
  const list = emailList_(email);
  for (let i = 0; i < list.length; i++) {
    if (ADMIN_USERS.indexOf(list[i]) !== -1) return true;
  }
  return false;
}

/* Splits a stored Email cell (comma-separated aliases) into lowercased,
   trimmed values, dropping empties. A plain single email yields [email]. */
function emailList_(value) {
  return String(value || '')
    .split(',')
    .map(function (e) { return String(e).trim().toLowerCase(); })
    .filter(function (e) { return e; });
}

/* First (primary) alias of a comma-separated list, or '' if none. */
function primaryEmail_(value) {
  const list = emailList_(value);
  return list.length ? list[0] : '';
}

/* True when the two comma-separated email values share at least one alias. */
function emailsOverlap_(a, b) {
  const la = emailList_(a);
  const lb = emailList_(b);
  for (let i = 0; i < la.length; i++) {
    if (lb.indexOf(la[i]) !== -1) return true;
  }
  return false;
}

/* True when the stored cell (comma-separated aliases) contains any alias of the
   query value (which may itself be a comma-separated list). */
function emailsMatch_(storedCell, query) {
  return emailsOverlap_(storedCell, query);
}

/* Validates a possibly comma-separated email value: at least one alias, every
   alias a valid email address. */
function isValidEmailList_(value) {
  const list = emailList_(value);
  if (!list.length) return false;
  return list.every(function (e) { return AppUtils.isValidEmail(e); });
}

function isValidUsername_(username) {
  return /^[A-Za-z0-9._-]{3,30}$/.test(String(username || '').trim());
}

function validatePassword_(password) {
  const pw = String(password || '');
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

function sha256Hex_(input) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(input), Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  }).join('');
}

/* Legacy v1 hasher (salted SHA-256, 500 iterations). Kept ONLY to verify
 * existing accounts; all new hashes are PBKDF2 v2 (see hashPasswordV2_).
 * Legacy hashes are transparently upgraded to v2 on the next successful
 * login, so this function can be deleted once every user has signed in. */
function hashPassword_(password, salt) {
  let hash = sha256Hex_((salt || '') + '|' + (password || ''));
  for (let i = 0; i < 500; i++) {
    hash = sha256Hex_(hash + '|' + (salt || ''));
  }
  return hash;
}

/* ============================================================
 * Point 7: PBKDF2-HMAC-SHA256 password hashing (v2)
 *
 * Apps Script has no native PBKDF2, so we build the standard PBKDF2
 * construction over Utilities.computeHmacSha256Signature (HMAC-SHA256,
 * password as the key). The stored hash records its own iteration count:
 *   "pbkdf2$<iterations>$<hex>"
 * so the iteration count can be raised later without forcing a re-login.
 * ============================================================ */

const PASSWORD_VERSION_V2 = 'pbkdf2';

/** PBKDF2-HMAC-SHA256 (RFC 2898) — dkLen bytes of derived key as hex. */
function pbkdf2HmacSha256_(password, salt, iterations, dkLen) {
  iterations = iterations || CONFIG.USERS.PBKDF2_ITERATIONS;
  dkLen = dkLen || 32;
  const int32be = function (n) {
    return String.fromCharCode((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  };
  const hmac = function (msg) {
    return Array.prototype.slice.call(
      Utilities.computeHmacSha256Signature(msg, String(password), Utilities.Charset.UTF_8)
    );
  };
  const hex = function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  };

  const out = [];
  let blockIndex = 1;
  while (out.length < dkLen) {
    // U1 = PRF(password, salt || INT_32_BE(blockIndex))
    let u = hmac((salt || '') + int32be(blockIndex));
    let t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmac(u);
      t = t.map(function (v, j) { return (v ^ u[j]) & 0xff; });
    }
    out.push.apply(out, t);
    blockIndex++;
  }
  return out.slice(0, dkLen).map(hex).join('');
}

/** Builds a v2 hash string: pbkdf2$<iterations>$<hex>. */
function hashPasswordV2_(password, salt, iterations) {
  const it = iterations || CONFIG.USERS.PBKDF2_ITERATIONS;
  return PASSWORD_VERSION_V2 + '$' + it + '$' + pbkdf2HmacSha256_(password, salt, it, 32);
}

/** True when the stored hash uses the v2 (PBKDF2) format. */
function isV2Hash_(hash) {
  return typeof hash === 'string' && hash.indexOf(PASSWORD_VERSION_V2 + '$') === 0;
}

function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}


/* ============================================================
 * User Store (hidden "Users" sheet in the bound spreadsheet)
 * ============================================================ */

let __usersSheetCache__ = null;

function usersSheet_() {
  if (__usersSheetCache__) return __usersSheetCache__;

  const ss = getSpreadsheet_();
  if (!ss) return null;

  let sh = ss.getSheetByName(CONFIG.USERS.SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(CONFIG.USERS.SHEET_NAME);
    sh.getRange(1, 1, 1, USER_SHEET_HEADERS.length).setValues([USER_SHEET_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, USER_SHEET_HEADERS.length).setFontWeight('bold');
    try { sh.hideSheet(); } catch (err) {}
  } else {
    try {
      const header = sh.getRange(1, 1, 1, USER_SHEET_HEADERS.length).getValues()[0];
      const existing = header.filter(function (h) { return String(h || '').trim() !== ''; });
      if (existing.length < USER_SHEET_HEADERS.length) {
        sh.getRange(1, 1, 1, USER_SHEET_HEADERS.length).setValues([USER_SHEET_HEADERS]);
      }
    } catch (err) {}
  }

  __usersSheetCache__ = sh;
  return sh;
}

/* Generation-bumped Users-sheet cache. Every user mutation (setUserField_,
 * addUserRecord_, deleteUserRecord_, renameUserEmail_) marks the cache dirty
 * (markUserDirty_); outside a batched flow that bumps the counter at once, so
 * cached payloads whose key embeds the old generation are orphaned instantly.
 * Multi-mutation flows (password change, admin update, bulk import) wrap their
 * body in runWithBatchedUserBumps_ so the bumps collapse into a single one —
 * see the helper docs below. The cache lives in CacheService (chunked by
 * payloadCacheWrite_) because the module-level __usersSheetCache__ only
 * survives a single request in GAS. A quota miss just falls back to reading
 * the sheet.
 * NOTE: the cached payload includes the raw sheet rows, i.e. salt + PBKDF2
 * password hashes. That is the same script-scoped trust boundary as the
 * existing getData() cache, but do not mirror this pattern into any other
 * service (e.g. a user-facing cache) without scrubbing credentials first. */
const __USER_GEN_PROP__ = 'dashv1:userGen';

function userGen_() {
  try {
    const g = parseInt(PropertiesService.getScriptProperties().getProperty(__USER_GEN_PROP__) || '1', 10);
    return isFinite(g) && g > 0 ? g : 1;
  } catch (err) { return 1; }
}

function bumpUserGen_() {
  try { PropertiesService.getScriptProperties().setProperty(__USER_GEN_PROP__, String(userGen_() + 1)); } catch (err) {}
}

/* Deferred Users-generation bumps + cache co-write. A multi-mutation flow
 * (password change, admin update, bulk import) used to bump the generation
 * after EVERY cell write — each bump orphaned the cached Users payload, so
 * the next read inside the flow paid a full sheet read (and the cache sat
 * cold during the whole flow). Now, while the cached payload is present, each
 * mutator co-writes its change into the cache under the SAME generation key
 * (see patchUserCache* below), so reads inside the flow hit the cache and a
 * bulk import never re-reads the sheet after its first read — zero bumps in
 * the warm path. Only when the co-write finds no cache (cold/missed) does a
 * mutation fall back to markUserDirty_: inside runWithBatchedUserBumps_ the
 * pending markers accumulate and collapse into a SINGLE bump, flushed in
 * `finally` (so even an error path leaves the cache consistent) or lazily
 * right before any user read (readUserRecords_ calls flushUserBumps_), so the
 * fallback still keeps intra-flow reads fresh (which is what keeps duplicate
 * email/username rows in the same import detected correctly). Outside a
 * batched flow markUserDirty_ bumps immediately, so single-mutation callers
 * (login re-hash, ensureUserRecord_) behave exactly as before. */
let __usersBumpsDeferred__ = false;
let __usersBumpsPending__ = 0;

function markUserDirty_() {
  if (__usersBumpsDeferred__) { __usersBumpsPending__++; return; }
  bumpUserGen_();
}

function flushUserBumps_() {
  if (__usersBumpsPending__ > 0) {
    __usersBumpsPending__ = 0;
    bumpUserGen_();
  }
}

/* Runs fn with user-generation bumps deferred; all mutations performed inside
 * collapse into one bump (flushed on exit, including on throw). Nested calls
 * restore the outer deferral state after flushing their own batch — pending
 * is flushed, never restored (one bump invalidates both batches, so
 * correctness holds even if a flow ever nests wrappers). */
function runWithBatchedUserBumps_(fn) {
  const wasDeferred = __usersBumpsDeferred__;
  __usersBumpsDeferred__ = true;
  try {
    return fn();
  } finally {
    flushUserBumps_();
    __usersBumpsDeferred__ = wasDeferred;
  }
}

function readUserRecords_() {
  flushUserBumps_(); // fallback only: pending exists when a co-write hit no cache (no-op in the warm path)
  const key = 'users:v1:g' + userGen_();
  const hit = payloadCacheRead_(key);
  if (hit) return hit;

  const sh = usersSheet_();
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const rows = sh.getRange(2, 1, lastRow - 1, USER_SHEET_HEADERS.length).getValues();
  payloadCacheWrite_(key, rows, CONFIG.CACHE.COUNTS_TTL_SLOW);
  return rows;
}

/* Cache co-write helpers: keep the cached Users payload (raw sheet rows under
 * the current generation key) in sync with a sheet mutation, so a batched
 * flow (e.g. bulk import) never re-reads the sheet between rows — the next
 * readUserRecords_ hits the same key and finds the mutated row already in
 * place. Each returns true when the cache was present and patched (no
 * generation bump needed), false when there was nothing to patch — the caller
 * then falls back to markUserDirty_ (deferred bump inside a batched flow,
 * immediate otherwise). Matching mirrors emailList_ semantics so comma-separated
 * alias cells resolve like findUserRecord_ does.
 * Concurrency note: co-writing is a cache read-modify-write, so two concurrent
 * requests mutating DIFFERENT users could last-write-wins each other's patch
 * (the sheet keeps both; the cache loses one until TTL). Mutation flows are
 * serialized by runWithLock_, so this is rare, and the 300 s TTL bounds any
 * residual staleness — same eventual-consistency envelope the codebase already
 * accepts for CacheService. Cost note: each co-write serializes the whole
 * payload once; still far cheaper than a sheet re-read for typical user counts. */
function userCacheHandle_() {
  const key = 'users:v1:g' + userGen_();
  const rows = payloadCacheRead_(key);
  return rows ? { key: key, rows: rows } : null;
}

function userCacheRowIndex_(rows, email) {
  const target = String(email || '').toLowerCase().trim();
  if (!target) return -1;
  for (let i = 0; i < rows.length; i++) {
    if (emailList_(rows[i] && rows[i][0]).indexOf(target) !== -1) return i;
  }
  return -1;
}

function patchUserCacheSetField_(email, field, value) {
  const cache = userCacheHandle_();
  if (!cache) return false;
  const col = USER_FIELD_COL[field];
  if (!col) return false;
  const i = userCacheRowIndex_(cache.rows, email);
  if (i === -1) return false;
  cache.rows[i][col - 1] = value;
  payloadCacheWrite_(cache.key, cache.rows, CONFIG.CACHE.COUNTS_TTL_SLOW);
  return true;
}

function patchUserCacheAddRow_(row) {
  const cache = userCacheHandle_();
  if (!cache) return false;
  cache.rows.push(row);
  payloadCacheWrite_(cache.key, cache.rows, CONFIG.CACHE.COUNTS_TTL_SLOW);
  return true;
}

function patchUserCacheRemoveRow_(email) {
  const cache = userCacheHandle_();
  if (!cache) return false;
  const i = userCacheRowIndex_(cache.rows, email);
  if (i === -1) return false;
  cache.rows.splice(i, 1);
  payloadCacheWrite_(cache.key, cache.rows, CONFIG.CACHE.COUNTS_TTL_SLOW);
  return true;
}

function userRecordFromRow_(row) {
  return {
    id: String(row[15] || ''),
    role: row[1] || ROLES.VIEWER,
    salt: row[2] || '',
    passwordHash: row[3] || '',
    mustChange: row[4] === true || String(row[4]).toLowerCase() === 'true',
    createdBy: row[5] || '',
    createdAt: row[6],
    resetToken: row[7] || '',
    resetExpires: row[8] || null,
    group: row[9] || '',
    department: row[10] || '',
    office: row[11] || '',
    preferences: row[12] || '',
    resetRequested: row[13] ? String(row[13]) : '',
    username: row[14] ? String(row[14]) : ''
  };
}

function findUserRecord_(email) {
  if (!emailList_(email).length) return null;

  const rows = readUserRecords_();

  for (let i = 0; i < rows.length; i++) {
    if (emailsMatch_(rows[i][0], email)) {
      const rec = userRecordFromRow_(rows[i]);
      rec.row = i + 2;
      rec.rawEmail = String(rows[i][0] || '').trim();
      rec.email = primaryEmail_(rows[i][0]);
      return rec;
    }
  }

  return null;
}

function findUserByUsername_(username) {
  username = String(username || '').toLowerCase().trim();
  if (!username) return null;

  const rows = readUserRecords_();

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][14] || '').toLowerCase().trim() === username) {
      const rec = userRecordFromRow_(rows[i]);
      rec.row = i + 2;
      rec.rawEmail = String(rows[i][0] || '').trim();
      rec.email = primaryEmail_(rows[i][0]);
      return rec;
    }
  }

  return null;
}

/* Looks a user up by email or username (case-insensitive). The identifier may
   be any comma-separated alias of a stored email cell or the username. Returns
   the record with rec.email set to the canonical primary email. */
function resolveUserByIdentifier_(identifier) {
  identifier = String(identifier || '').toLowerCase().trim();
  if (!identifier) return null;

  const rows = readUserRecords_();

  for (let i = 0; i < rows.length; i++) {
    const rowUsername = String(rows[i][14] || '').toLowerCase().trim();
    if (emailsMatch_(rows[i][0], identifier) || (rowUsername && rowUsername === identifier)) {
      const rec = userRecordFromRow_(rows[i]);
      rec.row = i + 2;
      rec.rawEmail = String(rows[i][0] || '').trim();
      rec.email = primaryEmail_(rows[i][0]);
      return rec;
    }
  }

  return null;
}

function setUserField_(email, field, value) {
  const rec = findUserRecord_(email);
  if (!rec) return;

  const col = USER_FIELD_COL[field];
  if (!col) return;

  const sh = usersSheet_();
  if (sh) sh.getRange(rec.row, col).setValue(value);
  if (!patchUserCacheSetField_(email, field, value)) markUserDirty_();
}

function addUserRecord_(email, role, salt, passwordHash, createdBy, group, department, office, username) {
  const sh = usersSheet_();
  if (!sh) return;
  const row = [
    email,
    role,
    salt,
    passwordHash,
    false,
    createdBy || '',
    new Date(),
    '',
    null,
    group || '',
    department || '',
    office || '',
    '',
    null,
    username || '',
    AppUtils.newEntityId('USER')
  ];
  sh.getRange(sh.getLastRow() + 1, 1, 1, USER_SHEET_HEADERS.length).setValues([row]);
  if (!patchUserCacheAddRow_(row)) markUserDirty_();
}

function deleteUserRecord_(email) {
  const rec = findUserRecord_(email);
  if (!rec) return false;
  const sh = usersSheet_();
  if (!sh) return false;
  sh.deleteRow(rec.row);
  if (!patchUserCacheRemoveRow_(email)) markUserDirty_();
  return true;
}

/* Renames a user's login email in the Users sheet and everywhere the login
   email is referenced functionally: Submissions (submitter + editor lock),
   Tasks (assignee + creator), Notifications (recipient) and Users.createdBy.
   Historical Audit Log rows are
   intentionally left unchanged so the audit trail is not rewritten.
   oldEmail may be a single email or a comma-separated list; every alias is
   replaced. newEmail is the full comma-separated list stored in the Users
   EMAIL cell; the new primary email is written to reference columns. */
function renameUserEmail_(oldEmail, newEmail) {
  oldEmail = String(oldEmail || '').toLowerCase().trim();
  newEmail = String(newEmail || '').toLowerCase().trim();
  if (!oldEmail || !newEmail) return;

  const oldList = emailList_(oldEmail);
  const newPrimary = primaryEmail_(newEmail);
  const matches = function (value) {
    return emailList_(value).some(function (e) { return oldList.indexOf(e) !== -1; });
  };

  const ss = getSpreadsheet_();
  const replaceColumn = function (sheetName, colIndex) {
    try {
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return;
      const lastRow = sh.getLastRow();
      if (lastRow < 2) return;
      const range = sh.getRange(2, colIndex, lastRow - 1, 1);
      const values = range.getValues();
      let changed = false;
      for (let i = 0; i < values.length; i++) {
        if (matches(values[i][0])) {
          values[i][0] = newPrimary;
          changed = true;
        }
      }
      if (changed) range.setValues(values);
    } catch (err) {
      console.warn('renameUserEmail_: could not update ' + sheetName + ' col ' + colIndex + ': ' + err);
    }
  };

  replaceColumn(CONFIG.SUBMISSIONS.SHEET_NAME, SUBMISSION_COL.EMAIL);
  replaceColumn(CONFIG.SUBMISSIONS.SHEET_NAME, SUBMISSION_COL.LOCKED_BY);
  replaceColumn(CONFIG.TASKS.SHEET_NAME, TASK_COL.ASSIGNEE);
  replaceColumn(CONFIG.TASKS.SHEET_NAME, TASK_COL.CREATED_BY);
  replaceColumn(CONFIG.NOTIFICATIONS.SHEET_NAME, NOTIFICATION_COL.EMAIL);

  const sh = usersSheet_();
  if (!sh) return;

  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const emRange = sh.getRange(2, USER_COL.EMAIL, lastRow - 1, 1);
    const emValues = emRange.getValues();
    for (let i = 0; i < emValues.length; i++) {
      if (matches(emValues[i][0])) {
        emValues[i][0] = newEmail;
        emRange.setValues(emValues);
        break;
      }
    }

    const cbRange = sh.getRange(2, USER_COL.CREATED_BY, lastRow - 1, 1);
    const cbValues = cbRange.getValues();
    let changed = false;
    for (let i = 0; i < cbValues.length; i++) {
      if (matches(cbValues[i][0])) {
        cbValues[i][0] = newPrimary;
        changed = true;
      }
    }
    if (changed) cbRange.setValues(cbValues);
  }

  // Keep the cached Users payload in sync (same email / createdBy rewrites as
  // the sheet above). Only fall back to a generation bump when the cache was
  // absent; the other cache families are orphaned regardless.
  let cachePatched = false;
  const cache = userCacheHandle_();
  if (cache) {
    for (let i = 0; i < cache.rows.length; i++) {
      if (matches(cache.rows[i] && cache.rows[i][0])) {
        cache.rows[i][0] = newEmail;
        cachePatched = true;
        break;
      }
    }
    for (let i = 0; i < cache.rows.length; i++) {
      if (matches(cache.rows[i] && cache.rows[i][USER_COL.CREATED_BY - 1])) {
        cache.rows[i][USER_COL.CREATED_BY - 1] = newPrimary;
        cachePatched = true;
      }
    }
    if (cachePatched) payloadCacheWrite_(cache.key, cache.rows, CONFIG.CACHE.COUNTS_TTL_SLOW);
  }
  if (!cachePatched) { try { markUserDirty_(); } catch (err) {} }
  try { invalidateCounts_('tasks'); invalidateCounts_('notif'); invalidateCounts_('submissions'); } catch (err) {}
}

function listUserRecords_() {
  const out = [];
  // Reuses the generation-bumped cached read (no second sheet pass).
  const values = readUserRecords_();
  if (!values || !values.length) return out;

  for (let i = 0; i < values.length; i++) {
    if (!String(values[i][0] || '').trim()) continue;
    out.push({
      id: String(values[i][15] || ''),
      email: String(values[i][0] || '').trim(),
      emailList: emailList_(values[i][0]),
      primaryEmail: primaryEmail_(values[i][0]),
      role: values[i][1] || ROLES.VIEWER,
      mustChange: values[i][4] === true || String(values[i][4]).toLowerCase() === 'true',
      createdAt: values[i][6] ? String(values[i][6]) : '',
      group: values[i][9] || '',
      department: values[i][10] || '',
      office: values[i][11] || '',
      resetRequested: values[i][13] ? String(values[i][13]) : '',
      username: values[i][14] ? String(values[i][14]) : ''
    });
  }

  return out;
}

function ensureUserRecord_(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return;
  if (!isBootstrapAdmin_(email)) return;

  runWithLock_(function () {
    let rec = findUserRecord_(email);
    if (!rec) {
      const salt = generateSalt_();
      const pw = bootstrapAdminPassword_();
      addUserRecord_(email, ROLES.ADMIN, salt, hashPasswordV2_(pw, salt), 'system');
      setUserField_(email, 'mustChange', true);
      try {
        sendMail_(email, 'Your India Post Dashboard admin account',
          'Your dashboard administrator account was created.\n\n' +
          '  Email: ' + email + '\n' +
          '  Password: ' + pw + '\n\n' +
          'You will be asked to choose a new password on first login.');
      } catch (err) {}
      rec = findUserRecord_(email);
    }
    if (rec && !String(rec.username || '').trim()) {
      setUserField_(email, 'username', 'co_admin');
    }
  });
}

function verifyPasswordRecord_(rec, password) {
  if (!rec || !rec.salt || !rec.passwordHash) return false;
  const hash = String(rec.passwordHash);
  if (isV2Hash_(hash)) {
    const parts = hash.split('$');
    const iterations = parseInt(parts[1], 10);
    const expected = parts[2] || '';
    if (!isFinite(iterations) || iterations <= 0) return false;
    return pbkdf2HmacSha256_(password, rec.salt, iterations, 32) === expected;
  }
  // Legacy v1 hash (salted SHA-256, 500 iterations) — verify, then upgrade.
  return hashPassword_(password, rec.salt) === hash;
}

function verifyPassword_(email, password) {
  return verifyPasswordRecord_(findUserRecord_(email), password);
}


/* ============================================================
 * Sessions (CacheService tokens, TTL 6 hours)
 * ============================================================ */

/* ============================================================
 * Point 7: per-user session epoch
 *
 * Bumped when a user's password changes, role changes, or the account is
 * deleted — every session minted before the bump becomes invalid at once.
 * Sessions created before this feature shipped carry a legacy plain-email
 * value and are accepted until they expire (<= 6h), so the rollout does not
 * log anyone out.
 * ============================================================ */

function sessionEpoch_(email) {
  try {
    const props = PropertiesService.getScriptProperties();
    return String(props.getProperty('sessEpoch_' + AppUtils.safeCacheKey(email)) || '0');
  } catch (err) {
    return '0';
  }
}

function bumpSessionEpoch_(email) {
  try {
    PropertiesService.getScriptProperties().setProperty('sessEpoch_' + AppUtils.safeCacheKey(email), String(Date.now()));
  } catch (err) {}
}

function createSession_(email) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const value = String(email).toLowerCase() + '|' + sessionEpoch_(email);
  CacheService.getScriptCache().put('session_' + token, value, CONFIG.USERS.SESSION_TTL_SECONDS);
  return token;
}

function sessionEmail_(token) {
  if (!token) return null;
  const value = CacheService.getScriptCache().get('session_' + String(token));
  if (!value) return null;
  const pipe = value.indexOf('|');
  if (pipe === -1) return value; // legacy session (pre-epoch) — accepted until TTL
  const email = value.substring(0, pipe);
  const epoch = value.substring(pipe + 1);
  if (epoch !== sessionEpoch_(email)) return null; // invalidated by epoch bump
  return email;
}

/* ============================================================
 * Point 7: generic rate limiting (CacheService sliding counter)
 * ============================================================ */

/** Throws when the caller has exceeded maxAttempts within windowSeconds. */
function checkRateLimit_(key, maxAttempts, windowSeconds) {
  const cache = CacheService.getScriptCache();
  const k = 'rl_' + key;
  const count = Number(cache.get(k) || 0);
  if (count >= maxAttempts) {
    throw clientError_('Too many requests. Please try again later.');
  }
  cache.put(k, String(count + 1), windowSeconds || 60);
}

function destroySession_(token) {
  if (token) CacheService.getScriptCache().remove('session_' + String(token));
}


/* ============================================================
 * Login attempt throttling
 * ============================================================ */

function recordFailedAttempt_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail_' + AppUtils.safeCacheKey(email);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 60 * CONFIG.USERS.LOCK_MINUTES);
  return count;
}

function isAttemptBlocked_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail_' + AppUtils.safeCacheKey(email);
  return Number(cache.get(key) || 0) >= CONFIG.USERS.MAX_LOGIN_ATTEMPTS;
}

function clearAttempts_(email) {
  CacheService.getScriptCache().remove('loginfail_' + AppUtils.safeCacheKey(email));
}


/* ============================================================
 * Authorization
 * ============================================================ */

let __roleCache__ = null;

function getUserRole(email) {
  email = String(email || getCurrentUser() || '').toLowerCase().trim();
  if (!email) return ROLES.VIEWER;

  if (!__roleCache__) __roleCache__ = {};
  if (__roleCache__[email]) return __roleCache__[email];

  const rec = findUserRecord_(email);
  let role = ROLES.VIEWER;
  if (rec && rec.role) role = rec.role;
  else if (ADMIN_USERS.indexOf(email) !== -1) role = ROLES.ADMIN;
  else if (EDITOR_USERS.indexOf(email) !== -1) role = ROLES.EDITOR;
  else if (VIEWER_USERS.indexOf(email) !== -1) role = ROLES.VIEWER;

  __roleCache__[email] = role;
  return role;
}

function isAdmin(email) {
  return getUserRole(email) === ROLES.ADMIN;
}

function isEditor(email) {
  const role = getUserRole(email);
  return role === ROLES.ADMIN || role === ROLES.EDITOR;
}
/* ============================================================
 * Granular RBAC (permission matrix + user groups)
 * ============================================================ */

let __groupsCache__ = null;

function getUserGroups(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return [];

  if (!__groupsCache__) __groupsCache__ = {};
  if (__groupsCache__[email]) return __groupsCache__[email];

  const rec = findUserRecord_(email);
  const groups = String((rec && rec.group) || '')
    .split(',')
    .map(function (g) { return String(g).toUpperCase().trim(); })
    .filter(function (g) { return g && USER_GROUP_KEYS.indexOf(g) !== -1; });

  __groupsCache__[email] = groups;
  return groups;
}

function rolePermissions_(role) {
  return PERMISSIONS[role] || PERMISSIONS[ROLES.VIEWER] || {};
}

function groupPermissions_(groups) {
  const merged = {};
  groups.forEach(function (g) {
    const grants = (USER_GROUPS[g] && USER_GROUPS[g].permissions) || {};
    Object.keys(grants).forEach(function (module) {
      if (!merged[module]) merged[module] = [];
      grants[module].forEach(function (action) {
        if (merged[module].indexOf(action) === -1) merged[module].push(action);
      });
    });
  });
  return merged;
}

/**
 * Builds the effective permission set (module -> actions) for an email by
 * unioning the role matrix with any group grants.
 * @param {string} email User email.
 * @returns {{Object<string, string[]>}}
 */
function getUserPermissions(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return {};

  const role = getUserRole(email);
  const rolePerms = rolePermissions_(role);
  const groupPerms = groupPermissions_(getUserGroups(email));

  const out = {};
  Object.keys(rolePerms).forEach(function (module) {
    const set = [];
    (rolePerms[module] || []).forEach(function (a) {
      if (set.indexOf(a) === -1) set.push(a);
    });
    (groupPerms[module] || []).forEach(function (a) {
      if (set.indexOf(a) === -1) set.push(a);
    });
    out[module] = set;
  });
  Object.keys(groupPerms).forEach(function (module) {
    if (!out[module]) out[module] = (groupPerms[module] || []).slice();
  });

  return out;
}

function hasModulePermission_(module) {
  return MODULES[module] !== undefined || Object.prototype.hasOwnProperty.call(MODULES, module);
}

/**
 * Checks whether a user holds a given module/action permission. Uses the
 * caller identity when no email is supplied (best-effort, for server-side
 * helpers running in the deploying user's context).
 * @param {string} email User email.
 * @param {string} module One of MODULES.
 * @param {string} action One of MODULE_ACTIONS.
 * @returns {boolean}
 */
/**
 * Full identity + permission context for a user.
 * @param {string} email User email.
 * @returns {{email: string, role: string, group: string, department: string, office: string, groups: string[], permissions: Object<string, string[]>}}
 */
function getUserContext(email) {
  email = String(email || '').toLowerCase().trim();
  const rec = findUserRecord_(email) || {};
  return {
    email: email,
    username: rec.username || '',
    role: getUserRole(email),
    group: rec.group || '',
    department: rec.department || '',
    office: rec.office || '',
    groups: getUserGroups(email),
    permissions: getUserPermissions(email)
  };
}

function authenticate_(token) {
  const email = sessionEmail_(token);
  if (!email) throw clientError_('Login required. Please log in again.');
  return { email: email, role: getUserRole(email) };
}

function requireLogin_(token) {
  return authenticate_(token);
}

function requireEditor_(token) {
  const user = requireLogin_(token);
  if (!isEditor(user.email)) throw clientError_('Editor permission required.');
  return user;
}

function requireAdmin_(token) {
  const user = requireLogin_(token);
  if (!isAdmin(user.email)) throw clientError_('Admin permission required.');
  return user;
}
function requireEditor() {
  if (!isEditor()) throw clientError_('Editor permission required.');
}

function requireViewer() {
  return true;
}


/* ============================================================
 * Login / Logout / Session
 * ============================================================ */

/**
 * Authenticates a user and issues a session token (6h TTL). The identifier may
 * be the user's email OR username. Login failures are throttled (max attempts /
 * lock minutes in CONFIG.USERS).
 * @param {string} identifier User email or username.
 * @param {string} password Plain-text password.
 * @returns {{success: boolean, message?: string, token?: string, mustChange?: boolean, user?: Object}}
 */
function login(identifier, password) {
  identifier = String(identifier || '').toLowerCase().trim();

  if (!identifier) {
    return { success: false, message: 'Enter your email or username.' };
  }
  if (!password) {
    return { success: false, message: 'Enter your password.' };
  }
  // Sliding-window brute-force guard (Point 7). GAS web apps cannot see the
  // client IP, so the key is the lower-cased identifier — an attacker needs a
  // fresh email/username per 5 attempts within a minute. This runs BEFORE the
  // per-email lockout below, and a hit here returns a clean object (not a
  // thrown error) so doPost's generic-error sanitisation never masks it.
  try {
    checkRateLimit_('login_' + AppUtils.safeCacheKey(identifier), CONFIG.RATE_LIMIT.LOGIN_MAX, CONFIG.RATE_LIMIT.LOGIN_WINDOW);
  } catch (err) {
    return { success: false, message: 'Too many login attempts. Please try again in a minute.' };
  }
  if (isAttemptBlocked_(identifier)) {
    return {
      success: false,
      message: 'Too many failed attempts. Try again in ' + CONFIG.USERS.LOCK_MINUTES + ' minutes.'
    };
  }

  let rec = resolveUserByIdentifier_(identifier);

  if (!rec && AppUtils.isValidEmail(identifier) && isBootstrapAdmin_(identifier)) {
    ensureUserRecord_(identifier);
    rec = findUserRecord_(identifier);
  }

  if (!rec || !verifyPasswordRecord_(rec, password)) {
    recordFailedAttempt_(identifier);
    return { success: false, message: 'Invalid email, username or password.' };
  }

  clearAttempts_(identifier);

  const email = rec.email;

  // Point 7: transparently upgrade legacy (v1) hashes to PBKDF2 on login, and
  // re-hash v2 hashes whose stored iteration count differs from the current
  // CONFIG (e.g. the 10000 -> 3000 tuning) — existing users pick up the
  // faster setting on their next sign-in, no password change required.
  const storedIterations = isV2Hash_(rec.passwordHash) ? parseInt(rec.passwordHash.split('$')[1], 10) : 0;
  if (!isV2Hash_(rec.passwordHash) || storedIterations !== CONFIG.USERS.PBKDF2_ITERATIONS) {
    try {
      setUserField_(email, 'passwordHash', hashPasswordV2_(password, rec.salt, CONFIG.USERS.PBKDF2_ITERATIONS));
    } catch (err) {}
  }

  const token = createSession_(email);
  try { logAudit_(ACTIONS.LOGIN, '', 'Signed in', email); } catch (err) {}

  const context = getUserContext(email);
  return {
    success: true,
    token: token,
    mustChange: rec.mustChange === true,
    user: {
      email: email,
      username: rec.username || '',
      role: context.role,
      loggedIn: true,
      group: context.group,
      department: context.department,
      office: context.office,
      groups: context.groups,
      permissions: context.permissions
    }
  };
}

/**
 * Destroys a session token.
 * @param {string} token The session token to invalidate.
 * @returns {{success: boolean}}
 */
function logout(token) {
  destroySession_(token);
  return { success: true };
}

/**
 * Validates a session token without mutating state.
 * @param {string} token The session token.
 * @returns {{success: boolean, user?: Object, message?: string}}
 */
function validateSession(token) {
  try {
    const user = authenticate_(token);
    return { success: true, user: user };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


/* ============================================================
 * Password Reset (admin request)
 * ============================================================ */

/**
 * Starts a password reset request: flags the user in the Users sheet and
 * notifies the staff (admins/editors) so an administrator can reset the
 * password from Settings. No email is sent. Always returns a generic
 * response to avoid account enumeration.
 * @param {string} identifier User email or username.
 * @returns {{success: boolean, message: string}}
 */
function requestPasswordReset(identifier) {
  identifier = String(identifier || '').toLowerCase().trim();

  if (!identifier) {
    return { success: false, message: 'Enter your email or username.' };
  }

  checkRateLimit_('pwreset_' + AppUtils.safeCacheKey(identifier), CONFIG.RATE_LIMIT.PASSWORD_RESET_MAX, CONFIG.RATE_LIMIT.PASSWORD_RESET_WINDOW);

  const rec = resolveUserByIdentifier_(identifier);
  if (!rec) {
    return { success: true, message: 'If an account exists, your administrator has been notified.' };
  }
  const email = rec.email;

  runWithLock_(function () {
    setUserField_(email, 'resetRequested', new Date());
    setUserField_(email, 'resetToken', '');
    setUserField_(email, 'resetExpires', null);
    notifyStaff_(NOTIFICATION_TYPES.USER, 'Password reset requested', 'The user ' + email + ' requested a password reset. Open Settings to review the request.', '');
  });

  try {
    logAudit_(ACTIONS.PASSWORD_RESET_REQUESTED, '', 'Reset requested; administrator notified', email);
  } catch (err) {}

  // Email notification to the primary admin account(s) so the request is not
  // missed when nobody has the dashboard open.
  const resetBody = 'A password reset was requested for the dashboard user:\n\n' +
    '  Email: ' + email + '\n' +
    '  Time:  ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm') + '\n\n' +
    'Open the dashboard Settings → Manage users to review and reset the password.';
  ADMIN_USERS.forEach(function (adminEmail) {
    adminEmail = String(adminEmail || '').toLowerCase().trim();
    if (adminEmail && adminEmail !== email) {
      try { sendMail_(adminEmail, 'Password reset requested — India Post Dashboard', resetBody); } catch (err) {}
    }
  });

  return { success: true, message: 'A reset request has been sent to your administrator.' };
}

/**
 * Changes the logged-in user's password after verifying the current one.
 * @param {string} currentPassword The user's current password.
 * @param {string} newPassword New password (min 8 chars).
 * @param {string} token Session token (login required).
 * @returns {{success: boolean, message: string}}
 */
function changePassword(currentPassword, newPassword, token) {
  const user = requireLogin_(token);
  checkRateLimit_('chpw_' + AppUtils.safeCacheKey(user.email), CONFIG.RATE_LIMIT.PASSWORD_CHANGE_MAX, CONFIG.RATE_LIMIT.PASSWORD_CHANGE_WINDOW);

  if (!verifyPassword_(user.email, currentPassword)) {
    return { success: false, message: 'Current password is incorrect.' };
  }

  const pwError = validatePassword_(newPassword);
  if (pwError) return { success: false, message: pwError };

  runWithLock_(function () {
    runWithBatchedUserBumps_(function () {
      const salt = generateSalt_();
      setUserField_(user.email, 'salt', salt);
      setUserField_(user.email, 'passwordHash', hashPasswordV2_(newPassword, salt, CONFIG.USERS.PBKDF2_ITERATIONS));
      setUserField_(user.email, 'mustChange', false);
      setUserField_(user.email, 'resetToken', '');
      setUserField_(user.email, 'resetExpires', null);
      setUserField_(user.email, 'resetRequested', null);
    });
  });

  bumpSessionEpoch_(user.email); // invalidate the user's other sessions
  try { logAudit_(ACTIONS.CHANGE_PASSWORD, '', '', user.email); } catch (err) {}
  try { notify_(user.email, NOTIFICATION_TYPES.USER, 'Password changed', 'Your dashboard password was changed successfully.', ''); } catch (err) {}
  return { success: true, message: 'Password updated.' };
}


/* ============================================================
 * Admin: User Management
 * ============================================================ */

/**
 * Lists all user records (email, role, mustChange, createdAt).
 * @param {string} token Session token (admin required).
 * @returns {Object[]} User records without credentials.
 */
function adminGetUsers(token) {
  requireAdmin_(token);
  return listUserRecords_();
}

/**
 * Gets a list of users who can be assigned tasks.
 * @param {string} token Session token (editor+ required).
 * @returns {Object[]} User records with email and username for assignment.
 */
function getAssignableUsers(token) {
  requireEditor_(token);
  return listUserRecords_().map(function (u) {
    return {
      email: u.email,
      username: u.username || '',
      role: u.role
    };
  });
}

/**
 * Creates a new user account.
 * @param {string} email New user email.
 * @param {string} username Optional username (3-30 chars: letters, digits, . _ -); must be unique.
 * @param {string} role One of ROLES.VIEWER / ROLES.EDITOR / ROLES.ADMIN.
 * @param {string} password Initial password (min 8 chars).
 * @param {string} group Optional comma-separated group names (USER_GROUPS).
 * @param {string} department Optional department (data-scoping + metadata).
 * @param {string} office Optional office (data-scoping + metadata).
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Updated user list.
 */
function adminAddUser(email, username, role, password, group, department, office, token) {
  const admin = requireAdmin_(token);
  checkRateLimit_('adminuser_' + AppUtils.safeCacheKey(admin.email), CONFIG.RATE_LIMIT.ADMIN_USER_MAX, CONFIG.RATE_LIMIT.ADMIN_USER_WINDOW);

  return runWithLock_(function () {
    return runWithBatchedUserBumps_(function () {
      email = String(email || '').toLowerCase().trim();
      username = String(username || '').trim();
      role = String(role || '').toUpperCase().trim();

      if (!isValidEmailList_(email)) throw clientError_('Invalid email address(es).');
      if (username && !isValidUsername_(username)) throw clientError_('Username must be 3-30 characters (letters, digits, dot, underscore, hyphen).');
      if ([ROLES.VIEWER, ROLES.EDITOR, ROLES.ADMIN].indexOf(role) === -1) throw clientError_('Role must be VIEWER, EDITOR or ADMIN.');

      if (findUserRecord_(email)) throw clientError_('A user with that email already exists.');
      if (username && findUserByUsername_(username)) throw clientError_('Username already taken.');

      const pwError = validatePassword_(password);
      if (pwError) throw clientError_(pwError);

      const salt = generateSalt_();
      addUserRecord_(email, role, salt, hashPasswordV2_(password, salt, CONFIG.USERS.PBKDF2_ITERATIONS), admin.email, group, department, office, username);

      try { logAudit_(ACTIONS.USER_ADD, '', email + ' as ' + role, admin.email); } catch (err) {}
      try { notify_(email, NOTIFICATION_TYPES.USER, 'Account created', 'Your dashboard account was created with the ' + role + ' role. Use the credentials given by your administrator.', ''); } catch (err) {}

      // Email the new user their account credentials so they can sign in.
      try {
        sendMail_(
          email,
          'Your India Post Dashboard account',
          'An administrator created a dashboard account for you.\n\n' +
          '  Email: ' + email + '\n' +
          (username ? '  Username: ' + username + '\n' : '') +
          '  Role: ' + role + '\n' +
          '  Password: ' + password + '\n\n' +
          'Sign in at https://www.dashboardharyana.site/app.html and change your password after first login.'
        );
      } catch (err) {}

      return listUserRecords_();
    });
  });
}

/**
 * Updates a user's email / username / role / group / department / office.
 * Email changes propagate to every sheet that references the login email
 * (Submissions, Tasks, Notifications, Users.createdBy); the Audit
 * Log keeps the original email for history. Role changes are protected: the
 * bootstrap admin is immutable and the last admin cannot be demoted.
 * @param {string} email Email of the target user (current email unless f.email is set).
 * @param {Object} fields { email?, username?, role?, group?, department?, office? } new values.
 * @param {string} token Session token (admin required).
 * @returns {{users: Object[], reAuth: boolean, message: string}} Updated list + flags.
 */
function adminUpdateUser(email, fields, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    return runWithBatchedUserBumps_(function () {
      email = String(email || '').toLowerCase().trim();
      if (!findUserRecord_(email)) throw clientError_('User not found.');

      const f = fields || {};
      const changes = [];
      let reAuth = false;

      if (f.email !== undefined) {
        const newEmail = String(f.email || '').toLowerCase().trim();
        const currentRec = findUserRecord_(email);
        const oldRaw = currentRec ? currentRec.rawEmail : email;
        const oldPrimary = primaryEmail_(oldRaw);
        const changed = (emailList_(newEmail).join(',') !== emailList_(oldRaw).join(','));
        if (changed) {
          if (!isValidEmailList_(newEmail)) throw clientError_('Invalid email address(es).');
          if (isBootstrapAdmin_(oldPrimary) && primaryEmail_(newEmail) !== oldPrimary) {
            throw clientError_('The primary admin account email cannot be changed.');
          }
          const collides = findUserRecord_(newEmail);
          if (collides && (!currentRec || collides.row !== currentRec.row)) {
            throw clientError_('A user with that email already exists.');
          }

          renameUserEmail_(oldRaw, newEmail);
          bumpSessionEpoch_(oldPrimary); // Point 7: email change invalidates the old identity's sessions
          changes.push('email ' + oldRaw + ' -> ' + newEmail);
          try { notify_(primaryEmail_(newEmail), NOTIFICATION_TYPES.USER, 'Account updated', 'Your dashboard login email was changed to ' + newEmail + ' by an administrator.', ''); } catch (err) {}
          if (oldPrimary === admin.email) {
            destroySession_(token);
            reAuth = true;
          }
          email = newEmail;
        }
      }

      if (f.role !== undefined) {
        const role = String(f.role || '').toUpperCase().trim();
        if ([ROLES.VIEWER, ROLES.EDITOR, ROLES.ADMIN].indexOf(role) === -1) throw clientError_('Role must be VIEWER, EDITOR or ADMIN.');
        if (isBootstrapAdmin_(email)) throw clientError_('The primary admin account role cannot be changed.');
        if (primaryEmail_(email) === admin.email && role !== ROLES.ADMIN) throw clientError_('You cannot change your own role.');
        if (role !== ROLES.ADMIN && getUserRole(email) === ROLES.ADMIN) {
          const adminCount = listUserRecords_().filter(function (u) { return u.role === ROLES.ADMIN; }).length;
          if (adminCount <= 1) throw clientError_('Cannot demote the last admin.');
        }
        if (getUserRole(email) !== role) {
          setUserField_(email, 'role', role);
          bumpSessionEpoch_(email); // Point 7: role changes invalidate existing sessions
          changes.push('role -> ' + role);
          try { notify_(email, NOTIFICATION_TYPES.USER, 'Role changed', 'Your dashboard role was changed to ' + role + ' by an administrator.', ''); } catch (err) {}
        }
      }

      if (f.username !== undefined) {
        const uname = String(f.username || '').trim();
        if (uname && !isValidUsername_(uname)) throw clientError_('Username must be 3-30 characters (letters, digits, dot, underscore, hyphen).');
        const holder = uname ? findUserByUsername_(uname) : null;
        if (holder && primaryEmail_(holder.email) !== primaryEmail_(email)) throw clientError_('Username already taken.');
        setUserField_(email, 'username', uname);
        changes.push('username updated');
      }
      if (f.group !== undefined) setUserField_(email, 'group', String(f.group || ''));
      if (f.department !== undefined) setUserField_(email, 'department', String(f.department || ''));
      if (f.office !== undefined) setUserField_(email, 'office', String(f.office || ''));

      const summary = changes.length ? changes.join(', ') : 'metadata updated';
      try { logAudit_(ACTIONS.USER_UPDATE, '', email + ' (' + summary + ')', admin.email); } catch (err) {}

      return {
        users: listUserRecords_(),
        reAuth: reAuth,
        message: changes.length ? 'User updated: ' + summary : 'No changes were made.'
      };
    });
  });
}

/**
 * Exports all users as CSV (Email, Role, Group, Department, Office, CreatedAt, MustChange).
 * @param {string} token Session token (admin required).
 * @returns {string} CSV content.
 */
function adminExportUsers(token) {
  requireAdmin_(token);
  const users = listUserRecords_();
  const header = ['Email', 'Username', 'Role', 'Group', 'Department', 'Office', 'CreatedAt', 'MustChange'];
  const lines = users.map(function (u) {
    return [
      u.email,
      u.username || '',
      u.role,
      u.group || '',
      u.department || '',
      u.office || '',
      u.createdAt || '',
      u.mustChange ? 'TRUE' : 'FALSE'
    ].map(function (cell) {
      const s = String(cell == null ? '' : cell);
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',');
  });
  return [header.map(function (h) { return '"' + h + '"'; }).join(',')].concat(lines).join('\n');
}

function parseCsvLine_(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

/**
 * Bulk-imports users from CSV. Expected columns:
 * Email, Role, Group, Department, Office, [Password], [Username].
 * New users without a password get a random one and must change it on login;
 * existing users are updated for username/group/department/office (and password if given).
 * @param {string} csv CSV content (first row may be a header row).
 * @param {string} token Session token (admin required).
 * @returns {{users: Object[], added: number, updated: number, errors: string[]}}
 */
function adminImportUsers(csv, token) {
  const admin = requireAdmin_(token);
  checkRateLimit_('adminuser_' + AppUtils.safeCacheKey(admin.email), CONFIG.RATE_LIMIT.ADMIN_USER_MAX, CONFIG.RATE_LIMIT.ADMIN_USER_WINDOW);

  const result = { users: listUserRecords_(), added: 0, updated: 0, errors: [] };
  if (!csv || !String(csv).trim()) throw clientError_('Paste CSV content to import.');

  return runWithLock_(function () {
    return runWithBatchedUserBumps_(function () {
      const lines = String(csv)
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter(function (l) { return String(l).trim() !== ''; });

      if (!lines.length) throw clientError_('No rows to import.');

      const rows = lines.map(parseCsvLine_);

      for (let r = 0; r < rows.length; r++) {
        const cols = rows[r];
        const email = String(cols[0] || '').toLowerCase().trim();
        const role = String(cols[1] || '').toUpperCase().trim();

        if (r === 0 && !isValidEmailList_(email)) continue;

        if (!email) { result.errors.push('Row ' + (r + 1) + ': missing email.'); continue; }
        if (!isValidEmailList_(email)) { result.errors.push('Row ' + (r + 1) + ': invalid email "' + email + '".'); continue; }
        if ([ROLES.VIEWER, ROLES.EDITOR, ROLES.ADMIN].indexOf(role) === -1) {
          result.errors.push('Row ' + (r + 1) + ': invalid role "' + (role || '') + '".');
          continue;
        }

        const group = String(cols[2] || '').trim();
        const department = String(cols[3] || '').trim();
        const office = String(cols[4] || '').trim();
        const password = String(cols[5] || '').trim();
        const username = String(cols[6] || '').trim();

        if (username && !isValidUsername_(username)) {
          result.errors.push('Row ' + (r + 1) + ': invalid username "' + username + '".');
          continue;
        }

        const existing = findUserRecord_(email);

        if (existing) {
          if (username) {
            const holder = findUserByUsername_(username);
            if (holder && holder.email !== email) {
              result.errors.push('Row ' + (r + 1) + ': username "' + username + '" already taken.');
              continue;
            }
            setUserField_(email, 'username', username);
          }
          if (group) setUserField_(email, 'group', group);
          if (department) setUserField_(email, 'department', department);
          if (office) setUserField_(email, 'office', office);
          if (password) {
            const pwError = validatePassword_(password);
            if (pwError) { result.errors.push('Row ' + (r + 1) + ': ' + pwError); continue; }
            const salt = generateSalt_();
            setUserField_(email, 'salt', salt);
            setUserField_(email, 'passwordHash', hashPasswordV2_(password, salt, CONFIG.USERS.PBKDF2_ITERATIONS));
            setUserField_(email, 'mustChange', false);
          }
          result.updated++;
        } else {
          const pw = password || Utilities.getUuid().replace(/-/g, '').slice(0, 12);
          const pwError = validatePassword_(pw);
          if (pwError) { result.errors.push('Row ' + (r + 1) + ': ' + pwError); continue; }
          if (username && findUserByUsername_(username)) {
            result.errors.push('Row ' + (r + 1) + ': username "' + username + '" already taken.');
            continue;
          }
          const salt = generateSalt_();
          addUserRecord_(email, role, salt, hashPasswordV2_(pw, salt, CONFIG.USERS.PBKDF2_ITERATIONS), admin.email, group, department, office, username);
          if (!password) setUserField_(email, 'mustChange', true);
          result.added++;
          try { notify_(email, NOTIFICATION_TYPES.USER, 'Account created', 'Your dashboard account was created with the ' + role + ' role during a bulk import.', ''); } catch (err) {}

          // Email the imported user their credentials so they can sign in.
          try {
            sendMail_(
              email,
              'Your India Post Dashboard account',
              'An administrator created a dashboard account for you (bulk import).\n\n' +
              '  Email: ' + email + '\n' +
              (username ? '  Username: ' + username + '\n' : '') +
              '  Role: ' + role + '\n' +
              '  Password: ' + pw + '\n\n' +
              'Sign in at https://www.dashboardharyana.site/app.html and change your password after first login.'
            );
          } catch (err) {}
        }
      }

      try {
        logAudit_(ACTIONS.USER_IMPORT, '', 'Imported users: +' + result.added + ' added, ' + result.updated + ' updated, ' + result.errors.length + ' errors', admin.email);
      } catch (err) {}

      result.users = listUserRecords_();
      return result;
    });
  });
}

/**
 * Aggregates user activity from the audit log: per-user action/login counts,
 * most recent events, and overall totals.
 * @param {string} token Session token (admin required).
 * @returns {{users: Object[], recent: Object[], totals: Object}}
 */
function adminGetUserActivity(token) {
  requireAdmin_(token);

  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { users: [], recent: [], totals: { events: 0, logins: 0, activeUsers: 0 } };
  }

  const startRow = Math.max(2, lastRow - CONFIG.USERS.ACTIVITY_LIMIT + 1);
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();

  const parsed = values.map(function (row) {
    return {
      ts: auditTimestampMs_(row[0]),
      timestamp: row[0] ? row[0].toString() : '',
      email: String(row[1] || '').toLowerCase().trim() || '(system)',
      action: String(row[2] || ''),
      recordId: row[3] || '',
      details: row[4] || ''
    };
  });

  parsed.sort(function (a, b) { return b.ts - a.ts; });

  const recent = parsed.slice(0, 30).map(function (row) {
    return { timestamp: row.timestamp, user: row.email, action: row.action, recordId: row.recordId, details: row.details };
  });

  const perUser = {};
  let logins = 0;

  parsed.forEach(function (row) {
    if (!perUser[row.email]) {
      perUser[row.email] = { email: row.email, actions: 0, logins: 0, lastSeenMs: -1, lastSeen: '' };
    }
    perUser[row.email].actions++;
    if (row.ts > perUser[row.email].lastSeenMs) {
      perUser[row.email].lastSeenMs = row.ts;
      perUser[row.email].lastSeen = row.timestamp;
    }
    if (row.action === ACTIONS.LOGIN) {
      perUser[row.email].logins++;
      logins++;
    }
  });

  const userList = Object.keys(perUser)
    .map(function (k) { return perUser[k]; })
    .sort(function (a, b) { return b.actions - a.actions; });

  return {
    users: userList,
    recent: recent,
    totals: { events: values.length, logins: logins, activeUsers: userList.length }
  };
}

/**
 * Deletes a user account (own account and the bootstrap admin are protected).
 * @param {string} email Email of the user to delete.
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Updated user list.
 */
function adminDeleteUser(email, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    email = String(email || '').toLowerCase().trim();

    if (primaryEmail_(email) === admin.email) throw clientError_('You cannot delete your own account.');
    if (isBootstrapAdmin_(email)) throw clientError_('The primary admin account cannot be deleted.');
    if (!deleteUserRecord_(email)) throw clientError_('User not found.');

    try { logAudit_(ACTIONS.USER_DELETE, '', email, admin.email); } catch (err) {}
    return listUserRecords_();
  });
}

/**
 * Resets another user's password (admin override; clears mustChange).
 * @param {string} email Email of the target user.
 * @param {string} newPassword New password (min 8 chars).
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Updated user list.
 */
function adminResetPassword(email, newPassword, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    return runWithBatchedUserBumps_(function () {
      email = String(email || '').toLowerCase().trim();

      if (!findUserRecord_(email)) throw clientError_('User not found.');

      const pwError = validatePassword_(newPassword);
      if (pwError) throw clientError_(pwError);

      const salt = generateSalt_();
      setUserField_(email, 'salt', salt);
      setUserField_(email, 'passwordHash', hashPasswordV2_(newPassword, salt, CONFIG.USERS.PBKDF2_ITERATIONS));
      bumpSessionEpoch_(email);
      setUserField_(email, 'mustChange', false);
      setUserField_(email, 'resetToken', '');
      setUserField_(email, 'resetExpires', null);
      setUserField_(email, 'resetRequested', null);

      try { logAudit_(ACTIONS.USER_RESET_PASSWORD, '', email, admin.email); } catch (err) {}
      try { notify_(email, NOTIFICATION_TYPES.USER, 'Password reset', 'An administrator reset your dashboard password. Please sign in with the new password.', ''); } catch (err) {}
      return listUserRecords_();
    });
  });
}

/**
 * Invalidates ALL sessions for a user without changing their password
 * (admin only). Bumps the user's session epoch so every epoch-format token
 * minted before the call fails the epoch check in sessionEmail_ — the user is
 * logged out on their next request and must sign in again. Their password is
 * untouched.
 *
 * The acting admin may target their own account (forces a re-login; the
 * response sets reAuth=true so the client can prompt for sign-in). Legacy
 * pre-epoch tokens (minted before the session-epoch feature shipped) carry no
 * epoch and are accepted until their 6 h TTL — they are NOT killed by this
 * endpoint. Not reversible except by signing the user back in.
 * @param {string} email Email of the target user.
 * @param {string} token Session token (admin required).
 * @returns {{success: boolean, message: string, email: string, reAuth: boolean}}
 */
function adminKillUserSessions(email, token) {
  const admin = requireAdmin_(token);
  // Normalize BEFORE the rate-limit key so casing/whitespace permutations of
  // the same address share one bucket (no per-variant bypass).
  email = String(email || '').toLowerCase().trim();
  checkRateLimit_('killses_' + AppUtils.safeCacheKey(email), CONFIG.RATE_LIMIT.ADMIN_USER_MAX, CONFIG.RATE_LIMIT.ADMIN_USER_WINDOW);

  return runWithLock_(function () {
    if (!findUserRecord_(email)) throw clientError_('User not found.');

    bumpSessionEpoch_(email); // invalidate every session minted before now

    try { logAudit_(ACTIONS.USER_KILL_SESSIONS, '', 'All sessions invalidated for ' + email, admin.email); } catch (err) {}
    try { notify_(email, NOTIFICATION_TYPES.USER, 'Signed out everywhere', 'An administrator signed you out of all devices. Please log in again.', ''); } catch (err) {}
    return { success: true, message: 'All sessions for ' + email + ' have been invalidated.', email: email, reAuth: email === admin.email };
  });
}

/**
 * Emails every registered dashboard user (admin only). Used for broadcast
 * announcements (e.g. maintenance windows, holidays).
 * @param {string} subject Email subject.
 * @param {string} body Plain-text email body.
 * @param {string} token Session token (admin required).
 * @returns {{success: boolean, sent: number, recipients: string[]}}
 */
function adminEmailAllUsers(subject, body, token) {
  const admin = requireAdmin_(token);
  subject = String(subject || '').trim();
  body = String(body || '').trim();

  if (!subject) throw clientError_('A subject is required.');
  if (!body) throw clientError_('A message body is required.');

  const users = listUserRecords_();
  const recipients = [];
  const seen = {};
  users.forEach(function (u) {
    const email = primaryEmail_(u.primaryEmail || u.email);
    if (!email || seen[email]) return;
    seen[email] = true;
    recipients.push(email);
  });

  let sent = 0;
  recipients.forEach(function (email) {
    if (sendMail_(email, subject, body)) sent++;
  });

  try { logAudit_(ACTIONS.USER_UPDATE, '', 'Broadcast email sent to ' + sent + '/' + recipients.length + ' users', admin.email); } catch (err) {}

  return { success: true, sent: sent, recipients: recipients };
}


/* ============================================================
 * Current user info
 * ============================================================ */

/**
 * Returns the calling user's identity/role (best effort; anonymous callers
 * get the deploying user).
 * @returns {{email: string, role: string, loggedIn: boolean}}
 */
function getCurrentUserInfo() {
  const email = getCurrentUser();
  const context = getUserContext(email);
  return {
    email: email,
    role: context.role,
    loggedIn: !!email,
    group: context.group,
    department: context.department,
    office: context.office,
    groups: context.groups,
    permissions: context.permissions
  };
}

/**
 * Debug helper: session/user/timezone/timestamp snapshot.
 * @returns {Object} Session info.
 */
/**
 * Debug helper: alias for getCurrentUserInfo().
 * @returns {Object} Session info.
 */