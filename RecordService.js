/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * RecordService.gs
 * Record CRUD service (every write runs inside the script lock;
 * authorization is checked before the lock is acquired)
 * ============================================================
 */

/**
 * Appends a new record to the sheet with an auto-incremented ID, borders
 * and a review-date flag background.
 * @param {Object} item The record payload.
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getData() payload.
 */
function addRecord_(item, token) {
  const editor = requireEditor_(token);

  return runWithLock_(function () {
    const sheet = getSheet_();
    const normalized = normalizeItemForSheet_(item);

    const lastRow = Math.max(
      sheet.getLastRow(),
      CONFIG.SHEET.START_ROW - 1
    );

    const row = lastRow + 1;

    const id =
      row -
      CONFIG.SHEET.START_ROW +
      1;

    const rowRange = sheet.getRange(
      row,
      1,
      1,
      CONFIG.SHEET.NUM_COLS
    );

    rowRange.setValues([[
      id,
      normalized.sector,
      normalized.description,
      normalized.entryDate,
      normalized.action,
      normalized.responsibility,
      normalized.reviewDate
    ]]);

    rowRange.setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      CONFIG.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

    sheet
      .getRange(
        row,
        COL.REVIEW_DATE
      )
      .setBackground(
        item.flagged
          ? CONFIG.COLORS.FLAG
          : CONFIG.COLORS.NORMAL
      );

    invalidateDataCache_();

    try {
      notifyStaffLocked_(NOTIFICATION_TYPES.RECORD, 'New item added', 'Record #' + id + ' · ' + normalized.sector + (normalized.description ? ' — ' + normalized.description : ''), '', editor.email);
    } catch (err) {}

    return getData();
  });
}

/**
 * Updates an existing record in place, preserving action-cell rich text
 * when the text is unchanged.
 * @param {Object} item The record payload (includes the sheet row number).
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getData() payload.
 */
function updateRecord_(item, token) {
  const editor = requireEditor_(token);

  return runWithLock_(function () {
    const sheet = getSheet_();
    const normalized = normalizeItemForSheet_(item);
    const row = item.row;

    function toPlainText_(v) {
      if (v == null) return "";
      if (typeof v.getText === "function") { try { return String(v.getText()); } catch (e) {} }
      return String(v);
    }

    function writeIfChanged(col, oldVal, newVal) {
      const o = toPlainText_(oldVal).replace(/\r\n/g, "\n");
      const n = String(newVal == null ? "" : newVal).replace(/\r\n/g, "\n");
      if (o !== n) {
        sheet.getRange(row, col).setValue(newVal);
      }
    }

    // Read old values and only write changed cells to preserve rich text / hyperlinks
    writeIfChanged(COL.ID, sheet.getRange(row, COL.ID).getValue(), normalized.id);
    writeIfChanged(COL.SECTOR, sheet.getRange(row, COL.SECTOR).getValue(), normalized.sector);
    writeIfChanged(COL.DESCRIPTION, sheet.getRange(row, COL.DESCRIPTION).getValue(), normalized.description);
    writeIfChanged(COL.ENTRY_DATE, sheet.getRange(row, COL.ENTRY_DATE).getValue(), normalized.entryDate);
    writeIfChanged(COL.ACTION, sheet.getRange(row, COL.ACTION).getValue(), normalized.action);
    writeIfChanged(COL.RESPONSIBILITY, sheet.getRange(row, COL.RESPONSIBILITY).getValue(), normalized.responsibility);
    writeIfChanged(COL.REVIEW_DATE, sheet.getRange(row, COL.REVIEW_DATE).getValue(), normalized.reviewDate);

    sheet
      .getRange(item.row, COL.REVIEW_DATE)
      .setBackground(
        item.flagged
          ? CONFIG.COLORS.FLAG
          : CONFIG.COLORS.NORMAL
      );

    invalidateDataCache_();

    try {
      notifyStaffLocked_(NOTIFICATION_TYPES.RECORD, 'Record updated', 'Record #' + normalized.id + ' · ' + normalized.sector + (normalized.description ? ' — ' + normalized.description : ''), '', editor.email);
    } catch (err) {}

    return getData();
  });
}

/**
 * Deletes a record row and re-sequences the remaining IDs.
 * @param {number} row The physical sheet row to delete.
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getData() payload.
 */
function deleteRecord_(row, token) {
  const editor = requireEditor_(token);

  return runWithLock_(function () {
    const sheet = getSheet_();
    const deletedId = row >= CONFIG.SHEET.START_ROW ? (row - CONFIG.SHEET.START_ROW + 1) : '';
    sheet.deleteRow(row);
    dataRenumber_();
    invalidateDataCache_();

    try {
      notifyStaffLocked_(NOTIFICATION_TYPES.RECORD, 'Item deleted', 'Record #' + deletedId + ' was removed from the dashboard.', '', editor.email);
    } catch (err) {}

    return getData();
  });
}

/**
 * Marks a record's review as done by setting the review-date cell background
 * to the configured done colour.
 * @param {number} row The physical sheet row.
 * @param {string} token Session token (admin required).
 * @returns {{items: Object[], summary: Object}} Updated items + summary.
 */
function markReviewDone_(row, token) {
  const admin = requireAdmin_(token);

  return runWithLock_(function () {
    const sheet = getSheet_();
    sheet.getRange(row, COL.REVIEW_DATE).setBackground(CONFIG.COLORS.REVIEW_DONE);
    logAudit_(ACTIONS.REVIEW_DONE, String(row), 'Marked review as done');
    invalidateDataCache_();

    try {
      notifyStaffLocked_(NOTIFICATION_TYPES.RECORD, 'Review marked done', 'Review for record #' + (row - CONFIG.SHEET.START_ROW + 1) + ' was marked as done.', '', admin.email);
    } catch (err) {}

    const data = getData();
    return {
      items: data.items || [],
      summary: buildSummaryFromItems(data.items || [])
    };
  });
}

const RecordService = Object.freeze({
  add: addRecord_,
  update: updateRecord_,
  remove: deleteRecord_,
  markReviewDone: markReviewDone_
});
