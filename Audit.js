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
 * Numeric millisecond timestamp for an audit cell value (Date or string).
 * Unparseable values sort as 0 (oldest) so they never break ordering.
 * @param {*} value Audit timestamp cell.
 * @returns {number}
 */
function auditTimestampMs_(value) {
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return isFinite(t) ? t : 0;
}

/**
 * Reads the most recent audit entries, sorted by recorded date/time (newest
 * first) regardless of physical row order.
 * @param {number} limit Maximum number of entries (default 100).
 * @returns {Object[]} Audit entries with physical row numbers.
 */
function getAuditEntries(limit) {
  requireViewer();
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  return rows
    .map(function (vals, i) {
      const ts = auditTimestampMs_(vals[0]);
      return {
        row: i + 2,
        timestamp: vals[0] ? vals[0].toString() : '',
        timestampMs: ts,
        user: vals[1] || '',
        action: vals[2] || '',
        recordId: vals[3] || '',
        details: vals[4] || ''
      };
    })
    .sort(function (a, b) { return b.timestampMs - a.timestampMs || a.row - b.row; })
    .slice(0, limit || 100);
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
