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

function submissionsSheet_() {
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
  if (isEditor(user.email)) return true;
  if (String(rec.email || '').toLowerCase() !== String(user.email || '').toLowerCase()) return false;
  return !submissionLocked_(rec);
}

function formatDateTime_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
  }
  return String(value).trim();
}

function visibleSubmission_(rec, user, roleOf) {
  const locked = submissionLocked_(rec);
  const lockRole = locked ? roleOf(rec.lockedBy) : '';
  const isAdmin = user.role === 'ADMIN';
  const isEditorUser = isAdmin || user.role === 'EDITOR';
  const adminLocked = locked && lockRole === 'ADMIN';

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
    canUnlock: isEditorUser && locked && (isAdmin || lockRole !== 'ADMIN')
  };
}

function submissionsForCard_(cardRow, user) {
  const rows = readSubmissionRows_();
  const roleCache = {};
  const roleOf = function (email) {
    email = String(email || '').toLowerCase().trim();
    if (!email) return '';
    if (roleCache[email]) return roleCache[email];
    const role = getUserRole(email);
    roleCache[email] = role;
    return role;
  };

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
    .map(function (rec) { return visibleSubmission_(rec, user, roleOf); });
}

function cardExists_(cardRow) {
  const data = getData();
  return (data.items || []).some(function (item) { return Number(item.row) === Number(cardRow); });
}

function getSubmissionCounts_() {
  const counts = {};
  readSubmissionRows_().forEach(function (rec) {
    const key = Number(rec.cardRow);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function getDisplayedSubmissions_() {
  return readSubmissionRows_()
    .filter(function (rec) { return rec.displayed; })
    .map(function (rec) {
      return {
        cardRow: Number(rec.cardRow),
        email: rec.email,
        text: rec.text,
        createdAt: formatDateTime_(rec.createdAt)
      };
    });
}


/* ============================================================
 * Public API (all token-gated)
 * ============================================================ */

function getSubmissions(token, cardRow) {
  const user = requireLogin_(token);
  return submissionsForCard_(cardRow, user);
}

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

    try { logAudit_('SUBMISSION_ADD', cardRow, { id: id, cardRow: cardRow, text: content }, user.email); } catch (err) {}
    return submissionsForCard_(cardRow, user);
  });
}

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
    if (!canEditSubmission_(user, rec)) {
      if (submissionLocked_(rec)) throw new Error('This submission is locked by an editor and cannot be edited.');
      throw new Error('You can only edit your own submissions.');
    }

    const sh = submissionsSheet_();
    sh.getRange(rec.row, SUBMISSION_COL.TEXT).setValue(content);
    sh.getRange(rec.row, SUBMISSION_COL.UPDATED_AT).setValue(new Date());

    try { logAudit_('SUBMISSION_UPDATE', rec.cardRow, { id: submissionId, text: content }, user.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, user);
  });
}

function lockSubmission(submissionId, token) {
  const editor = requireEditor_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');
    if (submissionLocked_(rec) && getUserRole(rec.lockedBy) === 'ADMIN' && editor.role !== 'ADMIN') {
      throw new Error('This submission was locked by an admin and can only be changed by an admin.');
    }

    const sh = submissionsSheet_();
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_BY).setValue(editor.email);
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_AT).setValue(new Date());

    try { logAudit_('SUBMISSION_LOCK', rec.cardRow, { id: submissionId }, editor.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, editor);
  });
}

function unlockSubmission(submissionId, token) {
  const editor = requireEditor_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');
    if (submissionLocked_(rec) && getUserRole(rec.lockedBy) === 'ADMIN' && editor.role !== 'ADMIN') {
      throw new Error('This submission was locked by an admin and can only be changed by an admin.');
    }

    const sh = submissionsSheet_();
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_BY).setValue('');
    sh.getRange(rec.row, SUBMISSION_COL.LOCKED_AT).setValue(null);

    try { logAudit_('SUBMISSION_UNLOCK', rec.cardRow, { id: submissionId }, editor.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, editor);
  });
}

function deleteSubmission(submissionId, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');

    const sh = submissionsSheet_();
    sh.deleteRow(rec.row);

    try { logAudit_('SUBMISSION_DELETE', rec.cardRow, { id: submissionId, text: rec.text }, admin.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, admin);
  });
}

function toggleSubmissionDisplay(submissionId, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    const rec = findSubmissionRecord_(submissionId);
    if (!rec) throw new Error('Submission not found.');

    const next = !rec.displayed;
    submissionsSheet_().getRange(rec.row, SUBMISSION_COL.DISPLAYED).setValue(next);

    try { logAudit_(next ? 'SUBMISSION_DISPLAY' : 'SUBMISSION_HIDE', rec.cardRow, { id: submissionId }, admin.email); } catch (err) {}
    return submissionsForCard_(rec.cardRow, admin);
  });
}
