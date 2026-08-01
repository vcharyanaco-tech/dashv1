/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Auth.gs
 * Authentication & Authorization
 * ============================================================
 */

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

const ADMIN_USERS = [
  "vcharyanaco@gmail.com"
];

const EDITOR_USERS = [
];

const VIEWER_USERS = [
];

function getUserRole(email) {
  email = (email || getCurrentUser() || '').toLowerCase();
  if (ADMIN_USERS.indexOf(email) !== -1) return 'ADMIN';
  if (EDITOR_USERS.indexOf(email) !== -1) return 'EDITOR';
  if (VIEWER_USERS.indexOf(email) !== -1) return 'VIEWER';
  return email ? 'VIEWER' : 'GUEST';
}

function isAdmin(email) {
  return getUserRole(email) === 'ADMIN';
}

function isEditor(email) {
  const role = getUserRole(email);
  return role === 'ADMIN' || role === 'EDITOR';
}

function isViewer(email) {
  return ['ADMIN','EDITOR','VIEWER'].indexOf(getUserRole(email)) !== -1;
}

function requireAdmin() {
  if (!isAdmin()) throw new Error('Admin permission required.');
}

function requireEditor() {
  if (!isEditor()) throw new Error('Editor permission required.');
}

function requireViewer() {
  if (!isViewer()) throw new Error('Viewer permission required.');
}

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
