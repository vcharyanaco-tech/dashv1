/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Audit.gs
 * ============================================================
 */

const AUDIT_SHEET = 'Audit Log';

let __auditSheetCache__ = null;

function getAuditSheet_() {
  if (__auditSheetCache__) return __auditSheetCache__;

  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(AUDIT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_SHEET);
    sheet.appendRow(['Timestamp', 'User', 'Action', 'Record ID', 'Details']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  __auditSheetCache__ = sheet;
  return sheet;
}

function logAudit_(action, id, details, userEmail) {
  try {
    const sheet = getAuditSheet_();
    sheet.appendRow([new Date(), userEmail || getCurrentUser(), action, id || '', typeof details === 'string' ? details : JSON.stringify(details)]);
  } catch (err) {
    Logger.log(err);
  }
}

/**
 * Reads the most recent audit entries (newest first).
 * @param {number} limit Maximum number of entries (default 100).
 * @returns {Object[]} Audit entries with physical row numbers.
 */
function getAuditEntries(limit) {
  requireViewer();
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const startRow = Math.max(2, lastRow - (limit || 100) + 1);
  const rows = sheet.getRange(startRow, 1, Math.min(limit || 100, lastRow - 1), 5).getValues();
  return rows.reverse().map(function (row, i) {
    return {
      row: lastRow - i,
      timestamp: row[0] ? row[0].toString() : '',
      user: row[1] || '',
      action: row[2] || '',
      recordId: row[3] || '',
      details: row[4] || ''
    };
  });
}

/**
 * Deletes the given audit entries by physical row number.
 * @param {number[]} rowNumbers Physical rows to delete (must be >= 2).
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Refreshed audit tail (80 entries).
 */
function adminDeleteAuditRows(rowNumbers, token) {
  requireAdmin_(token);
  const sheet = getAuditSheet_();
  const rows = (rowNumbers || [])
    .map(function (n) { return Number(n); })
    .filter(function (n) { return isFinite(n) && n >= 2; })
    .sort(function (a, b) { return b - a; });
  if (!rows.length) throw new Error('No audit entries selected.');
  rows.forEach(function (r) { sheet.deleteRow(r); });
  try { logAudit_(ACTIONS.AUDIT_DELETE, '', 'Deleted ' + rows.length + ' audit entries', getCurrentUser()); } catch (err) {}
  return getAuditEntries(80);
}

/**
 * Clears the entire audit log.
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Empty audit tail.
 */
function adminClearAudit(token) {
  requireAdmin_(token);
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.deleteRows(2, lastRow - 1);
  try { logAudit_(ACTIONS.AUDIT_CLEAR, '', 'Cleared the entire audit log', getCurrentUser()); } catch (err) {}
  return getAuditEntries(80);
}
