/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Workflow.gs
 * Approval workflow engine (record review, future flows).
 * ============================================================
 */

const WORKFLOW_SHEET_HEADERS = ['Id', 'Module', 'Type', 'TargetRow', 'TargetId', 'Summary', 'SubmittedBy', 'SubmittedAt', 'Status', 'ReviewedBy', 'ReviewedAt', 'Comment'];

const WORKFLOW_COL = Object.freeze({
  ID: 1,
  MODULE: 2,
  TYPE: 3,
  TARGET_ROW: 4,
  TARGET_ID: 5,
  SUMMARY: 6,
  SUBMITTED_BY: 7,
  SUBMITTED_AT: 8,
  STATUS: 9,
  REVIEWED_BY: 10,
  REVIEWED_AT: 11,
  COMMENT: 12
});

function approvalsSheet_() {
  const ss = getSpreadsheet_();
  if (!ss) return null;
  let sh = ss.getSheetByName(CONFIG.WORKFLOW.APPROVALS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.WORKFLOW.APPROVALS_SHEET_NAME);
    sh.getRange(1, 1, 1, WORKFLOW_SHEET_HEADERS.length).setValues([WORKFLOW_SHEET_HEADERS]);
    try { sh.setFrozenRows(1); } catch (err) {}
  }
  try { sh.hideSheet(); } catch (err) {}
  return sh;
}

function approvalRecordFromRow_(row) {
  return {
    id: String(row[0] || ''),
    module: String(row[1] || 'records'),
    type: String(row[2] || 'RECORD_REVIEW'),
    targetRow: Number(row[3]) || 0,
    targetId: String(row[4] || ''),
    summary: String(row[5] || ''),
    submittedBy: String(row[6] || '').toLowerCase(),
    submittedAt: row[7] ? new Date(row[7]).getTime() : 0,
    status: String(row[8] || WORKFLOW_TYPES.RECORD_REVIEW ? 'PENDING' : 'PENDING'),
    reviewedBy: String(row[9] || '').toLowerCase(),
    reviewedAt: row[10] ? new Date(row[10]).getTime() : 0,
    comment: String(row[11] || '')
  };
}

function isApprover_(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return false;
  if (isAdmin(email)) return true;
  const groups = getUserGroups(email);
  return groups.indexOf('APPROVER') !== -1;
}

function requireApprover_(token) {
  const user = requireLogin_(token);
  if (!isApprover_(user.email)) throw new Error('Approver permission required.');
  return user;
}

/**
 * Submits a record-review approval request. Editors can request
 * that a record be formally reviewed before the review-date is
 * marked done.
 * @param {number} targetRow Physical sheet row of the record.
 * @param {string} summary Short description of what needs reviewing.
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh approval record.
 */
function submitRecordReview(targetRow, summary, token) {
  const submitter = requireEditor_(token);
  targetRow = Number(targetRow);
  if (!targetRow || targetRow < CONFIG.SHEET.START_ROW) throw new Error('Invalid record row.');
  const summaryText = String(summary || '').trim();
  if (!summaryText) throw new Error('Provide a summary for the review request.');

  return runWithLock_(function () {
    const sh = approvalsSheet_();
    if (!sh) throw new Error('Approvals sheet unavailable.');
    const id = Utilities.getUuid().replace(/-/g, '');
    sh.appendRow([
      id,
      'records',
      WORKFLOW_TYPES.RECORD_REVIEW.key,
      targetRow,
      '',
      summaryText,
      submitter.email,
      now_(),
      APPROVAL_STATUS.PENDING,
      '',
      null,
      ''
    ]);
    try {
      notifyStaffLocked_(NOTIFICATION_TYPES.SYSTEM, 'Approval requested', 'Editor ' + submitter.email + ' requested review for record row ' + targetRow + ': ' + summaryText, '', submitter.email);
    } catch (err) {}
    return approvalRecordFromRow_([id, 'records', WORKFLOW_TYPES.RECORD_REVIEW.key, targetRow, '', summaryText, submitter.email, now_(), APPROVAL_STATUS.PENDING, '', null, '']);
  });
}

/**
 * Returns pending approval requests visible to the caller (approver
 * or admin).
 * @param {string} token Session token.
 * @returns {Object[]} Pending approvals newest-first.
 */
