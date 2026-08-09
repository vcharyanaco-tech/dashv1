/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Data.gs
 * Sheet data maintenance
 * ============================================================
 */

/**
 * Batch-writes plain values to the dashboard sheet via the Advanced Sheets
 * Service (Sheets.Spreadsheets.Values.batchUpdate) — ONE HTTP round-trip
 * instead of one per range. Mirrors the fast bulk-read path in Utils.js:
 * it degrades to the classic per-range setValues() when the advanced
 * service is unavailable, so every caller keeps working either way.
 *
 * Only plain cell values are supported (use setRichTextValue for
 * hyperlink/rich-text cells; formatting like backgrounds/borders is not
 * a "value" and is untouched by this helper).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The dashboard sheet.
 * @param {Array<{row: number, col: number, numRows?: number, numCols?: number, values: Array<Array<*>>}>} updates
 *   Range anchors are 1-based (row/col = first cell of the block).
 * @returns {boolean} true when the write succeeded (via either API).
 */
function dataWriteValuesBatch_(sheet, updates) {
  if (!sheet || !updates || !updates.length) return false;

  const ssId = getPreferredSpreadsheetId_();
  const sheetName = sheet.getName();

  function toA1(u) {
    const notation = sheet
      .getRange(u.row, u.col, u.numRows || 1, u.numCols || 1)
      .getA1Notation();
    return sheetName + '!' + notation;
  }

  // Fast path: one batchUpdate call.
  if (typeof Sheets !== 'undefined') {
    try {
      Sheets.Spreadsheets.Values.batchUpdate({
        spreadsheetId: ssId,
        valueInputOption: 'RAW', // match setValues() semantics, no re-parsing
        data: updates.map(function (u) {
          return { range: toA1(u), values: u.values, majorDimension: 'ROWS' };
        })
      });
      return true;
    } catch (err) {
      console.warn('Advanced batch write failed, falling back to classic API: ' + err.message);
    }
  }

  // Classic fallback: one setValues() per block.
  updates.forEach(function (u) {
    sheet.getRange(u.row, u.col, u.numRows || 1, u.numCols || 1).setValues(u.values);
  });
  return true;
}

/**
 * Re-sequences the ID column (column A) after a row deletion so that
 * IDs remain contiguous from 1..N.
 * Runs inside the caller's lock; must never be called from the UI directly.
 */
function dataRenumber_() {
  const sheet = getSheet_();
  if (!sheet) return;
  const startRow = getDataStartRow_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return;

  const count = lastRow - startRow + 1;
  const ids = [];
  for (let i = 0; i < count; i++) ids.push([i + 1]);

  dataWriteValuesBatch_(sheet, [{
    row: startRow,
    col: 1,
    numRows: count,
    numCols: 1,
    values: ids
  }]);
}
