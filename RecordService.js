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

    // Columns A-D
    sheet
      .getRange(item.row, COL.ID, 1, 4)
      .setValues([[
        normalized.id,
        normalized.sector,
        normalized.description,
        normalized.entryDate
      ]]);

    // Column E (Action) - only rewrite when the text actually changed,
    // so the rich-text colours in the sheet are preserved otherwise.
    const actionCell = sheet.getRange(item.row, COL.ACTION);
    const oldAction = String(actionCell.getValue() == null ? "" : actionCell.getValue());
    const newAction = String(normalized.action == null ? "" : normalized.action);

    if (oldAction.replace(/\r\n/g, "\n") !== newAction.replace(/\r\n/g, "\n")) {
      actionCell.setValue(newAction);
    }

    // Columns F-G
    sheet
      .getRange(item.row, COL.RESPONSIBILITY, 1, 2)
      .setValues([[
        normalized.responsibility,
        normalized.reviewDate
      ]]);

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