function getPendingApprovals(token) {
  const user = requireLogin_(token);
  if (!isApprover_(user.email)) return [];
  const sh = approvalsSheet_();
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const out = [];
  if (lastRow < 2) return out;
  const values = sh.getRange(2, 1, lastRow - 1, WORKFLOW_SHEET_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const rec = approvalRecordFromRow_(values[i]);
    if (rec.status !== APPROVAL_STATUS.PENDING) continue;
    out.push(rec);
  }
  out.sort(function (a, b) { return b.submittedAt - a.submittedAt; });
  return out;
}

/**
 * Returns all approvals involving the caller (submitted or reviewed).
 * @param {string} token Session token.
 * @returns {Object[]} Approvals newest-first.
 */
function getMyApprovals(token) {
  const user = requireLogin_(token);
  const sh = approvalsSheet_();
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const out = [];
  if (lastRow < 2) return out;
  const values = sh.getRange(2, 1, lastRow - 1, WORKFLOW_SHEET_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const rec = approvalRecordFromRow_(values[i]);
    if (rec.submittedBy !== user.email && rec.reviewedBy !== user.email) continue;
    out.push(rec);
  }
  out.sort(function (a, b) { return b.submittedAt - a.submittedAt; });
  return out;
}

/**
 * Reviews an approval request (approve or reject). On approve for a
 * RECORD_REVIEW type the record's review-date cell is set to the
 * done colour and an audit entry is written. On reject the submitter
 * is notified.
 * @param {string} id Approval id.
 * @param {boolean} approve True to approve, false to reject.
 * @param {string} comment Optional comment.
 * @param {string} token Session token (approver+ required).
 * @returns {Object} Fresh approval record.
 */
function reviewApproval(id, approve, comment, token) {
  const reviewer = requireApprover_(token);
  id = String(id || '').trim();
  if (!id) throw new Error('Approval id required.');

  return runWithLock_(function () {
    const sh = approvalsSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error('Approval not found.');
    const values = sh.getRange(2, 1, lastRow - 1, WORKFLOW_SHEET_HEADERS.length).getValues();
    let foundRow = -1;
    let rec = null;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === id) { foundRow = i + 2; rec = approvalRecordFromRow_(values[i]); break; }
    }
    if (!rec) throw new Error('Approval not found.');
    if (rec.status !== APPROVAL_STATUS.PENDING) throw new Error('Approval is already ' + rec.status.toLowerCase() + '.');
    if (rec.submittedBy === reviewer.email) throw new Error('You cannot review your own approval request.');

    const now = now_();
    const newStatus = approve ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED;
    sh.getRange(foundRow, WORKFLOW_COL.REVIEWED_BY).setValue(reviewer.email);
    sh.getRange(foundRow, WORKFLOW_COL.REVIEWED_AT).setValue(now);
    sh.getRange(foundRow, WORKFLOW_COL.STATUS).setValue(newStatus);
    sh.getRange(foundRow, WORKFLOW_COL.COMMENT).setValue(String(comment || ''));

    if (approve && rec.type === WORKFLOW_TYPES.RECORD_REVIEW.key) {
      const sheet = getSheet_();
      if (sheet) {
        const row = rec.targetRow;
        if (row >= CONFIG.SHEET.START_ROW && row <= sheet.getLastRow()) {
          sheet.getRange(row, COL.REVIEW_DATE).setBackground(CONFIG.COLORS.REVIEW_DONE);
          try { logAudit_(ACTIONS.REVIEW_DONE, String(row), 'Approval workflow: review marked done', reviewer.email); } catch (err) {}
        }
      }
      try {
        notify_(rec.submittedBy, NOTIFICATION_TYPES.SYSTEM, 'Review approved', 'Your review request for record row ' + rec.targetRow + ' was approved.' + (comment ? ' Comment: ' + comment : ''), '');
      } catch (err) {}
    } else if (!approve) {
      try {
        notify_(rec.submittedBy, NOTIFICATION_TYPES.SYSTEM, 'Review rejected', 'Your review request for record row ' + rec.targetRow + ' was rejected.' + (comment ? ' Comment: ' + comment : ''), '');
      } catch (err) {}
    }

    const fresh = approvalRecordFromRow_([
      id, rec.module, rec.type, rec.targetRow, rec.targetId, rec.summary, rec.submittedBy, rec.submittedAt, newStatus, reviewer.email, now, String(comment || '')
    ]);
    return fresh;
  });
}
