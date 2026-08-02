/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Submissions.gs
 * Viewer/editor updates submitted against dashboard records
 * ============================================================
 */

const SUBMISSION_HEADERS = ['Id', 'CardRow', 'CardId', 'Email', 'Text', 'CreatedAt', 'UpdatedAt', 'LockedBy', 'LockedAt', 'Displayed'];

const SUBMISSION_COL = Object.freeze({
  ID: 1,
  CARD_ROW: 2,
  CARD_ID: 3,
  EMAIL: 4,
  TEXT: 5,
  CREATED_AT: 6,
  UPDATED_AT: 7,
  LOCKED_BY: 8,
  LOCKED_AT: 9,
  DISPLAYED: 10
});


/* ============================================================
 * Store (hidden "Submissions" sheet in the bound spreadsheet)
 * ============================================================ */

let __submissionsSheetCache__ = null;

function submissionsSheet_() {
  if (__submissionsSheetCache__) return __submissionsSheetCache__;

  const ss = getSpreadsheet_();
  if (!ss) return null;

  let sh = ss.getSheetByName(CONFIG.SUBMISSIONS.SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(CONFIG.SUBMISSIONS.SHEET_NAME);
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (err) {}
  }

  const header = sh.getRange(1, 1, 1, SUBMISSION_HEADERS.length).getValues()[0] || [];
  if (header.join('') !== SUBMISSION_HEADERS.join('')) {
    sh.getRange(1, 1, 1, SUBMISSION_HEADERS.length).setValues([SUBMISSION_HEADERS]);
    sh.getRange(1, 1, 1, SUBMISSION_HEADERS.length).setFontWeight('bold');
  }

  __submissionsSheetCache__ = sh;
  return sh;
}

function submissionRecordFromRow_(row, rowIndex) {
  return {
    row: rowIndex,
    id: String(row[SUBMISSION_COL.ID - 1] || ''),
    cardRow: row[SUBMISSION_COL.CARD_ROW - 1],
    cardId: String(row[SUBMISSION_COL.CARD_ID - 1] || ''),
    email: String(row[SUBMISSION_COL.EMAIL - 1] || '').toLowerCase(),
    text: String(row[SUBMISSION_COL.TEXT - 1] || ''),
    createdAt: row[SUBMISSION_COL.CREATED_AT - 1],
    updatedAt: row[SUBMISSION_COL.UPDATED_AT - 1],
    lockedBy: String(row[SUBMISSION_COL.LOCKED_BY - 1] || ''),
    lockedAt: row[SUBMISSION_COL.LOCKED_AT - 1],
    displayed: row[SUBMISSION_COL.DISPLAYED - 1] === true || String(row[SUBMISSION_COL.DISPLAYED - 1]).toLowerCase() === 'true'
  };
}

function readSubmissionRows_() {
  const sh = submissionsSheet_();
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const values = sh.getRange(2, 1, lastRow - 1, SUBMISSION_HEADERS.length).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (!String(values[i][0] || '').trim()) continue;
    out.push(submissionRecordFromRow_(values[i], i + 2));
  }
  return out;
}

function findSubmissionRecord_(id) {
  const rows = readSubmissionRows_();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

function submissionLocked_(rec) {
  return !!rec && String(rec.lockedBy || '').trim() !== '';
}

function canEditSubmission_(user, rec) {
  if (user.role === ROLES.ADMIN) return true;
  const locked = submissionLocked_(rec);
  if (user.role === ROLES.EDITOR) {
    return !locked || getUserRole(rec.lockedBy) !== ROLES.ADMIN;
  }
  if (locked) return false;
  return String(rec.email || '').toLowerCase() === String(user.email || '').toLowerCase();
}

function assertCanEditSubmission_(user, rec) {
  if (canEditSubmission_(user, rec)) return;
  if (submissionLocked_(rec)) {
    if (getUserRole(rec.lockedBy) === ROLES.ADMIN) {
      throw new Error('This submission was locked by an admin and can only be changed by an admin.');
    }
    throw new Error('This submission is locked and cannot be edited.');
  }
  throw new Error('You can only edit your own submissions.');
}

function formatDateTime_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
  }
  return String(value).trim();
}

