/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Audit.gs
 * ============================================================
 */

const AUDIT_SHEET = 'Audit Log';

function getAuditSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(AUDIT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_SHEET);
    sheet.appendRow(['Timestamp', 'User', 'Action', 'Record ID', 'Details']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
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

function auditAdd_(item) {
  logAudit_('ADD', item.id, item);
}

function auditUpdate_(oldItem, newItem) {
  logAudit_('UPDATE', newItem.id, { before: oldItem, after: newItem });
}

function auditDelete_(item) {
  logAudit_('DELETE', item.id, item);
}

function auditError_(functionName, error) {
  logAudit_('ERROR', '', { function: functionName, message: error.message, stack: error.stack });
}

function getAuditEntries(limit) {
  requireViewer();
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(Math.max(2, lastRow - (limit || 100) + 1), 1, Math.min(limit || 100, lastRow - 1), 5).getValues();
  return rows.reverse().map(function (row) {
    return {
      timestamp: row[0] ? row[0].toString() : '',
      user: row[1] || '',
      action: row[2] || '',
      recordId: row[3] || '',
      details: row[4] || ''
    };
  });
}
