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

const USER_SHEET_HEADERS = ['Email', 'Role', 'Salt', 'PasswordHash', 'MustChange', 'CreatedBy', 'CreatedAt', 'ResetToken', 'ResetExpires'];

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

function usersSheet_() {
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
      const header = sh.getRange(1, 1, 1, 2).getValues()[0];
      if (String(header[0] || '').toLowerCase() !== 'email') {
        sh.getRange(1, 1, 1, USER_SHEET_HEADERS.length).setValues([USER_SHEET_HEADERS]);
      }
    } catch (err) {}
  }

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
    role: row[1] || 'VIEWER',
    salt: row[2] || '',
    passwordHash: row[3] || '',
    mustChange: row[4] === true || String(row[4]).toLowerCase() === 'true',
    createdBy: row[5] || '',
    createdAt: row[6],
    resetToken: row[7] || '',
    resetExpires: row[8] || null
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
    email: 1,
    role: 2,
    salt: 3,
    passwordHash: 4,
    mustChange: 5,
    createdBy: 6,
    createdAt: 7,
    resetToken: 8,
    resetExpires: 9
  };

  const col = colMap[field];
  if (!col) return;

  const sh = usersSheet_();
  if (sh) sh.getRange(rec.row, col).setValue(value);
}

function addUserRecord_(email, role, salt, passwordHash, createdBy) {
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
      role: values[i][1] || 'VIEWER',
      mustChange: values[i][4] === true || String(values[i][4]).toLowerCase() === 'true',
      createdAt: values[i][6] ? String(values[i][6]) : ''
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
    addUserRecord_(email, 'ADMIN', salt, hashPassword_(DEFAULT_ADMIN_PASSWORD, salt), 'system');
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

function getUserRole(email) {
  email = String(email || getCurrentUser() || '').toLowerCase().trim();
  if (!email) return 'VIEWER';

  const rec = findUserRecord_(email);
  if (rec && rec.role) return rec.role;

  if (ADMIN_USERS.indexOf(email) !== -1) return 'ADMIN';
  if (EDITOR_USERS.indexOf(email) !== -1) return 'EDITOR';
  if (VIEWER_USERS.indexOf(email) !== -1) return 'VIEWER';
  return 'VIEWER';
}

function isAdmin(email) {
  return getUserRole(email) === 'ADMIN';
}

function isEditor(email) {
  const role = getUserRole(email);
  return role === 'ADMIN' || role === 'EDITOR';
}

function isViewer(email) {
  return true;
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
  try { logAudit_('LOGIN', '', 'Signed in', email); } catch (err) {}

  return {
    success: true,
    token: token,
    mustChange: rec.mustChange === true,
    user: { email: email, role: rec.role, loggedIn: true }
  };
}

function logout(token) {
  destroySession_(token);
  return { success: true };
}

function validateSession(token) {
  try {
    const user = authenticate_(token);
    return { success: true, user: user };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


/* ============================================================
 * Password Reset (email)
 * ============================================================ */

function requestPasswordReset(email, pageUrl) {
  email = String(email || '').toLowerCase().trim();

  if (!isValidEmail_(email)) {
    return { success: false, message: 'Enter a valid email address.' };
  }

  const rec = findUserRecord_(email);
  if (!rec) {
    return { success: true, message: 'If an account exists for that email, a reset link has been sent.' };
  }
  const resetToken = Utilities.getUuid().replace(/-/g, '');
  const expires = new Date(Date.now() + CONFIG.USERS.RESET_TTL_MINUTES * 60 * 1000);

  runWithLock_(function () {
    setUserField_(email, 'resetToken', resetToken);
    setUserField_(email, 'resetExpires', expires);
  });

  const base = String(pageUrl || '').split('?')[0];
  const link = base + '?resetToken=' + encodeURIComponent(resetToken) + '&email=' + encodeURIComponent(email);

  const body = [
    'You requested a password reset for the India Post Dashboard.',
    '',
    'Open the link below within ' + CONFIG.USERS.RESET_TTL_MINUTES + ' minutes to choose a new password:',
    '',
    link,
    '',
    'If you did not request this, you can ignore this email.'
  ].join('\n');

  try {
    MailApp.sendEmail(email, 'India Post Dashboard - Password Reset', body);
  } catch (err) {
    return { success: false, message: 'Could not send the reset email: ' + (err && err.message ? err.message : err) };
  }

  try { logAudit_('PASSWORD_RESET_REQUESTED', '', '', email); } catch (err) {}
  return { success: true, message: 'If an account exists for that email, a reset link has been sent.' };
}

function resetPasswordWithToken(email, resetToken, newPassword) {
  email = String(email || '').toLowerCase().trim();

  const rec = findUserRecord_(email);
  if (!rec || !rec.resetToken || String(rec.resetToken) !== String(resetToken || '')) {
    return { success: false, message: 'Invalid reset link.' };
  }
  if (!rec.resetExpires || new Date(rec.resetExpires) <= new Date()) {
    return { success: false, message: 'This reset link has expired. Request a new one.' };
  }

  const pwError = validatePassword_(newPassword);
  if (pwError) return { success: false, message: pwError };

  runWithLock_(function () {
    const salt = generateSalt_();
    setUserField_(email, 'salt', salt);
    setUserField_(email, 'passwordHash', hashPassword_(newPassword, salt));
    setUserField_(email, 'mustChange', false);
    setUserField_(email, 'resetToken', '');
    setUserField_(email, 'resetExpires', null);
  });

  const token = createSession_(email);
  try { logAudit_('PASSWORD_RESET', '', '', email); } catch (err) {}

  return {
    success: true,
    token: token,
    user: { email: email, role: rec.role, loggedIn: true }
  };
}

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
  });

  try { logAudit_('CHANGE_PASSWORD', '', '', user.email); } catch (err) {}
  return { success: true, message: 'Password updated.' };
}


