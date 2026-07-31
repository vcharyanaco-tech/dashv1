/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Data.gs
 * Data Access Layer
 * ============================================================
 */


/* ============================================================
 * Sheet
 * ============================================================ */

function dataSheet_() {
  return getSheet_();
}


/* ============================================================
 * Last Row
 * ============================================================ */

function dataLastRow_() {
  return dataSheet_().getLastRow();
}


/* ============================================================
 * Total Records
 * ============================================================ */

function dataCount_() {

  return Math.max(
    0,
    dataLastRow_() - CONFIG.SHEET.START_ROW + 1
  );

}


/* ============================================================
 * Read All Records
 * ============================================================ */

function dataRead_() {

  const count = dataCount_();

  if (!count)
    return [];

  return dataSheet_()
    .getRange(
      CONFIG.SHEET.START_ROW,
      1,
      count,
      CONFIG.SHEET.NUM_COLS
    )
    .getValues();

}


/* ============================================================
 * Read Backgrounds
 * ============================================================ */

function dataBackgrounds_() {

  const count = dataCount_();

  if (!count)
    return [];

  return dataSheet_()
    .getRange(
      CONFIG.SHEET.START_ROW,
      COL.REVIEW_DATE,
      count,
      1
    )
    .getBackgrounds();

}


/* ============================================================
 * Rich Text
 * ============================================================ */

function dataRichText_() {

  const count = dataCount_();

  if (!count)
    return [];

  try {

    return dataSheet_()
      .getRange(
        CONFIG.SHEET.START_ROW,
        COL.ACTION,
        count,
        1
      )
      .getRichTextValues();

  } catch (err) {

    return [];

  }

}


/* ============================================================
 * Insert Record
 * ============================================================ */

function dataInsert_(row) {

  const sheet = dataSheet_();
  const normalized = normalizeItemForSheet_(row);

  const last = Math.max(
    sheet.getLastRow(),
    CONFIG.SHEET.START_ROW - 1
  ) + 1;

  sheet
    .getRange(
      last,
      1,
      1,
      CONFIG.SHEET.NUM_COLS
    )
    .setValues([[
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


/* ============================================================
 * Update Record
 * ============================================================ */

function dataUpdate_(rowNumber, values) {

  const normalized = normalizeItemForSheet_(values);

  dataSheet_()
    .getRange(
      rowNumber,
      1,
      1,
      CONFIG.SHEET.NUM_COLS
    )
    .setValues([[
      normalized.id,
      normalized.sector,
      normalized.description,
      normalized.entryDate,
      normalized.action,
      normalized.responsibility,
      normalized.reviewDate
    ]]);

}


/* ============================================================
 * Delete Record
 * ============================================================ */

function dataDelete_(rowNumber) {

  dataSheet_().deleteRow(rowNumber);

}


/* ============================================================
 * Set Flag
 * ============================================================ */

function dataSetFlag_(rowNumber, flagged) {

  dataSheet_()
    .getRange(
      rowNumber,
      COL.REVIEW_DATE
    )
    .setBackground(
      flagged
        ? CONFIG.COLORS.FLAG
        : CONFIG.COLORS.NORMAL
    );

}


/* ============================================================
 * Border
 * ============================================================ */

function dataApplyBorder_(rowNumber) {

  dataSheet_()
    .getRange(
      rowNumber,
      1,
      1,
      CONFIG.SHEET.NUM_COLS
    )
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      CONFIG.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

}


/* ============================================================
 * Renumber IDs
 * ============================================================ */

function dataRenumber_() {

  const rows = dataCount_();

  if (!rows)
    return;

  const ids = [];

  for (let i = 0; i < rows; i++) {
    ids.push([i + 1]);
  }

  dataSheet_()
    .getRange(
      CONFIG.SHEET.START_ROW,
      COL.ID,
      rows,
      1
    )
    .setValues(ids);

}