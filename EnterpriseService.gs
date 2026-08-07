/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * EnterpriseService.gs
 * Enterprise addons server endpoints: review calendar (.ics),
 * WhatsApp review reminders (Meta WhatsApp Cloud API), and
 * AI dashboard insights (Google Gemini).
 * All features are gated by ENTERPRISE_SETTINGS (EnterpriseSettings.js)
 * and optional Script Properties overrides.
 * ============================================================
 */

var ENTERPRISE_AI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/* Builds an .ics feed of review-due records for the caller's office scope.
   Returns {success, filename, count, ics}. */
function exportReviewCalendarIcs(token) {
  var user = requireLogin_(token);
  var context = getUserContext(user.email);
  var cal = (ENTERPRISE_SETTINGS || {}).CALENDAR || {};
  if (!cal.enabled) {
    return { success: false, message: 'Calendar export is not enabled.' };
  }
  var data = getData();
  var items = scopeItemsForUser_((data.items || []), context);
  var events = [];
  items.forEach(function (item) {
    if (item.reviewStatus === 'done') return;
    if (!item.reviewDate) return;
    var d = parseDisplayDate_(item.reviewDate);
    if (!d) return;
    events.push({
      uid: 'review-' + item.row + '-' + icsFormatDateOnly_(d),
      start: icsFormatDateOnly_(d),
      summary: 'Review #' + item.id + ' - ' + (item.sector || ''),
      description: item.action || item.description || ''
    });
  });
  if (!events.length) {
    return { success: false, message: 'No review-due records to export.' };
  }
  var ics = buildIcs_('Review calendar - ' + (context.office || 'Haryana'), events);
  return { success: true, filename: 'review-calendar.ics', count: events.length, ics: ics };
}

/* Assembles an all-day VEVENT .ics document. */
function buildIcs_(summary, events) {
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//India Post Dashboard//Haryana//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscapeText_(summary)
  ];
  events.forEach(function (ev) {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + ev.uid);
    lines.push('DTSTAMP:' + icsFormatDate_(new Date()));
    lines.push('DTSTART;VALUE=DATE:' + ev.start);
    lines.push('DTEND;VALUE=DATE:' + (ev.end || ev.start));
    lines.push('SUMMARY:' + icsEscapeText_(ev.summary));
    if (ev.description) lines.push('DESCRIPTION:' + icsEscapeText_(ev.description));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ */
/* Single-task .ics export (client calls with a logged-in token).      */
/* One-arg form is allowed for owner-run Script Editor tests.          */
/* ------------------------------------------------------------------ */
function getTaskIcs(tokenOrTaskId, maybeTaskId) {
  var token = maybeTaskId === undefined ? '' : tokenOrTaskId;
  var taskId = maybeTaskId === undefined ? tokenOrTaskId : maybeTaskId;
  if (token) requireLogin_(token);
  var tasks = getEnterpriseTasks_();
  var task = null;
  for (var i = 0; i < tasks.length; i++) {
    if (String(tasks[i].id) === String(taskId)) { task = tasks[i]; break; }
  }
  if (!task) return { success: false, message: 'Task not found.' };
  var d = task.dueDate ? new Date(task.dueDate) : new Date();
  var events = [{
    uid: 'task-' + taskId + '-' + icsFormatDateOnly_(d),
    start: icsFormatDateOnly_(d),
    summary: task.title || 'Task',
    description: task.description || ''
  }];
  return { success: true, filename: 'task-' + taskId + '.ics', count: 1, ics: buildIcs_(task.title || 'Task', events) };
}

/* Tokenless internal task loader (used by tests and getTaskIcs). */
function getEnterpriseTasks_() {
  var sh = tasksSheet_();
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, TASK_SHEET_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) out.push(taskRecordFromRow_(values[i]));
  return out;
}

function enterprisePick_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (obj && obj[keys[i]] !== undefined && obj[keys[i]] !== null) return obj[keys[i]];
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* WhatsApp review reminders — Meta WhatsApp Cloud API.                */
/* ------------------------------------------------------------------ */

/* Admin-triggered (web) WhatsApp reminder run. */
function sendWhatsAppReviewReminders(token) {
  var user = requireAdmin_(token);
  return sendOverdueWhatsAppReminders();
}

