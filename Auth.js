/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Auth.gs
 * Password-based authentication, sessions and user management
 * ============================================================
 */

const DEFAULT_ADMIN_PASSWORD = 'Admin@123';

const ADMIN_USERS = [
  "vcharyanaco@gmail.com"
];

const EDITOR_USERS = [
];

const VIEWER_USERS = [
];

const USER_SHEET_HEADERS = ['Email', 'Role', 'Salt', 'PasswordHash', 'MustChange', 'CreatedBy', 'CreatedAt', 'ResetToken', 'ResetExpires', 'Group', 'Department', 'Office', 'Preferences', 'ResetRequested'];

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
  RESET_REQUESTED: 14
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
  email = String(email || '').toLowerCase().trim();
  return ADMIN_USERS.indexOf(email) !== -1;
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
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

function hashPassword_(password, salt) {
  let hash = sha256Hex_((salt || '') + '|' + (password || ''));
  for (let i = 0; i < 500; i++) {
    hash = sha256Hex_(hash + '|' + (salt || ''));
  }
  return hash;
}

function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function safeCacheKey_(value) {
  return sha256Hex_(String(value || '')).slice(0, 16);
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

function readUserRecords_() {
  const sh = usersSheet_();
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  return sh.getRange(2, 1, lastRow - 1, USER_SHEET_HEADERS.length).getValues();
}

function userRecordFromRow_(row) {
  return {
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
    resetRequested: row[13] ? String(row[13]) : ''
  };
}

function findUserRecord_(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return null;

  const rows = readUserRecords_();

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').toLowerCase().trim() === email) {
      const rec = userRecordFromRow_(rows[i]);
      rec.row = i + 2;
      rec.email = email;
      return rec;
    }
  }

  return null;
}

function setUserField_(email, field, value) {
  const rec = findUserRecord_(email);
  if (!rec) return;

  const colMap = {
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
    resetRequested: USER_COL.RESET_REQUESTED
  };

  const col = colMap[field];
  if (!col) return;

  const sh = usersSheet_();
  if (sh) sh.getRange(rec.row, col).setValue(value);
}

function addUserRecord_(email, role, salt, passwordHash, createdBy, group, department, office) {
  const sh = usersSheet_();
  if (!sh) return;
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, USER_SHEET_HEADERS.length).setValues([[
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
    null
  ]]);
}

function deleteUserRecord_(email) {
  const rec = findUserRecord_(email);
  if (!rec) return false;
  const sh = usersSheet_();
  if (!sh) return false;
  sh.deleteRow(rec.row);
  return true;
}

function listUserRecords_() {
  const sh = usersSheet_();
  const out = [];
  if (!sh) return out;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return out;

  const values = sh.getRange(2, 1, lastRow - 1, USER_SHEET_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    if (!String(values[i][0] || '').trim()) continue;
    out.push({
      email: values[i][0],
      role: values[i][1] || ROLES.VIEWER,
      mustChange: values[i][4] === true || String(values[i][4]).toLowerCase() === 'true',
      createdAt: values[i][6] ? String(values[i][6]) : '',
      group: values[i][9] || '',
      department: values[i][10] || '',
      office: values[i][11] || '',
      resetRequested: values[i][13] ? String(values[i][13]) : ''
    });
  }

  return out;
}

function ensureUserRecord_(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return;
  if (findUserRecord_(email)) return;
  if (!isBootstrapAdmin_(email)) return;

  runWithLock_(function () {
    if (findUserRecord_(email)) return;
    const salt = generateSalt_();
    addUserRecord_(email, ROLES.ADMIN, salt, hashPassword_(DEFAULT_ADMIN_PASSWORD, salt), 'system');
    setUserField_(email, 'mustChange', true);
  });
}

function verifyPasswordRecord_(rec, password) {
  if (!rec || !rec.salt || !rec.passwordHash) return false;
  return hashPassword_(password, rec.salt) === rec.passwordHash;
}

function verifyPassword_(email, password) {
  return verifyPasswordRecord_(findUserRecord_(email), password);
}


/* ============================================================
 * Sessions (CacheService tokens, TTL 6 hours)
 * ============================================================ */

function createSession_(email) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('session_' + token, String(email).toLowerCase(), CONFIG.USERS.SESSION_TTL_SECONDS);
  return token;
}

