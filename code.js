// --- Added helpers ---
function withLock_(fn) {
  return runWithLock_(fn);
}

/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Code.gs (Part 1)
 * ============================================================
 */


/* ============================================================
 * Web App
 * ============================================================ */

function doGet(e) {

  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle(APP.NAME)
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    )
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );

}


/* ============================================================
 * HTML Include
 * ============================================================ */

function include(filename) {

  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();

}


/* ============================================================
 * Dashboard Title
 * ============================================================ */

function stampTitle_() {

  const today = today_();

  let heading = APP.NAME;

  let full = heading + " on " + today;

  try {

    const cell = getSheet_().getRange("A1");

    const current = String(
      cell.getValue() || ""
    );

    const base = current
      .replace(
        /\s*on\s+\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}\s*$/i,
        ""
      )
      .trim();

    if (base)
      heading = base;

    full = heading + " on " + today;

    if (current !== full)
      cell.setValue(full);

  } catch (err) {}

  return {

    full,

    heading,

    asOf: today

  };

}


function getTitle_() {

  return stampTitle_().full;

}


/* ============================================================
 * Formatting
 * ============================================================ */

function isFlagged_(background) {

  if (!background)
    return false;

  const colour = String(background).toLowerCase();

  return (
    colour !== "#ffffff" &&
    colour !== ""
  );

}


/* ============================================================
 * Read Dashboard Data
 * ============================================================ */

function getData() {

  const sheet = getSheet_();
  const rows = getSheetDataRows_(sheet);

  if (!rows.length) {

    const title = stampTitle_();

    return {

      title: title.full,

      heading: title.heading,

      asOf: title.asOf,

      items: []

    };

  }

  const items = rows.map(function (rowSpec) {

    let actionHtml = escHtml_(rowSpec.action);

    try {
      const richValue = sheet.getRange(rowSpec.rowNumber, COL.ACTION).getRichTextValue();
      actionHtml = richToHtml_(richValue, rowSpec.action);
    } catch (err) {}

    let flagged = false;

    try {
      flagged = isFlagged_(sheet.getRange(rowSpec.rowNumber, COL.REVIEW_DATE).getBackground());
    } catch (err) {}

    return {

      row: rowSpec.rowNumber,

      id: rowSpec.id,

      sector: rowSpec.sector,

      description: rowSpec.description,

      entryDate: formatDate_(rowSpec.entryDate),

      action: rowSpec.action,

      actionHtml: actionHtml,

      responsibility: rowSpec.responsibility,

      reviewDate: formatDate_(rowSpec.reviewDate),

      flagged: flagged

    };

  });

  const title = stampTitle_();

  return {

    title: title.full,

    heading: title.heading,

    asOf: title.asOf,

    items: items

  };

}


/* ============================================================
 * Update Existing Item
 * ============================================================ */

function updateItem(item) {

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

    return getData();

  });

}


/* ============================================================
 * Add New Item
 * ============================================================ */

function addItem(item) {

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

    sheet
      .getRange(
        row,
        1,
        1,
        CONFIG.SHEET.NUM_COLS
      )
      .setValues([[
        id,
        normalized.sector,
        normalized.description,
        normalized.entryDate,
        normalized.action,
        normalized.responsibility,
        normalized.reviewDate
      ]]);

    sheet
      .getRange(
        row,
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

    return getData();

  });

}

function deleteItem(row) {
  return withLock_(function(){
    try {
      const sheet = getSheet_();
      sheet.deleteRow(row);
      dataRenumber_();
      return getData();
    } catch(err){throw new Error(err.message);} 
  });
}

function renumber_() {
  dataRenumber_();
}


function escHtml_(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function richToHtml_(rt, fallback) {
  if (!rt) return escHtml_(fallback);
  var runs = null;
  try { runs = rt.getRuns(); } catch (e) { runs = null; }
  if (!runs || !runs.length) return escHtml_(rt.getText());
  var out = [];
  for (var i = 0; i < runs.length; i++) {
    var t = runs[i].getText();
    if (t === '' || t === null) continue;
    var css = [];
    var st = null;
    try { st = runs[i].getTextStyle(); } catch (e) { st = null; }
    if (st) {
      var col = null;
      try {
        var co = st.getForegroundColorObject();
        if (co) { col = co.asRgbColor().asHexString(); }
      } catch (e2) {
        try { col = st.getForegroundColor(); } catch (e3) { col = null; }
      }
      if (col && String(col).length >= 4) {
        var c9 = String(col);
        if (c9.length === 9) { c9 = '#' + c9.substring(3); }
        css.push('color:' + c9);
      }
      try { if (st.isBold()) css.push('font-weight:700'); } catch (e4) {}
      try { if (st.isItalic()) css.push('font-style:italic'); } catch (e5) {}
      try { if (st.isUnderline()) css.push('text-decoration:underline'); } catch (e6) {}
    }
    var body = escHtml_(t);
    var url = null;
    try { url = runs[i].getLinkUrl(); } catch (e8) { url = null; }
    if (url) {
      var au = absUrl_(url);
      if (au) { body = '<a href="' + au + '" target="_blank" rel="noopener noreferrer">' + body + '</a>'; }
    }
    if (css.length) { out.push('<span style="' + css.join(';') + '">' + body + '</span>'); }
    else { out.push(body); }
  }
  return out.join('');
}




var __SS_URL_ = null;
function ssBaseUrl_() {
  if (__SS_URL_ === null) {
    try { __SS_URL_ = SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch (e) { __SS_URL_ = ''; }
  }
  return __SS_URL_;
}

function absUrl_(u) {
  if (!u) return '';
  var s = String(u);
  if (s.charAt(0) === '#') {
    var base = ssBaseUrl_();
    if (!base) return '';
    return base.split('#')[0] + s;
  }
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (s.charAt(0) === '/') return '';
  return 'https://' + s;
}

function dailyDateUpdate() {
  stampTitle_();
}
