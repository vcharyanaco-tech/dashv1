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

  const lastRow = sheet.getLastRow();

  const rowCount = Math.max(
    lastRow - CONFIG.SHEET.START_ROW + 1,
    0
  );

  if (rowCount === 0) {

    const title = stampTitle_();

    return {

      title: title.full,

      heading: title.heading,

      asOf: title.asOf,

      items: []

    };

  }

  const values = sheet
    .getRange(
      CONFIG.SHEET.START_ROW,
      1,
      rowCount,
      CONFIG.SHEET.NUM_COLS
    )
    .getValues();

  const backgrounds = sheet
    .getRange(
      CONFIG.SHEET.START_ROW,
      COL.REVIEW_DATE,
      rowCount,
      1
    )
    .getBackgrounds();

  let rich = null;

  try {

    rich = sheet
      .getRange(
        CONFIG.SHEET.START_ROW,
        COL.ACTION,
        rowCount,
        1
      )
      .getRichTextValues();

  } catch (err) {

    rich = null;

  }

  const items = values.map(function (row, index) {

    return {

      row:
        CONFIG.SHEET.START_ROW + index,

      id:
        row[COL.ID - 1],

      sector:
        row[COL.SECTOR - 1],

      description:
        row[COL.DESCRIPTION - 1],

      entryDate:
        formatDate_(row[COL.ENTRY_DATE - 1]),

      action:
        row[COL.ACTION - 1],

      actionHtml:
        rich
          ? richToHtml_(
              rich[index][0],
              row[COL.ACTION - 1]
            )
          : escHtml_(
              row[COL.ACTION - 1]
            ),

      responsibility:
        row[
          COL.RESPONSIBILITY - 1
        ],

      reviewDate:
        formatDate_(
          row[COL.REVIEW_DATE - 1]
        ),

      flagged:
        isFlagged_(
          backgrounds[index][0]
        )

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

    // Columns A-D
    sheet
      .getRange(item.row, COL.ID, 1, 4)
      .setValues([[
        item.id,
        item.sector,
        item.description,
        item.entryDate
      ]]);

    // Column E (Action) - only rewrite when the text actually changed,
    // so the rich-text colours in the sheet are preserved otherwise.
    const actionCell = sheet.getRange(item.row, COL.ACTION);
    const oldAction = String(actionCell.getValue() == null ? "" : actionCell.getValue());
    const newAction = String(item.action == null ? "" : item.action);

    if (oldAction.replace(/\r\n/g, "\n") !== newAction.replace(/\r\n/g, "\n")) {
      actionCell.setValue(newAction);
    }

    // Columns F-G
    sheet
      .getRange(item.row, COL.RESPONSIBILITY, 1, 2)
      .setValues([[
        item.responsibility,
        item.reviewDate
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
        item.sector,
        item.description,
        item.entryDate,
        item.action,
        item.responsibility,
        item.reviewDate
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
  renumber_();
  return getData();
    } catch(err){throw new Error(err.message);} 
  });
}

function renumber_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - CONFIG.SHEET.START_ROW + 1;
  if (numRows <= 0) return;
  const ids = [];
  for (var i = 0; i < numRows; i++) ids.push([i + 1]);
  sheet.getRange(CONFIG.SHEET.START_ROW, 1, numRows, 1).setValues(ids);
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