function visibleSubmission_(rec, user) {
  const locked = submissionLocked_(rec);
  const lockRole = locked ? getUserRole(rec.lockedBy) : '';
  const isAdmin = user.role === ROLES.ADMIN;
  const isEditorUser = isAdmin || user.role === ROLES.EDITOR;
  const adminLocked = locked && lockRole === ROLES.ADMIN;

  return {
    id: rec.id,
    cardRow: rec.cardRow,
    cardId: rec.cardId,
    email: rec.email,
    text: rec.text,
    createdAt: formatDateTime_(rec.createdAt),
    updatedAt: formatDateTime_(rec.updatedAt),
    lockedBy: rec.lockedBy,
    lockedAt: formatDateTime_(rec.lockedAt),
    lockRole: lockRole,
    isOwner: String(rec.email || '').toLowerCase() === String(user.email || '').toLowerCase(),
    locked: locked,
    displayed: rec.displayed,
    editable: canEditSubmission_(user, rec),
    canLock: isEditorUser && !locked,
    canUnlock: isEditorUser && locked && (isAdmin || lockRole !== ROLES.ADMIN)
  };
}

function submissionsForCard_(cardRow, user) {
  const rows = readSubmissionRows_();

  const filtered = (cardRow !== undefined && cardRow !== null && cardRow !== '')
    ? rows.filter(function (r) { return Number(r.cardRow) === Number(cardRow); })
    : rows;

  return filtered
    .slice()
    .sort(function (a, b) {
      const ta = Object.prototype.toString.call(a.createdAt) === '[object Date]' ? a.createdAt.getTime() : 0;
      const tb = Object.prototype.toString.call(b.createdAt) === '[object Date]' ? b.createdAt.getTime() : 0;
      return tb - ta;
    })
    .map(function (rec) { return visibleSubmission_(rec, user); });
}

function cardExists_(cardRow) {
  const data = getData();
  return (data.items || []).some(function (item) { return Number(item.row) === Number(cardRow); });
}

let __submissionOverviewCache__ = null;

function getSubmissionOverview_() {
  if (__submissionOverviewCache__) return __submissionOverviewCache__;

  const counts = {};
  const flash = {};
  const displayed = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  readSubmissionRows_().forEach(function (rec) {
    const key = Number(rec.cardRow);
    counts[key] = (counts[key] || 0) + 1;
    const ts = Object.prototype.toString.call(rec.createdAt) === '[object Date]' ? rec.createdAt.getTime() : 0;
    if (ts >= cutoff) flash[key] = true;
    if (rec.displayed) {
      displayed.push({
        cardRow: key,
        email: rec.email,
        text: rec.text,
        createdAt: formatDateTime_(rec.createdAt)
      });
    }
  });

  __submissionOverviewCache__ = { counts: counts, flash: flash, displayed: displayed };
  return __submissionOverviewCache__;
}


/* ============================================================
 * Public API (all token-gated)
 * ============================================================ */

/**
 * Lists submissions, optionally filtered to a card, as visibility-tagged
 * objects for the requesting user.
 * @param {string} token Session token (login required).
 * @param {number} cardRow Optional sheet row of the card to filter on.
 * @returns {Object[]} Visible submissions (newest first).
 */
function getSubmissions(token, cardRow) {
  const user = requireLogin_(token);
  return submissionsForCard_(cardRow, user);
}

/**
 * Adds a new submission to a record card.
 * @param {number} cardRow Physical sheet row of the card.
 * @param {string} cardId Display ID of the card.
 * @param {string} text Submission text (max CONFIG.SUBMISSIONS.MAX_TEXT_LENGTH).
 * @param {string} token Session token (login required).
 * @returns {Object[]} Submissions for the card after the add.
 */
function addSubmission(cardRow, cardId, text, token) {
  const user = requireLogin_(token);
  cardRow = Number(cardRow);
  if (!cardRow || isNaN(cardRow) || cardRow <= 0) throw new Error('Invalid record reference.');
  const content = String(text || '').trim();
  if (!content) throw new Error('Write your update before submitting.');
  if (content.length > CONFIG.SUBMISSIONS.MAX_TEXT_LENGTH) {
    throw new Error('Submission is too long (max ' + CONFIG.SUBMISSIONS.MAX_TEXT_LENGTH + ' characters).');
  }

  return runWithLock_(function () {
    if (!cardExists_(cardRow)) throw new Error('Record not found.');

    const sh = submissionsSheet_();
    const id = Utilities.getUuid().replace(/-/g, '');
    const now = new Date();
    sh.appendRow([id, cardRow, String(cardId || ''), user.email, content, now, now, '', null]);

    try { logAudit_(ACTIONS.SUBMISSION_ADD, cardRow, { id: id, cardRow: cardRow, text: content }, user.email); } catch (err) {}
    try {
      notifyStaffLocked_(NOTIFICATION_TYPES.SUBMISSION, 'New submission', 'Update submitted on record #' + cardRow + ' by ' + user.email + '.', '', user.email);
    } catch (err) {}
    return submissionsForCard_(cardRow, user);
  });
}