/* ============================================================
 * Admin: User Management
 * ============================================================ */

function adminGetUsers(token) {
  requireAdmin_(token);
  return listUserRecords_();
}

function adminAddUser(email, role, password, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    email = String(email || '').toLowerCase().trim();
    role = String(role || '').toUpperCase().trim();

    if (!isValidEmail_(email)) throw new Error('Invalid email address.');
    if (['VIEWER', 'EDITOR', 'ADMIN'].indexOf(role) === -1) throw new Error('Role must be VIEWER, EDITOR or ADMIN.');
    if (findUserRecord_(email)) throw new Error('A user with that email already exists.');

    const pwError = validatePassword_(password);
    if (pwError) throw new Error(pwError);

    const salt = generateSalt_();
    addUserRecord_(email, role, salt, hashPassword_(password, salt), admin.email);

    try { logAudit_('USER_ADD', '', email + ' as ' + role, admin.email); } catch (err) {}
    return listUserRecords_();
  });
}

function adminDeleteUser(email, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    email = String(email || '').toLowerCase().trim();

    if (email === admin.email) throw new Error('You cannot delete your own account.');
    if (isBootstrapAdmin_(email)) throw new Error('The primary admin account cannot be deleted.');
    if (!deleteUserRecord_(email)) throw new Error('User not found.');

    try { logAudit_('USER_DELETE', '', email, admin.email); } catch (err) {}
    return listUserRecords_();
  });
}

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

    try { logAudit_('USER_RESET_PASSWORD', '', email, admin.email); } catch (err) {}
    return listUserRecords_();
  });
}


/* ============================================================
 * Current user info
 * ============================================================ */

function getCurrentUserInfo() {
  const email = getCurrentUser();
  return {
    email: email,
    role: getUserRole(email),
    loggedIn: !!email
  };
}

function getSessionInfo() {
  return {
    user: getCurrentUserInfo(),
    effectiveUser: getEffectiveUser(),
    timezone: Session.getScriptTimeZone(),
    timestamp: new Date()
  };
}

function whoAmI() {
  return getCurrentUserInfo();
}
