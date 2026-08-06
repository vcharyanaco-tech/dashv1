/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Notifications.gs
 * In-app notification center (bell + unread badge + panel).
 * Entries live in a hidden 'Notifications' sheet.
 * ============================================================
 */

const NOTIFICATION_SHEET_HEADERS = ['Id', 'Email', 'Type', 'Title', 'Body', 'Link', 'CreatedAt', 'ReadAt'];

const NOTIFICATION_COL = Object.freeze({
  ID: 1,
  EMAIL: 2,
  TYPE: 3,
  TITLE: 4,
  BODY: 5,
  LINK: 6,
  CREATED_AT: 7,
  READ_AT: 8
});

const NOTIFICATION_TYPES = Object.freeze({
  RECORD: 'record',
  SUBMISSION: 'submission',
  USER: 'user',
  SYSTEM: 'system'
});

const NOTIFICATION_RECENT_LIMIT = 30;

function notificationsSheet_() {
  const ss = getSpreadsheet_();
  if (!ss) return null;
  let sh = ss.getSheetByName(CONFIG.NOTIFICATIONS.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.NOTIFICATIONS.SHEET_NAME);
    sh.getRange(1, 1, 1, NOTIFICATION_SHEET_HEADERS.length).setValues([NOTIFICATION_SHEET_HEADERS]);
    try { sh.setFrozenRows(1); } catch (err) {}
  }
  try { sh.hideSheet(); } catch (err) {}
  return sh;
}

function notificationRecordFromRow_(row) {
  return {
    id: String(row[0] || ''),
    email: String(row[1] || '').toLowerCase(),
    type: String(row[2] || NOTIFICATION_TYPES.SYSTEM),
    title: String(row[3] || ''),
    body: String(row[4] || ''),
    link: String(row[5] || ''),
    createdAt: row[6] ? new Date(row[6]).getTime() : 0,
    readAt: row[7] ? new Date(row[7]).getTime() : 0
  };
}

/* Appends a notification row. Call inside runWithLock_ when already inside a
   locked write path. The recipient email is normalized to the account's
   primary email so notifications are always found for any alias. */
function appendNotification_(email, type, title, body, link) {
  email = primaryEmail_(email);
  if (!isValidEmail_(email)) return;
  const sh = notificationsSheet_();
  if (!sh) return;
  sh.appendRow([Utilities.getUuid().replace(/-/g, ''), email, String(type || NOTIFICATION_TYPES.SYSTEM), String(title || ''), String(body || ''), String(link || ''), now_(), null]);
  pruneNotifications_(email);
}

/* Public path for callers outside a locked write: acquires the script lock. */
function notify_(email, type, title, body, link) {
  runWithLock_(function () {
    appendNotification_(email, type, title, body, link);
  });
}

function pruneNotifications_(email) {
  const sh = notificationsSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const values = sh.getRange(2, 1, lastRow - 1, NOTIFICATION_SHEET_HEADERS.length).getValues();
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][1] || '').toLowerCase() === email) {
      rows.push({ row: i + 2, t: values[i][6] ? new Date(values[i][6]).getTime() : 0 });
    }
  }
  if (rows.length <= CONFIG.NOTIFICATIONS.MAX_PER_USER) return;
  rows.sort(function (a, b) { return b.t - a.t; });
  rows
    .slice(CONFIG.NOTIFICATIONS.MAX_PER_USER)
    .sort(function (a, b) { return b.row - a.row; })
    .forEach(function (r) { sh.deleteRow(r.row); });
}

/* Notifies every staff member (ADMIN/EDITOR roles plus anyone with the
   APPROVER group), excluding the actor. Bootstrap admins are included even
   when their record has not been created yet. */
function notifyStaff_(type, title, body, link, excludeEmail) {
  excludeEmail = primaryEmail_(excludeEmail);
  const recipients = {};
  const users = listUserRecords_();
  users.forEach(function (u) {
    const email = String(u.primaryEmail || '').toLowerCase().trim();
    if (!email || email === excludeEmail) return;
    if (u.role === ROLES.ADMIN || u.role === ROLES.EDITOR) recipients[email] = true;
    const groups = String(u.group || '').split(',').map(function (g) { return g.trim().toUpperCase(); });
    if (groups.indexOf('APPROVER') !== -1) recipients[email] = true;
  });
  ADMIN_USERS.forEach(function (email) {
    email = String(email).toLowerCase().trim();
    if (email && email !== excludeEmail) recipients[email] = true;
  });
  Object.keys(recipients).forEach(function (email) {
    appendNotification_(email, type, title, body, link);
  });
}

