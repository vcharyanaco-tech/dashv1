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

  // JSON inspection endpoint for debugging bound spreadsheet
  try {
    if (e && e.parameter && (e.parameter.inspect === '1' || e.parameter.inspect === 'true')) {
      const info = inspectBoundSheet_();
      return ContentService
        .createTextOutput(JSON.stringify(info))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {}

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

function getFlaggedBackgrounds_(sheet, rows) {
  const out = {};

  if (!sheet || !rows || !rows.length) {
    return out;
  }

  let start = Infinity;
  let end = -Infinity;

  rows.forEach(function (rowSpec) {
    if (rowSpec && rowSpec.rowNumber) {
      start = Math.min(start, rowSpec.rowNumber);
      end = Math.max(end, rowSpec.rowNumber);
    }
  });

  if (start === Infinity || end < start) {
    return out;
  }

  try {
    const colors = sheet
      .getRange(start, COL.REVIEW_DATE, end - start + 1, 1)
      .getBackgrounds();

    rows.forEach(function (rowSpec) {
      if (rowSpec && rowSpec.rowNumber) {
        out[String(rowSpec.rowNumber)] = isFlagged_(colors[rowSpec.rowNumber - start][0]);
      }
    });
  } catch (err) {}

  return out;
}


/* ============================================================
 * Read Dashboard Data
 * ============================================================ */

function getData() {

  const sheet = getSheet_();
  let rows = getSheetDataRows_(sheet);

  // Fallback: if no rows in dashboard sheet, try deriving items from Audit Log
  if (!rows || !rows.length) {
    rows = getAuditDerivedRows_();
  }

  if (!rows.length) {

    const title = stampTitle_();

    return {

      title: title.full,

      heading: title.heading,

      asOf: title.asOf,

      items: []

    };

  }

  const backgrounds = getFlaggedBackgrounds_(sheet, rows);

  const items = rows.map(function (rowSpec) {

    let actionHtml = escHtml_(rowSpec.action);

    const flagged = backgrounds[String(rowSpec.rowNumber)] || false;

    const displayFields = (rowSpec.displayFields || []).map(function (field) {
      const label = String(field && field.label ? field.label : "").trim();
      const value = field && field.value !== undefined ? field.value : "";
      const normalizedLabel = label.toLowerCase();
      let formattedValue = value;

      if (normalizedLabel.indexOf("date") !== -1 && value !== "") {
        formattedValue = formatDate_(value);
      }

      let fieldHtml = "";
      if (normalizedLabel.indexOf("date") === -1) {
        if (field && field.html) {
          fieldHtml = field.html;
        } else if (looksLikeUrl_(formattedValue)) {
          fieldHtml = linkifyText_(formattedValue);
        }
      }

      if (normalizedLabel.indexOf("action") !== -1 && fieldHtml) {
        actionHtml = fieldHtml;
      }

      return {
        label: label,
        value: formattedValue,
        html: fieldHtml
      };
    });

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

      flagged: flagged,

      displayFields: displayFields

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

function updateItem(item, token) {

  requireEditor_(token);

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

function addItem(item, token) {

  requireEditor_(token);

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

function deleteItem(row, token) {
  return withLock_(function(){
    try {
      requireEditor_(token);
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

function looksLikeUrl_(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  return /^(https?:\/\/|mailto:|ftp:\/\/|www\.)/i.test(text) || /(?:\.[a-z]{2,})(?:\/|$)/i.test(text);
}

function normalizeUrl_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^www\./i.test(text)) return 'https://' + text;
  return text;
}

function linkifyText_(text) {
  if (text === null || text === undefined) return '';
  const source = String(text);
  if (!source) return '';
  const pieces = source.split(/(\s+)/);
  return pieces.map(function (piece) {
    if (!looksLikeUrl_(piece)) {
      return escHtml_(piece);
    }
    const url = normalizeUrl_(piece);
    const safeUrl = absUrl_(url);
    if (!safeUrl) {
      return escHtml_(piece);
    }
    return '<a href="' + escHtml_(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + escHtml_(piece) + '</a>';
  }).join('');
}

function richToHtml_(rt, fallback) {
  if (!rt) return linkifyText_(fallback);
  var runs = null;
  try { runs = rt.getRuns(); } catch (e) { runs = null; }
  if (!runs || !runs.length) {
    var text = '';
    try { text = rt.getText(); } catch (e) { text = ''; }
    return linkifyText_(text || fallback);
  }
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
      if (au) { body = '<a href="' + escHtml_(au) + '" target="_blank" rel="noopener noreferrer">' + body + '</a>'; }
    } else {
      body = linkifyText_(t);
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
  var s = String(u).trim();
  if (!s) return '';
  if (s.charAt(0) === '#') {
    var base = ssBaseUrl_();
    if (!base) return '';
    return base.split('#')[0] + s;
  }
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (s.charAt(0) === '/') return '';
  if (s.indexOf('www.') === 0) return 'https://' + s;
  return 'https://' + s;
}


function getAppData(token) {
  const user = requireLogin_(token);
  const data = getData();
  const items = data.items || [];
  const audit = getAuditEntries(80);
  const settings = getAppSettings();
  const summary = buildSummaryFromItems(items);
  const analytics = {
    sectors: buildSectorReportFromSummary(summary),
    flaggedItems: buildFlaggedItemsFromItems(items),
    trend: buildMonthlyTrendFromItems(items)
  };
  return {
    user: {
      email: user.email,
      role: user.role,
      loggedIn: true
    },
    items: items,
    summary: summary,
    analytics: analytics,
    audit: audit,
    settings: settings
  };
}

function dailyDateUpdate() {
  stampTitle_();
}
