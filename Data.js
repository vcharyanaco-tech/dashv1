/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Data.gs
 * Data access layer
 * ============================================================
 */

function dataSheet_() {
  return getSheet_();
}

function dataLastRow_() {
  return dataSheet_().getLastRow();
}

function dataCount_() {
  const sheet = dataSheet_();
  const startRow = getDataStartRow_(sheet);
  return Math.max(0, dataLastRow_() - startRow + 1);
}

function dataRead_() {
  const sheet = dataSheet_();
  const startRow = getDataStartRow_(sheet);
  const count = dataCount_();
  if (!count) return [];
  return sheet.getRange(startRow, 1, count, CONFIG.SHEET.NUM_COLS).getValues();
}

function dataUpdate_(row, item) {
  const normalized = normalizeItemForSheet_(item);
  dataSheet_().getRange(row, 1, 1, CONFIG.SHEET.NUM_COLS).setValues([[
    normalized.id,
    normalized.sector,
    normalized.description,
    normalized.entryDate,
    normalized.action,
    normalized.responsibility,
    normalized.reviewDate
  ]]);
}

function dataInsert_(item) {
  const sheet = dataSheet_();
  const normalized = normalizeItemForSheet_(item);
  const last = Math.max(sheet.getLastRow(), CONFIG.SHEET.START_ROW - 1) + 1;
  sheet.getRange(last, 1, 1, CONFIG.SHEET.NUM_COLS).setValues([[
    normalized.id,
    normalized.sector,
    normalized.description,
    normalized.entryDate,
    normalized.action,
    normalized.responsibility,
    normalized.reviewDate
  ]]);
  return last;
}

function dataDelete_(row) {
  dataSheet_().deleteRow(row);
}

function dataRenumber_() {
  const startRow = getDataStartRow_(dataSheet_());
  const lastRow = dataSheet_().getLastRow();
  if (lastRow < startRow) return;
  const rows = dataSheet_().getRange(startRow, 1, lastRow - startRow + 1, CONFIG.SHEET.NUM_COLS).getValues();
  rows.forEach(function (r, index) {
    dataSheet_().getRange(startRow + index, 1).setValue(index + 1);
  });
}
