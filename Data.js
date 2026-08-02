/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Data.gs
 * Sheet data maintenance
 * ============================================================
 */

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
  const rows = sheet.getRange(startRow, 1, lastRow - startRow + 1, CONFIG.SHEET.NUM_COLS).getValues();
  const ids = rows.map(function (_, index) {
    return [index + 1];
  });
  sheet.getRange(startRow, 1, ids.length, 1).setValues(ids);
}