/* Calls inside a locked write path: broadcasts to staff without re-locking. */
function notifyStaffLocked_(type, title, body, link, excludeEmail) {
  excludeEmail = primaryEmail_(excludeEmail);
  const recipients = {};
  const users = listUserRecords_();
  users.forEach(function (u) {
    const email = String(u.primaryEmail || '').toLowerCase().trim();
    if (!email || email === excludeEmail) return;
    if (u.role === ROLES.ADMIN || u.role === ROLES.EDITOR) recipients[email] = true;
    const groups = String(u.group || '').split(',').map(function (g) { return g.trim().toUpperCase(); });
    if (groups.indexOf('APPROVER') !== -1) recipients[email] = true;
  });
  ADMIN_USERS.forEach(function (email) {
    email = String(email).toLowerCase().trim();
    if (email && email !== excludeEmail) recipients[email] = true;
  });
  Object.keys(recipients).forEach(function (email) {
    appendNotification_(email, type, title, body, link);
  });
}

/**
 * Returns the signed-in user's notifications: unread count, the most recent
 * entries, and the total retained for the user.
 * @param {string} token Session token (login required).
 * @returns {{unread: number, recent: Object[], count: number}}
 */
function getMyNotifications(token) {
  const user = requireLogin_(token);
  const sh = notificationsSheet_();
  if (!sh) return { unread: 0, recent: [], count: 0 };
  const lastRow = sh.getLastRow();
  const all = [];
  if (lastRow >= 2) {
    const values = sh.getRange(2, 1, lastRow - 1, NOTIFICATION_SHEET_HEADERS.length).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][1] || '').toLowerCase() === user.email) {
        all.push(notificationRecordFromRow_(values[i]));
      }
    }
  }
  all.sort(function (a, b) { return b.createdAt - a.createdAt; });
  let unread = 0;
  for (let i = 0; i < all.length; i++) if (!all[i].readAt) unread++;
  return {
    unread: unread,
    recent: all.slice(0, NOTIFICATION_RECENT_LIMIT),
    count: all.length
  };
}

/**
 * Marks one, several, or all of the user's notifications as read.
 * @param {string|string[]} ids 'all' for everything, otherwise a list of
 *   notification ids.
 * @param {string} token Session token.
 * @returns {{unread: number, recent: Object[], count: number}} Fresh state.
 */
function markNotificationsRead(ids, token) {
  const user = requireLogin_(token);
  const sh = notificationsSheet_();
  if (!sh) return getMyNotifications(token);
  const idList = Array.isArray(ids) ? ids : [ids];
  const wantAll = idList.indexOf('all') !== -1;
  const idSet = {};
  idList.forEach(function (id) { idSet[String(id)] = true; });

  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const range = sh.getRange(2, 1, lastRow - 1, NOTIFICATION_SHEET_HEADERS.length);
    const values = range.getValues();
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      const email = String(values[i][1] || '').toLowerCase();
      if (email !== user.email || (values[i][7] ? true : false)) continue;
      if (wantAll || idSet[String(values[i][0])]) rows.push(i + 2);
    }
    if (rows.length) {
      const now = now_();
      const readRange = sh.getRange(1, NOTIFICATION_COL.READ_AT, sh.getLastRow(), 1);
      rows.forEach(function (row) { readRange.getCell(row, 1).setValue(now); });
    }
  }
  return getMyNotifications(token);
}

/**
 * Deletes all of the calling user's notifications from the sheet.
 * @param {string} token Session token (login required).
 * @returns {{unread: number, recent: Object[], count: number}} Fresh state.
 */
function clearMyNotifications(token) {
  const user = requireLogin_(token);
  const sh = notificationsSheet_();
  if (!sh) return getMyNotifications(token);
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const values = sh.getRange(2, 1, lastRow - 1, NOTIFICATION_SHEET_HEADERS.length).getValues();
    const rowsToDelete = [];
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][1] || '').toLowerCase() === user.email) {
        rowsToDelete.push(i + 2);
      }
    }
    rowsToDelete.forEach(function (row) { sh.deleteRow(row); });
  }
  return getMyNotifications(token);
}
