/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Auth.gs
 * Authentication & Authorization
 * ============================================================
 */


/* ============================================================
 * Current User
 * ============================================================ */

function getCurrentUser() {

  try {

    return Session.getActiveUser().getEmail().toLowerCase();

  } catch (err) {

    return "";

  }

}


/* ============================================================
 * Effective User
 * ============================================================ */

function getEffectiveUser() {

  try {

    return Session.getEffectiveUser().getEmail().toLowerCase();

  } catch (err) {

    return "";

  }

}


/* ============================================================
 * Login Check
 * ============================================================ */

function isLoggedIn() {

  return getCurrentUser() !== "";

}


/* ============================================================
 * Administrator List
 * ============================================================ */

const ADMIN_USERS = [

  // Example:
  // "abc@indiapost.gov.in",
  // "xyz@indiapost.gov.in"

];


/* ============================================================
 * Editor List
 * ============================================================ */

const EDITOR_USERS = [

];


/* ============================================================
 * Viewer List
 * ============================================================ */

const VIEWER_USERS = [

];


/* ============================================================
 * Role Detection
 * ============================================================ */

function getUserRole(email) {

  email = (email || getCurrentUser()).toLowerCase();

  if (ADMIN_USERS.indexOf(email) !== -1)
    return "ADMIN";

  if (EDITOR_USERS.indexOf(email) !== -1)
    return "EDITOR";

  if (VIEWER_USERS.indexOf(email) !== -1)
    return "VIEWER";

  return "GUEST";

}


/* ============================================================
 * Permission Checks
 * ============================================================ */

function isAdmin(email) {

  return getUserRole(email) === "ADMIN";

}

function isEditor(email) {

  const role = getUserRole(email);

  return role === "ADMIN" || role === "EDITOR";

}

function isViewer(email) {

  const role = getUserRole(email);

  return role === "ADMIN" ||
         role === "EDITOR" ||
         role === "VIEWER";

}


/* ============================================================
 * Authorization
 * ============================================================ */

function requireAdmin() {

  if (!isAdmin()) {

    throw new Error(
      "You are not authorized to perform this action."
    );

  }

}

function requireEditor() {

  if (!isEditor()) {

    throw new Error(
      "Editor permission required."
    );

  }

}

function requireViewer() {

  if (!isViewer()) {

    throw new Error(
      "Viewer permission required."
    );

  }

}


/* ============================================================
 * User Information
 * ============================================================ */

function getCurrentUserInfo() {

  const email = getCurrentUser();

  return {

    email: email,

    role: getUserRole(email),

    loggedIn: email !== ""

  };

}


/* ============================================================
 * Web App Session
 * ============================================================ */

function getSessionInfo() {

  return {

    user: getCurrentUser(),

    effectiveUser: getEffectiveUser(),

    role: getUserRole(),

    timezone: Session.getScriptTimeZone(),

    timestamp: new Date()

  };

}


/* ============================================================
 * Public API
 * ============================================================ */

function whoAmI() {

  return getCurrentUserInfo();

}