/* Trigger-safe (tokenless) WhatsApp reminder run. Gate: WHO + opt-in. */
function sendOverdueWhatsAppReminders() {
  var cfg = getEnterpriseConfig_();
  if (!cfg.enabled) return { success: false, message: 'enterprise disabled' };
  if (!cfg.whatsappEnabled) return { success: false, message: 'whatsapp disabled' };
  var wa = JSON.parse(JSON.stringify((ENTERPRISE_SETTINGS || {}).WHATSAPP || {}));
  var templateName = PropertiesService.getScriptProperties().getProperty('WHATSAPP_TEMPLATE_NAME');
  if (templateName) wa.templateName = templateName;
  if (!wa.enabled || !wa.apiToken || !wa.phoneNumberId) {
    return { success: false, message: 'whatsapp not configured' };
  }
  var data = getData();
  var users = listUserRecords_();
  var due = (data.items || []).filter(function (item) {
    if (item.reviewStatus === 'done') return false;
    if (!enterpriseBool_(item.whatsappOptIn)) return false;
    var days = daysUntilDate_(item.reviewDate);
    return days === 0 || days === 1;
  });
  var result = { sent: [], skipped: [], errors: [] };
  users.forEach(function (u) {
    var phone = String(u.phone || '').trim().replace(/^\+?0*/, '');
    if (!/^\d{10,13}$/.test(phone)) {
      result.skipped.push({ user: u.email, reason: 'invalid phone' });
      return;
    }
    if (phone.length === 10) phone = '91' + phone;
    due.forEach(function (item) {
      if (!responsibilityMatchesUser_(String(item.responsibility || '').trim(), u)) return;
      var text = 'Review due ' + (item.reviewDate || '') + ' for record #' + item.id +
        ' - ' + (item.sector || '');
      var r = postWhatsApp_(wa, phone, text);
      if (r.ok) {
        result.sent.push({ phone: phone, record: item.id });
      } else {
        result.errors.push({ phone: phone, record: item.id, reason: r.reason || r.code });
      }
    });
  });
  return { success: true, sent: result.sent, skipped: result.skipped, errors: result.errors };
}

/* POSTs one message to Meta WhatsApp Cloud API. Returns {ok, code, reason}. */
function postWhatsApp_(wa, toPhone, text) {
  try {
    if (!wa.phoneNumberId) return { ok: false, reason: 'phoneNumberId missing' };
    var payload = wa.templateName
      ? {
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'template',
          template: {
            name: wa.templateName,
            language: { code: 'en' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: text }] }]
          }
        }
      : {
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'text',
          text: { preview_url: false, body: text }
        };
    var resp = UrlFetchApp.fetch(wa.apiBaseUrl + '/' + wa.phoneNumberId + '/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + wa.apiToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    return { ok: code >= 200 && code < 300, code: code, reason: code >= 200 && code < 300 ? '' : resp.getContentText() };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* AI Smart Insights — Google Gemini via generateContent.              */
/* ------------------------------------------------------------------ */

function getAiInsights(token) {
  if (token) requireAdmin_(token);
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  var props = PropertiesService.getScriptProperties();
  var aiEnabled = props.getProperty('AI_INSIGHTS_ENABLED') === 'true' || ai.enabled === true;
  if (!aiEnabled) {
    return { success: false, message: 'AI insights are not enabled.' };
  }
  var apiKey = props.getProperty('GEMINI_API_KEY') || ai.apiKey || '';
  if (!apiKey) {
    return { success: false, message: 'AI credentials are not configured.' };
  }
  var data = getData();
  var summary = buildSummaryFromItems(data.items || []);
  var prompt = 'India Post dashboard: total=' + summary.total + ', reviewDue=' + summary.flagged +
    ', normal=' + summary.normal + '. Give exactly 3 concise bullet follow-up actions.';
  var endpoint = ai.endpoint || ENTERPRISE_AI_DEFAULT_ENDPOINT;
  try {
    var resp = UrlFetchApp.fetch(endpoint + '?key=' + encodeURIComponent(apiKey), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true
    });
    var body = JSON.parse(resp.getContentText());
    var text = body && body.candidates && body.candidates[0] && body.candidates[0].content &&
      body.candidates[0].content.parts && body.candidates[0].content.parts[0] &&
      body.candidates[0].content.parts[0].text;
    if (!text) return { success: false, message: 'No text returned by Gemini.' };
    return { success: true, insights: text };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

function getAIInsights(token) { return getAiInsights(token); }

/* Admin-gated: stores the Gemini API key in Script Properties so the real
   credential is never committed to the repo. Never echoes the value back. */
function setGeminiApiKey(token, apiKey) {
  requireAdmin_(token);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, message: 'Missing API key.' };
  }
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey.trim());
  return { ok: true };
}

