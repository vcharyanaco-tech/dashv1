/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Code.gs (Part 1) - Web-app entry facade
 * ============================================================
 */


/* ============================================================
 * Web App
 * ============================================================ */

/**
 * Web-app entry point. Serves the dashboard UI; supports a ?inspect=1
 * JSON dump of the bound spreadsheet for debugging.
 * @param {Object} e The web-app event object.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} The evaluated dashboard page.
 */
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

  // Serve the full app UI (index.html + inline styles/script).
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

}


/* ============================================================
 * HTML Include
 * ============================================================ */

/**
 * Includes an HTML file's content into a template page (used with <?!= include('x') ?>).
 * @param {string} filename Name of an HTML file in the project.
 * @returns {string} The file's rendered HTML content.
 */
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
 * Read Dashboard Data
 * ============================================================ */

/**
 * Reads the dashboard records (sheet data, with a fallback to derived audit
 * rows) plus review statuses, and returns them as display-ready items.
 * No auth token is required for the read path.
 * @returns {{title: string, heading: string, asOf: string, items: Object[]}}
 */
function getData() {

  const cached = getCachedData_();
  if (cached) return cached;

  const sheet = getSheet_();
  let rows = getSheetDataRows_(sheet);

  // Fallback: if no rows in dashboard sheet, try deriving items from Audit Log
  if (!rows || !rows.length) {
    rows = getAuditDerivedRows_();
  }

  if (!rows.length) {

    const title = stampTitle_();

    const result = {

      title: title.full,

      heading: title.heading,

      asOf: title.asOf,

      items: []

    };

    putCachedData_(result);

    return result;

  }

  const items = DashboardService.buildItems(rows, sheet);

  const title = stampTitle_();

  const result = {

    title: title.full,

    heading: title.heading,

    asOf: title.asOf,

    items: items

  };

  putCachedData_(result);

  return result;

}


/* ============================================================
 * Update Existing Item
 * ============================================================ */

/**
 * Updates an existing record in place, preserving action-cell rich text
 * when the text is unchanged.
 * @param {Object} item The record payload (includes the sheet row number).
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getData() payload.
 */
function updateItem(item, token) {
  return RecordService.update(item, token);
}


/* ============================================================
 * Add New Item
 * ============================================================ */

/**
 * Appends a new record to the sheet with an auto-incremented ID, borders
 * and a review-date flag background.
 * @param {Object} item The record payload.
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getData() payload.
 */
function addItem(item, token) {
  return RecordService.add(item, token);
}

/**
 * Deletes a record row and re-sequences the remaining IDs.
 * @param {number} row The physical sheet row to delete.
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getData() payload.
 */
function deleteItem(row, token) {
  return RecordService.remove(row, token);
}

/**
 * Marks a record's review as done by setting the review-date cell background
 * to the configured done colour.
 * @param {number} row The physical sheet row.
 * @param {string} token Session token (admin required).
 * @returns {{items: Object[], summary: Object}} Updated items + summary.
 */
function markReviewDone(row, token) {
  return RecordService.markReviewDone(row, token);
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


/**
 * Restricts the visible records to the caller's department/office when those
 * are set (department matches the record's sector; office matches its
 * responsibility). Admins and users without a scope see everything.
 * @param {Object[]} items Display-ready items from getData().
 * @param {Object} user Authenticated user context.
 * @returns {Object[]} Scoped item list.
 */
function scopeItemsForUser_(items, user) {
  const department = String((user && user.department) || '').trim().toLowerCase();
  const office = String((user && user.office) || '').trim().toLowerCase();
  if ((!department && !office) || (user && user.role === ROLES.ADMIN)) {
    return items;
  }
  return items.filter(function (item) {
    const sector = String(item.sector || '').trim().toLowerCase();
    const responsibility = String(item.responsibility || '').trim().toLowerCase();
    const departmentOk = !department || (sector === department || (sector && sector.indexOf(department) !== -1) || (department && department.indexOf(sector) !== -1));
    const officeOk = !office || (responsibility === office || (responsibility && responsibility.indexOf(office) !== -1) || (office && office.indexOf(responsibility) !== -1));
    return departmentOk && officeOk;
  });
}

/**
 * Aggregates everything the dashboard needs for one full-screen load:
 * user identity + permissions, records (scoped to the caller's department/
 * office), summary, analytics, settings and the submission overview. The
 * audit tail is intentionally excluded and is fetched lazily by the client
 * when the Audit tab is opened.
 * @param {string} token Session token (any logged-in user).
 * @returns {Object} The full dashboard payload.
 */
function getAppData(token) {
  const user = requireLogin_(token);
  const context = getUserContext(user.email);
  const data = getData();
  const items = scopeItemsForUser_(data.items || [], context);
  const settings = getAppSettings();
  const summary = buildSummaryFromItems(items);
  const analytics = buildAnalytics_(items);
  const submissionOverview = getSubmissionOverview_();
  return {
    user: {
      email: context.email,
      username: context.username || '',
      role: context.role,
      loggedIn: true,
      group: context.group,
      department: context.department,
      office: context.office,
      groups: context.groups,
      permissions: context.permissions
    },
    items: items,
    summary: summary,
    analytics: analytics,
    settings: settings,
    submissionCounts: submissionOverview.counts,
    submissionFlash: submissionOverview.flash,
    displayedSubmissions: submissionOverview.displayed
  };
}

/**
 * Daily trigger handler that refreshes the "… on dd.MM.yyyy" title cell.
 */
function dailyDateUpdate() {
  stampTitle_();
}

/* ============================================================
 * API Endpoint (for GitHub Pages frontend)
 * ============================================================ */

/**
 * POST endpoint for the GitHub Pages frontend. Accepts JSON body
 * with `{function: string, args: any[]}` and returns JSON.
 * @param {Object} e The POST event object.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response.
 */
function getServerTime() {
  return Date.now();
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const fn = body.function;
    const args = body.args || [];
    // Resolve the global function by name. eval(fn) returns the function
    // reference without invoking it (untrusted input only names a function).
    const fnRef = (typeof fn === 'string') ? eval(fn) : null;
    if (typeof fnRef !== 'function') {
      return JsonResponse_({ error: 'Unknown function: ' + fn });
    }
    const result = fnRef.apply(null, args);
    return JsonResponse_({ result: result });
  } catch (err) {
    return JsonResponse_({ error: err.message || String(err) });
  }
}

function JsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
