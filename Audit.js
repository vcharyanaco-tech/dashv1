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
  if (!rows.length) throw AppUtils.clientError('No audit entries selected.');
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

/* ============================================================
 * Audit Log archiving (Point: performance & scaling)
 * ============================================================ */

/**
 * Moves audit rows older than ARCHIVE_AFTER_DAYS to the "Audit Archive" sheet
 * in bounded batches, keeping the live Audit Log small and fast. Runs inside
 * the script lock so it never collides with writes; safe to call manually or
 * via the daily time-driven trigger (installTriggers).
 *
 * GAS quirks worked around:
 *  - deleteRow/deleteRows in a loop is O(rows^2) on huge sheets, so rows are
 *    deleted bottom-up in contiguous runs (deleteRows is much cheaper than
 *    per-row deleteRow).
 *  - The 6-minute execution quota is handled by processing a bounded batch
 *    (ARCHIVE_BATCH_SIZE rows) per run; a trigger that runs daily finishes
 *    even a large backlog across several days.
 *  - CacheService is not used here: sheet data is authoritative.
 *
 * @returns {{archived: number, kept: number, batchLimitReached: boolean}}
 */
function archiveAuditLog() {
  const ARCHIVE_SHEET = 'Audit Archive';
  const ARCHIVE_AFTER_DAYS = 90;
  const ARCHIVE_BATCH_SIZE = 400;

  return runWithLock_(function () {
    const ss = getSpreadsheet_();
    const live = getAuditSheet_();
    const lastRow = live.getLastRow();
    if (lastRow < 2) return { archived: 0, kept: 0, batchLimitReached: false };

    const header = live.getRange(1, 1, 1, 5).getValues()[0];
    const rows = live.getRange(2, 1, lastRow - 1, 5).getValues();
    const cutoff = Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

    // Collect (physicalRow, values) for entries older than the cutoff.
    const oldRows = [];
    rows.forEach(function (vals, i) {
      const ts = auditTimestampMs_(vals[0]);
      // Unparseable timestamps sort as 0 (oldest) and are archived too — they
      // would otherwise sit at the top of a sorted view forever.
      if (ts <= cutoff) oldRows.push({ row: i + 2, values: vals });
    });

    if (!oldRows.length) return { archived: 0, kept: rows.length, batchLimitReached: false };

    const toArchive = oldRows.slice(0, ARCHIVE_BATCH_SIZE);

    // Ensure the archive sheet exists with the same header row.
    let archive = ss.getSheetByName(ARCHIVE_SHEET);
    if (!archive) {
      archive = ss.insertSheet(ARCHIVE_SHEET);
      archive.appendRow(header);
      archive.getRange(1, 1, 1, 5).setFontWeight('bold');
    }

    // Append in one batch write (400 rows fits comfortably in the 6-min quota).
    archive.getRange(archive.getLastRow() + 1, 1, toArchive.length, 5).setValues(
      toArchive.map(function (o) { return o.values; })
    );

    // Delete archived rows bottom-up so earlier row numbers stay valid, and
    // batch contiguous runs into a single deleteRows call (per-row deleteRow is
    // O(rows^2) on large sheets and each call triggers a sheet recalculation).
    const rowsToDelete = toArchive
      .map(function (o) { return o.row; })
      .sort(function (a, b) { return b - a; });
    let runStart = rowsToDelete[0];
    let runPrev = rowsToDelete[0];
    for (let i = 1; i <= rowsToDelete.length; i++) {
      const cur = rowsToDelete[i];
      if (cur !== runPrev - 1) {
        live.deleteRows(runStart, runPrev - runStart + 1);
        runStart = cur;
      }
      runPrev = cur;
    }

    try {
      logAudit_(ACTIONS.AUDIT_ARCHIVE, '', 'Archived ' + toArchive.length + ' audit entries older than ' + ARCHIVE_AFTER_DAYS + ' days', getCurrentUser() || 'trigger');
    } catch (err) {}

    return {
      archived: toArchive.length,
      kept: rows.length - toArchive.length,
      batchLimitReached: oldRows.length > toArchive.length
    };
  });
}