function aiKeyConfigured_() {
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  return !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || !!ai.apiKey;
}

/* ------------------------------------------------------------------ */
/* Offline queue replay (client calls after reconnecting).             */
/* Each queued item is {fn, args} (matching apiCall_ signature).       */
/* ------------------------------------------------------------------ */
function processOfflineQueue(token, queueItems) {
  var user = requireLogin_(token);
  var results = { processed: 0, failed: 0, errors: [] };
  (queueItems || []).forEach(function (item) {
    try {
      var fnName = item && (item.fn || item.action || item.method || '');
      var args = item && item.args ? item.args.slice() : [];
      if (!fnName) throw new Error('missing fn');
      var fnRef = eval(fnName); // mirrors existing doPost dispatcher in code.js
      if (typeof fnRef !== 'function') throw new Error('unknown fn: ' + fnName);
      args.push(token);
      fnRef.apply(null, args);
      results.processed++;
    } catch (err) {
      results.failed++;
      results.errors.push({ fn: item && (item.fn || item.action), reason: err.message || String(err) });
    }
  });
  return results;
}

/* ------------------------------------------------------------------ */
/* Setup / config / triggers / health.                                 */
/* ------------------------------------------------------------------ */

function setupEnterpriseAddons() {
  PropertiesService.getScriptProperties().setProperties({
    ENTERPRISE_ENABLED: 'true',
    AI_INSIGHTS_ENABLED: 'true',
    WHATSAPP_ENABLED: 'true',
    PWA_ENABLED: 'true',
    CALENDAR_ENABLED: 'true',
    TIMEZONE: 'Asia/Kolkata',
    GEMINI_MODEL: 'gemini-2.0-flash',
    OFFLINE_STRICT_AUTH: 'false'
  });
  return { ok: true };
}

function installEnterpriseTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendOverdueWhatsAppReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendOverdueWhatsAppReminders').timeBased().atHour(9).everyDays(1).create();
  return { ok: true };
}

function getEnterpriseFrontendConfig(token) {
  if (token) requireLogin_(token);
  var cfg = getEnterpriseConfig_();
  return {
    enabled: cfg.enabled,
    aiEnabled: cfg.aiEnabled,
    whatsappEnabled: cfg.whatsappEnabled,
    pwaEnabled: cfg.pwaEnabled,
    calendarEnabled: cfg.calendarEnabled,
    offlineStrictAuth: cfg.offlineStrictAuth,
    timezone: cfg.timezone
  };
}

function validateEnterpriseConfiguration() {
  var cfg = getEnterpriseConfig_();
  return {
    enabled: cfg.enabled,
    workerUrlSet: !!cfg.workerUrl,
    workerTokenSet: !!cfg.workerToken,
    aiEnabled: cfg.aiEnabled,
    aiKeySet: aiKeyConfigured_(),
    whatsappEnabled: cfg.whatsappEnabled,
    pwaEnabled: cfg.pwaEnabled,
    calendarEnabled: cfg.calendarEnabled,
    timezone: cfg.timezone,
    aiModel: cfg.aiModel
  };
}

function getEnterpriseHealth() {
  var cfg = getEnterpriseConfig_();
  return {
    enabled: cfg.enabled,
    aiEnabled: cfg.aiEnabled,
    aiKeySet: aiKeyConfigured_(),
    whatsappEnabled: cfg.whatsappEnabled,
    pwaEnabled: cfg.pwaEnabled,
    calendarEnabled: cfg.calendarEnabled,
    workerUrlSet: !!cfg.workerUrl,
    workerTokenSet: !!cfg.workerToken,
    timezone: cfg.timezone,
    checkedAt: new Date().toISOString()
  };
}

function enterpriseBool_(v) {
  if (v === true) return true;
  return String(v).toUpperCase() === 'TRUE';
}
