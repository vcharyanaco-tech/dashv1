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
 * Web-app entry point. Supports a ?inspect=1 JSON dump of the bound
 * spreadsheet for debugging, and otherwise serves the dashboard UI directly
 * from GAS (template-evaluated, no redirect). CSS/JS are inlined server-side
 * via include() so no external asset requests are needed.
 * @param {Object} e The web-app event object.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} HTML output.
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

  // Serve the dashboard UI directly from GAS using the template.
  // index.html uses <?!= include('styles') ?> and <?!= include('script') ?>
  // which inline the CSS/JS server-side — no external asset requests needed.
  // This avoids the "created by Google Apps Script" banner because the banner
  // is only injected when GAS renders the outer iframe wrapper, not when it
  // serves a template-evaluated HtmlOutput with setXFrameOptionsMode(ALLOWALL).
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle(APP.NAME);

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
 * @returns {Object} Fresh getAppData() payload (items, summary, analytics).
 */
function updateItem(item, token) {
  RecordService.update(item, token);
  return getAppData(token);
}


/* ============================================================
 * Add New Item
 * ============================================================ */

/**
 * Appends a new record to the sheet with an auto-incremented ID, borders
 * and a review-date flag background.
 * @param {Object} item The record payload.
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getAppData() payload (items, summary, analytics).
 */
function addItem(item, token) {
  RecordService.add(item, token);
  return getAppData(token);
}

/**
 * Deletes a record row and re-sequences the remaining IDs.
 * @param {number} row The physical sheet row to delete.
 * @param {string} token Session token (editor+ required).
 * @returns {Object} Fresh getAppData() payload (items, summary, analytics).
 */
function deleteItem(row, token) {
  RecordService.remove(row, token);
  return getAppData(token);
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

/**
 * Reopens a record's review (mark as not done). Admin required.
 * @param {number} row The physical sheet row.
 * @param {string} token Session token (admin required).
 * @returns {{items: Object[], summary: Object}} Updated items + summary.
 */
function markReviewNotDone(row, token) {
  return RecordService.markReviewNotDone(row, token);
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
    return '<a href="' + escHtml_(safeUrl) + '" target="_blank" rel="noopener noreferrer" data-embed="1">' + escHtml_(piece) + '</a>';
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
      if (au) { body = '<a href="' + escHtml_(au) + '" target="_blank" rel="noopener noreferrer" data-embed="1">' + body + '</a>'; }
    } else {
      body = linkifyText_(t);
    }
    if (css.length) { out.push('<span style="' + css.join(';') + '">' + body + '</span>'); }
    else { out.push(body); }
  }
  return out.join('');
}

/**
 * Returns the first link URL found in a rich-text value (or the value's own
 * link URL), or an empty string when there is no link.
 * @param {Object} rt A RichTextValue object (or null/undefined).
 * @returns {string}
 */
function extractLinkUrl_(rt) {
  if (!rt) return "";
  var runs = null;
  try { runs = rt.getRuns(); } catch (e) { runs = null; }
  if (runs && runs.length) {
    for (var i = 0; i < runs.length; i++) {
      var u = null;
      try { u = runs[i].getLinkUrl(); } catch (e2) { u = null; }
      if (u) return String(u);
    }
    return "";
  }
  try {
    if (typeof rt.getLinkUrl === "function") {
      var direct = rt.getLinkUrl();
      return direct ? String(direct) : "";
    }
  } catch (e3) {}
  return "";
}

/**
 * Returns the display text of the portion of a rich-text value that carries a
 * hyperlink (the concatenated text of linked runs), or "" when nothing is
 * linked. Used to round-trip the link description back to the editor.
 * @param {Object} rt A RichTextValue object (or null/undefined).
 * @returns {string}
 */