/**
 * Updates the text of a submission the user is allowed to edit.
 * @param {string} submissionId Submission UUID.
 * @param {string} text New text (non-empty, length-capped).
 * @param {string} token Session token (login required).
 * @returns {Object[]} Submissions for the card after the update.
 */
function updateSubmission(submissionId, text, token) {
  const user = requireLogin_(token);
  const content = String(text || '').trim();
  if (!content) throw new Error('Write your update before saving.');
  if (content.length > CONFIG.SUBMISSIONS.MAX_TEXT_LENGTH) {
    throw new Error('Submission is too long (max ' + CONFIG.SUBMISSIONS.MAX_TEXT_LENGTH + ' characters).');
  }

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');
    assertCanEditSubmission_(user, rec);

    const sh = submissionsSheet_();
    sh.getRange(rec.row, SUBMISSION_COL.TEXT).setValue(content);
    sh.getRange(rec.row, SUBMISSION_COL.UPDATED_AT).setValue(new Date());

    try { logAudit_(ACTIONS.SUBMISSION_UPDATE, rec.cardRow, { id: submissionId, text: content }, user.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, user);
  });
}

/**
 * Locks a submission so only editors/admins can edit it.
 * @param {string} submissionId Submission UUID.
 * @param {string} token Session token (editor+ required).
 * @returns {Object[]} Submissions for the card after the lock.
 */
function lockSubmission(submissionId, token) {
  const editor = requireEditor_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');
    if (submissionLocked_(rec) && getUserRole(rec.lockedBy) === ROLES.ADMIN && editor.role !== ROLES.ADMIN) {
      throw new Error('This submission was locked by an admin and can only be changed by an admin.');
    }

    const sh = submissionsSheet_();
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_BY).setValue(editor.email);
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_AT).setValue(new Date());

    try { logAudit_(ACTIONS.SUBMISSION_LOCK, rec.cardRow, { id: submissionId }, editor.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, editor);
  });
}

/**
 * Unlocks a submission (admin-locked submissions need an admin).
 * @param {string} submissionId Submission UUID.
 * @param {string} token Session token (editor+ required).
 * @returns {Object[]} Submissions for the card after the unlock.
 */
function unlockSubmission(submissionId, token) {
  const editor = requireEditor_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');
    if (submissionLocked_(rec) && getUserRole(rec.lockedBy) === ROLES.ADMIN && editor.role !== ROLES.ADMIN) {
      throw new Error('This submission was locked by an admin and can only be changed by an admin.');
    }

    const sh = submissionsSheet_();
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_BY).setValue('');
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_AT).setValue(null);

    try { logAudit_(ACTIONS.SUBMISSION_UNLOCK, rec.cardRow, { id: submissionId }, editor.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, editor);
  });
}

/**
 * Deletes a submission permanently (admin only).
 * @param {string} submissionId Submission UUID.
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Submissions for the card after the delete.
 */
function deleteSubmission(submissionId, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');

    const sh = submissionsSheet_();
    sh.deleteRow(rec.row);

    try { logAudit_(ACTIONS.SUBMISSION_DELETE, rec.cardRow, { id: submissionId, text: rec.text }, admin.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, admin);
  });
}

/**
 * Shows or hides a submission on its card (admin only).
 * @param {string} submissionId Submission UUID.
 * @param {string} token Session token (admin required).
 * @returns {Object[]} Submissions for the card after the toggle.
 */
function toggleSubmissionDisplay(submissionId, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');

    const next = !rec.displayed;
    submissionsSheet_().getRange(rec.row, SUBMISSION_COL.DISPLAYED).setValue(next);

    try { logAudit_(next ? ACTIONS.SUBMISSION_DISPLAY : ACTIONS.SUBMISSION_HIDE, rec.cardRow, { id: submissionId }, admin.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, admin);
  });
}