function sessionEmail_(token) {
  if (!token) return null;
  const email = CacheService.getScriptCache().get('session_' + String(token));
  return email || null;
}

function destroySession_(token) {
  if (token) CacheService.getScriptCache().remove('session_' + String(token));
}


/* ============================================================
 * Login attempt throttling
 * ============================================================ */

function recordFailedAttempt_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail_' + safeCacheKey_(email);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 60 * CONFIG.USERS.LOCK_MINUTES);
  return count;
}

function isAttemptBlocked_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail_' + safeCacheKey_(email);
  return Number(cache.get(key) || 0) >= CONFIG.USERS.MAX_LOGIN_ATTEMPTS;
}

function clearAttempts_(email) {
  CacheService.getScriptCache().remove('loginfail_' + safeCacheKey_(email));
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

function isViewer(email) {
  return true;
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
function hasPermission_(email, module, action) {
  email = String(email || getCurrentUser() || '').toLowerCase().trim();
  if (!hasModulePermission_(module)) return false;
  const perms = getUserPermissions(email);
  return (perms[module] || []).indexOf(action) !== -1;
}

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
  if (!email) throw new Error('Login required. Please log in again.');
  return { email: email, role: getUserRole(email) };
}

function requireLogin_(token) {
  return authenticate_(token);
}

function requireEditor_(token) {
  const user = requireLogin_(token);
  if (!isEditor(user.email)) throw new Error('Editor permission required.');
  return user;
}

function requireAdmin_(token) {
  const user = requireLogin_(token);
  if (!isAdmin(user.email)) throw new Error('Admin permission required.');
  return user;
}

function requireAdmin() {
  if (!isAdmin()) throw new Error('Admin permission required.');
}

function requireEditor() {
  if (!isEditor()) throw new Error('Editor permission required.');
}

function requireViewer() {
  return true;
}


/* ============================================================
 * Login / Logout / Session
 * ============================================================ */

/**
 * Authenticates a user and issues a session token (6h TTL). Login failures
 * are throttled (max attempts / lock minutes in CONFIG.USERS).
 * @param {string} email User email.
 * @param {string} password Plain-text password.
 * @returns {{success: boolean, message?: string, token?: string, mustChange?: boolean, user?: Object}}
 */
function login(email, password) {
  email = String(email || '').toLowerCase().trim();

  if (!isValidEmail_(email)) {
    return { success: false, message: 'Enter a valid email address.' };
  }
  if (!password) {
    return { success: false, message: 'Enter your password.' };
  }
  if (isAttemptBlocked_(email)) {
    return {
      success: false,
      message: 'Too many failed attempts. Try again in ' + CONFIG.USERS.LOCK_MINUTES + ' minutes.'
    };
  }

  let rec = findUserRecord_(email);

  if (!rec && isBootstrapAdmin_(email)) {
    ensureUserRecord_(email);
    rec = findUserRecord_(email);
  }

  if (!rec || !verifyPasswordRecord_(rec, password)) {
    recordFailedAttempt_(email);
    return { success: false, message: 'Invalid email or password.' };
  }

  clearAttempts_(email);

  const token = createSession_(email);
  try { logAudit_(ACTIONS.LOGIN, '', 'Signed in', email); } catch (err) {}

  const context = getUserContext(email);
  return {
    success: true,
    token: token,
    mustChange: rec.mustChange === true,
    user: {
      email: email,
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
 * @param {string} email User email.
 * @returns {{success: boolean, message: string}}
 */
function requestPasswordReset(email) {
  email = String(email || '').toLowerCase().trim();

  if (!isValidEmail_(email)) {
    return { success: false, message: 'Enter a valid email address.' };
  }

  const rec = findUserRecord_(email);
  if (!rec) {
    return { success: true, message: 'If an account exists, your administrator has been notified.' };
  }

  runWithLock_(function () {
    setUserField_(email, 'resetRequested', new Date());
    setUserField_(email, 'resetToken', '');
    setUserField_(email, 'resetExpires', null);
    notifyStaff_(NOTIFICATION_TYPES.USER, 'Password reset requested', 'The user ' + email + ' requested a password reset. Open Settings to review the request.', '');
  });

  try { logAudit_(ACTIONS.PASSWORD_RESET_REQUESTED, '', 'Reset requested; administrator notified', email); } catch (err) {}

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

  if (!verifyPassword_(user.email, currentPassword)) {
    return { success: false, message: 'Current password is incorrect.' };
  }

  const pwError = validatePassword_(newPassword);
  if (pwError) return { success: false, message: pwError };

  runWithLock_(function () {
    const salt = generateSalt_();
    setUserField_(user.email, 'salt', salt);
    setUserField_(user.email, 'passwordHash', hashPassword_(newPassword, salt));
    setUserField_(user.email, 'mustChange', false);
    setUserField_(user.email, 'resetToken', '');
    setUserField_(user.email, 'resetExpires', null);
    setUserField_(user.email, 'resetRequested', null);
  });

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
 * Creates a new user account.
 * @param {string} email New user email.
 * @param {string} role One of ROLES.VIEWER / ROLES.EDITOR / ROLES.ADMIN.
 * @param {string} password Initial password (min 8 chars).
 * @param {string} group Optional comma-separated group names (USER_GROUPS).
 * @param {string} department Optional department (data-scoping + metadata).
 * @param {string} office Optional office (data-scoping + metadata).
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Updated user list.
 */
function adminAddUser(email, role, password, group, department, office, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    email = String(email || '').toLowerCase().trim();
    role = String(role || '').toUpperCase().trim();

    if (!isValidEmail_(email)) throw new Error('Invalid email address.');
    if ([ROLES.VIEWER, ROLES.EDITOR, ROLES.ADMIN].indexOf(role) === -1) throw new Error('Role must be VIEWER, EDITOR or ADMIN.');

    if (findUserRecord_(email)) throw new Error('A user with that email already exists.');

    const pwError = validatePassword_(password);
    if (pwError) throw new Error(pwError);

    const salt = generateSalt_();
    addUserRecord_(email, role, salt, hashPassword_(password, salt), admin.email, group, department, office);

    try { logAudit_(ACTIONS.USER_ADD, '', email + ' as ' + role, admin.email); } catch (err) {}
    try { notify_(email, NOTIFICATION_TYPES.USER, 'Account created', 'Your dashboard account was created with the ' + role + ' role. Use the credentials given by your administrator.', ''); } catch (err) {}
    return listUserRecords_();
  });
}

/**
 * Updates a user's group / department / office metadata.
 * @param {string} email Email of the target user.
 * @param {Object} fields { group?, department?, office? } new values.
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Updated user list.
 */
function adminUpdateUser(email, fields, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    email = String(email || '').toLowerCase().trim();
    if (!findUserRecord_(email)) throw new Error('User not found.');

    const f = fields || {};
    if (f.group !== undefined) setUserField_(email, 'group', String(f.group || ''));
    if (f.department !== undefined) setUserField_(email, 'department', String(f.department || ''));
    if (f.office !== undefined) setUserField_(email, 'office', String(f.office || ''));

    try { logAudit_(ACTIONS.USER_UPDATE, '', email + ' metadata updated', admin.email); } catch (err) {}
    return listUserRecords_();
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
  const header = ['Email', 'Role', 'Group', 'Department', 'Office', 'CreatedAt', 'MustChange'];
  const lines = users.map(function (u) {
    return [
      u.email,
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
 * Email, Role, Group, Department, Office, [Password].
 * New users without a password get a random one and must change it on login;
 * existing users are updated for group/department/office (and password if given).
 * @param {string} csv CSV content (first row may be a header row).
 * @param {string} token Session token (admin required).
 * @returns {{users: Object[], added: number, updated: number, errors: string[]}}
 */
function adminImportUsers(csv, token) {
  const admin = requireAdmin_(token);

  const result = { users: listUserRecords_(), added: 0, updated: 0, errors: [] };
  if (!csv || !String(csv).trim()) throw new Error('Paste CSV content to import.');

  return runWithLock_(function () {
    const lines = String(csv)
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter(function (l) { return String(l).trim() !== ''; });

    if (!lines.length) throw new Error('No rows to import.');

    const rows = lines.map(parseCsvLine_);

    for (let r = 0; r < rows.length; r++) {
      const cols = rows[r];
      const email = String(cols[0] || '').toLowerCase().trim();
      const role = String(cols[1] || '').toUpperCase().trim();

      if (r === 0 && !isValidEmail_(email)) continue;

      if (!email) { result.errors.push('Row ' + (r + 1) + ': missing email.'); continue; }
      if (!isValidEmail_(email)) { result.errors.push('Row ' + (r + 1) + ': invalid email "' + email + '".'); continue; }
      if ([ROLES.VIEWER, ROLES.EDITOR, ROLES.ADMIN].indexOf(role) === -1) {
        result.errors.push('Row ' + (r + 1) + ': invalid role "' + (role || '') + '".');
        continue;
      }

      const group = String(cols[2] || '').trim();
      const department = String(cols[3] || '').trim();
      const office = String(cols[4] || '').trim();
      const password = String(cols[5] || '').trim();

      const existing = findUserRecord_(email);

      if (existing) {
        if (group) setUserField_(email, 'group', group);
        if (department) setUserField_(email, 'department', department);
        if (office) setUserField_(email, 'office', office);
        if (password) {
          const pwError = validatePassword_(password);
          if (pwError) { result.errors.push('Row ' + (r + 1) + ': ' + pwError); continue; }
          const salt = generateSalt_();
          setUserField_(email, 'salt', salt);
          setUserField_(email, 'passwordHash', hashPassword_(password, salt));
          setUserField_(email, 'mustChange', false);
        }
        result.updated++;
      } else {
        const pw = password || Utilities.getUuid().replace(/-/g, '').slice(0, 12);
        const pwError = validatePassword_(pw);
        if (pwError) { result.errors.push('Row ' + (r + 1) + ': ' + pwError); continue; }
        const salt = generateSalt_();
        addUserRecord_(email, role, salt, hashPassword_(pw, salt), admin.email, group, department, office);
        if (!password) setUserField_(email, 'mustChange', true);
        result.added++;
        try { notify_(email, NOTIFICATION_TYPES.USER, 'Account created', 'Your dashboard account was created with the ' + role + ' role during a bulk import.', ''); } catch (err) {}
      }
    }

    try {
      logAudit_(ACTIONS.USER_IMPORT, '', 'Imported users: +' + result.added + ' added, ' + result.updated + ' updated, ' + result.errors.length + ' errors', admin.email);
    } catch (err) {}

    result.users = listUserRecords_();
    return result;
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

  const perUser = {};
  const recent = [];
  let logins = 0;

  values.forEach(function (row, i) {
    const email = String(row[1] || '').toLowerCase().trim();
    const action = String(row[2] || '');
    const timestamp = row[0] ? row[0].toString() : '';

    if (!perUser[email]) {
      perUser[email] = { email: email || '(system)', actions: 0, logins: 0, lastSeen: timestamp };
    }
    perUser[email].actions++;
    perUser[email].lastSeen = timestamp;
    if (action === ACTIONS.LOGIN) {
      perUser[email].logins++;
      logins++;
    }
    if (recent.length < 30) {
      recent.push({ timestamp: timestamp, user: email, action: action, recordId: row[3] || '', details: row[4] || '' });
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

    if (email === admin.email) throw new Error('You cannot delete your own account.');
    if (isBootstrapAdmin_(email)) throw new Error('The primary admin account cannot be deleted.');
    if (!deleteUserRecord_(email)) throw new Error('User not found.');

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
    email = String(email || '').toLowerCase().trim();

    if (!findUserRecord_(email)) throw new Error('User not found.');

    const pwError = validatePassword_(newPassword);
    if (pwError) throw new Error(pwError);

    const salt = generateSalt_();
    setUserField_(email, 'salt', salt);
    setUserField_(email, 'passwordHash', hashPassword_(newPassword, salt));
    setUserField_(email, 'mustChange', false);
    setUserField_(email, 'resetToken', '');
    setUserField_(email, 'resetExpires', null);
    setUserField_(email, 'resetRequested', null);

    try { logAudit_(ACTIONS.USER_RESET_PASSWORD, '', email, admin.email); } catch (err) {}
    try { notify_(email, NOTIFICATION_TYPES.USER, 'Password reset', 'An administrator reset your dashboard password. Please sign in with the new password.', ''); } catch (err) {}
    return listUserRecords_();
  });
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
function getSessionInfo() {
  return {
    user: getCurrentUserInfo(),
    effectiveUser: getEffectiveUser(),
    timezone: Session.getScriptTimeZone(),
    timestamp: new Date()
  };
}

/**
 * Debug helper: alias for getCurrentUserInfo().
 * @returns {Object} Session info.
 */
function whoAmI() {
  return getCurrentUserInfo();
}