function extractLinkText_(rt) {
  if (!rt) return "";
  var runs = null;
  try { runs = rt.getRuns(); } catch (e) { runs = null; }
  if (runs && runs.length) {
    var out = "";
    for (var i = 0; i < runs.length; i++) {
      var u = null;
      try { u = runs[i].getLinkUrl(); } catch (e2) { u = null; }
      if (u) {
        var t = "";
        try { t = runs[i].getText(); } catch (e3) { t = ""; }
        out += t;
      }
    }
    return out;
  }
  return "";
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
 * Returns the records visible to the caller. Office/department scoping was
 * removed by decision: every logged-in user (any role) sees all records.
 * Kept as a single chokepoint so the review-calendar export and the main
 * dashboard load behave identically.
 * @param {Object[]} items Display-ready items from getData().
 * @param {Object} user Authenticated user context.
 * @returns {Object[]} All items.
 */
function scopeItemsForUser_(items, user) {
  return items;
}

/**
 * Matches a record responsibility against a user's office (case-insensitive,
 * both exact and partial containment). Used by review reminders/notifications.
 * @param {string} responsibility Record responsibility.
 * @param {string} office User office.
 * @returns {boolean}
 */
function responsibilityMatchesOffice_(responsibility, office) {
  const r = String(responsibility || '').trim().toLowerCase();
  const o = String(office || '').trim().toLowerCase();
  if (!r || !o) return false;
  return r === o || r.indexOf(o) !== -1 || o.indexOf(r) !== -1;
}

/**
 * Matches a record responsibility against a user's full identity (username +
 * office). Group responsibilities expand to every user whose username carries
 * the group's prefix: "all postal divisional heads" -> do_*, "all divisional
 * heads" -> rms_*. Anything else falls back to office matching.
 * @param {string} responsibility Record responsibility.
 * @param {Object} user User context/record (username + office fields).
 * @returns {boolean}
 */
function responsibilityMatchesUser_(responsibility, user) {
  const r = String(responsibility || '').trim().toLowerCase();
  const username = String((user && user.username) || '').trim().toLowerCase();
  if (r === 'all postal divisional heads') {
    return username.indexOf('do_') === 0;
  }
  if (r === 'all divisional heads') {
    return username.indexOf('rms_') === 0;
  }
  return responsibilityMatchesOffice_(responsibility, user && user.office);
}

/**
 * Distinct, sorted responsibility values across all records plus the office
 * values configured on users (used to fill the edit-dialog responsibility
 * dropdown). The user office values are merged in so every office named on a
 * user record is selectable even before any record uses it as responsibility.
 * @param {Object[]} items Display-ready items from getData().
 * @param {Object[]} users User records from listUserRecords_().
 * @returns {string[]}
 */
function getDistinctResponsibilities_(items, users) {
  const seen = {};
  const out = [];
  (items || []).forEach(function (item) {
    const v = String(item.responsibility || '').trim();
    if (!v || seen[v]) return;
    seen[v] = 1;
    out.push(v);
  });
  (users || []).forEach(function (user) {
    const v = String(user.office || '').trim();
    if (!v || seen[v]) return;
    seen[v] = 1;
    out.push(v);
  });
  return out.sort(function (a, b) { return a.localeCompare(b); });
}

/**
 * Review reminders for the logged-in user: records whose responsibility matches
 * their office and whose review date is due today or tomorrow (1 day away).
 * @param {Object[]} items Scoped items (already restricted to the caller's office).
 * @param {Object} user Authenticated user context.
 * @returns {Object[]} Reminder objects {row, id, sector, description, action, responsibility, reviewDate, daysUntil}.
 */
function getReviewReminders_(items, user) {
  const office = String((user && user.office) || '').trim();
  const out = [];
  (items || []).forEach(function (item) {
    const responsibility = String(item.responsibility || '').trim();
    if (!responsibility) return;
    if (office && !responsibilityMatchesUser_(responsibility, user)) return;
    if (item.reviewStatus === 'done') return;
    const days = daysUntilDate_(item.reviewDate);
    if (days === null || days > 1) return;
    out.push({
      row: item.row,
      id: item.id,
      sector: item.sector,
      description: item.description,
      action: item.action,
      responsibility: item.responsibility,
      reviewDate: item.reviewDate,
      daysUntil: days
    });
  });
  return out;
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
  try { ensureUserRecord_(user.email); } catch (err) {}
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
    responsibilities: getDistinctResponsibilities_(data.items || [], listUserRecords_()),
    reminders: getReviewReminders_(items, context),
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

/**
 * Emails each user whose fixed responsibility has a review date exactly one
 * day away (tomorrow). Skips records already marked review-done and respects a
 * per-user, per-date dedupe key so a user is not emailed more than once a day
 * for the same record. Read-only: never writes to the spreadsheet.
 * @param {string=} token Optional session token. When provided it must be an
 *   admin token (defends the public endpoint); the daily trigger calls it with
 *   no token.
 * @returns {{success: boolean, sent: number, skipped: number, message?: string}}
 */
function sendReviewReminders(token) {
  if (token) requireAdmin_(token);

  const data = getData();
  const items = data.items || [];
  const users = listUserRecords_();
  const cache = CacheService.getScriptCache();
  const today = new Date();
  const todayKey = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  let sent = 0;
  let skipped = 0;

  items.forEach(function (item) {
    const responsibility = String(item.responsibility || '').trim();
    if (!responsibility) return;
    if (item.reviewStatus === 'done') return;
    const days = daysUntilDate_(item.reviewDate);
    if (days !== 1) return;

    users.forEach(function (user) {
      const email = String(user.primaryEmail || '').trim().toLowerCase();
      if (!email || !isValidEmail_(email)) return;
      if (!responsibilityMatchesUser_(responsibility, user)) return;

      const dedupeKey = 'remind_' + todayKey + '_' + item.row + '_' + email;
      if (cache.get(dedupeKey)) {
        skipped++;
        return;
      }

      const subject = 'Action reminder: next review date is tomorrow';
      const body =
        'Dear ' + (String(user.username || '').trim() || email) + ',\n\n' +
        'The following record is assigned to your office (' + responsibility + ') and its ' +
        'next review date is tomorrow (' + item.reviewDate + '):\n\n' +
        'Record #' + item.id + ' · ' + (item.sector || '') + '\n' +
        'Action to be taken: ' + (item.action || '—') + '\n\n' +
        'Please log in at https://dashboardharyana.site/app.html and complete the required action.\n\n' +
        'India Post Dashboard';

      if (sendMail_(email, subject, body)) {
        cache.put(dedupeKey, '1', 21600);
        sent++;
      }
    });
  });

  return { success: true, sent: sent, skipped: skipped };
}

/**
 * Creates in-app notifications for the logged-in user for every record whose
 * responsibility matches their office and whose review date is due today or
 * tomorrow. Deduplicated per user, record and day via a script cache key so a
 * user is not re-notified on every page load. Runs inside the script lock
 * because it appends rows to the hidden Notifications sheet.
 * @param {string} token Session token (login required).
 * @returns {{success: boolean, created: number, skipped: number}}
 */
function generateReviewNotifications(token) {
  const user = requireLogin_(token);
  const context = getUserContext(user.email);
  const data = getData();
  const items = data.items || [];
  const cache = CacheService.getScriptCache();
  const todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  let created = 0;
  let skipped = 0;

  runWithLock_(function () {
    items.forEach(function (item) {
      const responsibility = String(item.responsibility || '').trim();
      if (!responsibility) return;
      if (item.reviewStatus === 'done') return;
      if (!responsibilityMatchesUser_(responsibility, context)) return;
      const days = daysUntilDate_(item.reviewDate);
      if (days === null || days > 1) return;

      const dedupeKey = 'rvnotif_' + todayKey + '_' + item.row + '_' + user.email;
      if (cache.get(dedupeKey)) {
        skipped++;
        return;
      }

      const dueLabel = days === 0 ? 'today' : 'tomorrow';
      const title = 'Review due ' + dueLabel + ': Record #' + item.id;
      const body = (item.sector || '') +
        (item.action ? ' — ' + item.action : '') +
        ' (review date ' + item.reviewDate + ').';
      appendNotification_(user.email, NOTIFICATION_TYPES.RECORD, title, body, '');
      cache.put(dedupeKey, '1', 21600);
      created++;
    });
  });

  return { success: true, created: created, skipped: skipped };
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
