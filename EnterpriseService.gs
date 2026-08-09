/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * EnterpriseService.gs
 * Enterprise addons server endpoints: review calendar (.ics),
 * WhatsApp review reminders (Meta WhatsApp Cloud API), and
 * AI dashboard insights (provider-switchable: Groq, Hugging Face,
 * OpenRouter, Google Gemini, or Kilo Gateway free tier as a keyless fallback).
 * All features are gated by ENTERPRISE_SETTINGS (EnterpriseSettings.js)
 * and optional Script Properties overrides.
 * ============================================================
 */

var ENTERPRISE_AI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
var ENTERPRISE_AI_OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
var ENTERPRISE_AI_GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
var ENTERPRISE_AI_HF_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
var ENTERPRISE_AI_KILO_ENDPOINT = 'https://api.kilo.ai/api/gateway/chat/completions';
var ENTERPRISE_AI_GROQ_TRANSCRIBE_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
var ENTERPRISE_AI_TRANSCRIBE_MODEL = 'whisper-large-v3';
var ENTERPRISE_AI_TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;
var ENTERPRISE_AI_TRANSCRIPT_MAX_CHARS = 20000;
var ENTERPRISE_AI_MEETING_SYSTEM_PROMPT = 'You are a review-meeting minute-taker for the India Post Haryana dashboard team. ' +
  'From the meeting transcript, produce STRICT JSON only (no markdown, no code fences, no commentary) with exactly these keys: ' +
  '"summary" (one concise paragraph, string), "decisions" (array of strings), ' +
  '"actionItems" (array of objects, each with "task" string, "assignee" string or empty, ' +
  '"priority" string one of LOW/MEDIUM/HIGH/URGENT, "dueDate" string in dd.mm.yyyy format or empty), ' +
  '"risks" (array of strings). Use empty arrays for anything not present.';
var ENTERPRISE_AI_SYSTEM_PROMPT = 'You are a concise data-analytics assistant for the India Post Haryana dashboard. ' +
  'The user gives current dashboard summary numbers. Respond ONLY with exactly 3 short bullet ' +
  'points of concrete follow-up actions derived from those numbers. Do not describe India, ' +
  'its geography, history, or culture.';
var ENTERPRISE_AI_RECORD_SYSTEM_PROMPT = 'You are a concise data-analytics assistant for the India Post Haryana dashboard. ' +
  'The user gives one dashboard record and optionally the text of its linked file. Respond ONLY with exactly 3 short bullet ' +
  'points of concrete follow-up actions derived from that record and link. Do not describe India, ' +
  'its geography, history, or culture.';
var ENTERPRISE_AI_LINK_MAX_CHARS = 25000;
var ENTERPRISE_AI_PREVIEW_MAX_ROWS = 50;
var ENTERPRISE_AI_PREVIEW_MAX_CELLS = 30;
var ENTERPRISE_AI_PREVIEW_MAX_CELL_CHARS = 300;

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
/* AI Smart Insights — provider-switchable via AI_PROVIDER.            */
/* ------------------------------------------------------------------ */

function getAiInsights(token) {
  if (token) requireAdmin_(token);
  if (!aiEnabled_()) {
    return { success: false, message: 'AI insights are not enabled.' };
  }
  var data = getData();
  var summary = buildSummaryFromItems(data.items || []);
  var prompt = 'India Post dashboard: total=' + summary.total + ', reviewDue=' + summary.flagged +
    ', normal=' + summary.normal + '. Give exactly 3 concise bullet follow-up actions.';
  return generateAiText_(prompt, ENTERPRISE_AI_SYSTEM_PROMPT);
}

function getAIInsights(token) { return getAiInsights(token); }

function aiKeyPropName_(provider) {
  if (provider === 'gemini') return 'GEMINI_API_KEY';
  if (provider === 'groq') return 'GROQ_API_KEY';
  if (provider === 'huggingface') return 'HUGGINGFACE_API_KEY';
  if (provider === 'kilo' || provider === 'kilocode') return 'KILO_API_KEY';
  return 'OPENROUTER_API_KEY';
}

function aiDefaultModel_(provider) {
  if (provider === 'gemini') return 'gemini-2.0-flash';
  if (provider === 'groq') return 'llama-3.3-70b-versatile';
  if (provider === 'huggingface') return 'meta-llama/Llama-3.3-70B-Instruct';
  if (provider === 'kilo' || provider === 'kilocode') return 'kilo-auto/free';
  return 'openai/gpt-4o-mini';
}

/* OpenAI-compatible chat completions (shared by OpenRouter, Groq, and Hugging Face). */
function callOpenAiChat_(endpoint, apiKey, model, prompt, systemPrompt) {
  var resp = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: systemPrompt || ENTERPRISE_AI_SYSTEM_PROMPT
        },
        { role: 'user', content: prompt }
      ]
    }),
    muteHttpExceptions: true
  });
  var body = JSON.parse(resp.getContentText());
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    var apiErr = body && body.error && (body.error.message || body.error.type || body.error.status);
    return { success: false, message: apiErr || ('AI provider HTTP ' + code) };
  }
  var text = body && body.choices && body.choices[0] && body.choices[0].message &&
    body.choices[0].message.content;
  if (!text) return { success: false, message: 'No text returned by AI provider.' };
  return { success: true, insights: text };
}

/* OpenRouter chat completions. */
function callOpenRouter_(props, ai, apiKey, model, prompt, systemPrompt) {
  var endpoint = props.getProperty('OPENROUTER_ENDPOINT') || ai.endpoint || ENTERPRISE_AI_OPENROUTER_ENDPOINT;
  return callOpenAiChat_(endpoint, apiKey, model, prompt, systemPrompt);
}

/* Groq chat completions (free tier). */
function callGroq_(props, apiKey, model, prompt, systemPrompt) {
  var endpoint = props.getProperty('GROQ_ENDPOINT') || ENTERPRISE_AI_GROQ_ENDPOINT;
  return callOpenAiChat_(endpoint, apiKey, model, prompt, systemPrompt);
}

/* Hugging Face Inference Providers (OpenAI-compatible router, free tier). */
function callHuggingFace_(props, apiKey, model, prompt, systemPrompt) {
  var endpoint = props.getProperty('HUGGINGFACE_ENDPOINT') || ENTERPRISE_AI_HF_ENDPOINT;
  return callOpenAiChat_(endpoint, apiKey, model, prompt, systemPrompt);
}

/* Kilo Gateway chat completions (OpenAI-compatible, free tier needs no key;
   OpenKilo uses the literal 'anonymous' bearer token for free models). */
function callKilo_(props, apiKey, model, prompt, systemPrompt) {
  var endpoint = props.getProperty('KILO_ENDPOINT') || ENTERPRISE_AI_KILO_ENDPOINT;
  var token = apiKey || 'anonymous';
  var resp = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: systemPrompt || ENTERPRISE_AI_SYSTEM_PROMPT
        },
        { role: 'user', content: prompt }
      ]
    }),
    muteHttpExceptions: true
  });
  var body = JSON.parse(resp.getContentText());
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    var apiErr = body && body.error && (body.error.message || body.error.type || body.error.status);
    return { success: false, message: apiErr || ('Kilo HTTP ' + code) };
  }
  var text = body && body.choices && body.choices[0] && body.choices[0].message &&
    body.choices[0].message.content;
  if (!text) return { success: false, message: 'No text returned by Kilo.' };
  return { success: true, insights: text };
}

/* Google Gemini via generateContent. */
function callGemini_(props, ai, apiKey, model, prompt, systemPrompt) {
  var endpoint = props.getProperty('GEMINI_ENDPOINT') || ENTERPRISE_AI_DEFAULT_ENDPOINT;
  var payload = { contents: [{ parts: [{ text: prompt }] }] };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  var resp = UrlFetchApp.fetch(endpoint + '?key=' + encodeURIComponent(apiKey), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var body = JSON.parse(resp.getContentText());
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    var apiErr = body && body.error && (body.error.message || body.error.status);
    return { success: false, message: apiErr || ('Gemini HTTP ' + code) };
  }
  var text = body && body.candidates && body.candidates[0] && body.candidates[0].content &&
    body.candidates[0].content.parts && body.candidates[0].content.parts[0] &&
    body.candidates[0].content.parts[0].text;
  if (!text) return { success: false, message: 'No text returned by Gemini.' };
  return { success: true, insights: text };
}

/* Shared provider dispatch: resolves the configured provider/key/model and runs a
   prompt through it. Returns {success, insights} or {success: false, message}.
   When the primary provider fails and Kilo fallback is not disabled, retries once
   through the Kilo Gateway free tier (keyless), so insights still arrive if the
   configured provider (e.g. Groq) errors or is rate-limited. */
function generateAiText_(prompt, systemPrompt) {
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  var props = PropertiesService.getScriptProperties();
  var provider = (props.getProperty('AI_PROVIDER') || ai.provider || 'openrouter').toLowerCase();
  var apiKey = props.getProperty(aiKeyPropName_(provider)) || ai.apiKey || '';
  var model = props.getProperty('AI_MODEL') || ai.model || aiDefaultModel_(provider);

  var result = runAiProvider_(props, ai, provider, apiKey, model, prompt, systemPrompt);
  if (result.success) return result;

  var kiloFallback = (props.getProperty('AI_KILO_FALLBACK') || 'true').toLowerCase() !== 'false';
  var isKilo = provider === 'kilo' || provider === 'kilocode';
  if (kiloFallback && !isKilo) {
    var kiloModel = props.getProperty('AI_KILO_MODEL') || 'kilo-auto/free';
    var kiloResult = runAiProvider_(props, ai, 'kilo', '', kiloModel, prompt, systemPrompt);
    if (kiloResult.success) {
      kiloResult.fallbackProvider = 'kilo';
      return kiloResult;
    }
    result.kiloFallbackError = kiloResult.message || '';
  }
  return result;
}

function runAiProvider_(props, ai, provider, apiKey, model, prompt, systemPrompt) {
  try {
    if (provider === 'gemini') {
      if (!apiKey) return { success: false, message: 'AI credentials are not configured.' };
      return callGemini_(props, ai, apiKey, model, prompt, systemPrompt);
    }
    if (provider === 'groq') {
      if (!apiKey) return { success: false, message: 'AI credentials are not configured.' };
      return callGroq_(props, apiKey, model, prompt, systemPrompt);
    }
    if (provider === 'huggingface') {
      if (!apiKey) return { success: false, message: 'AI credentials are not configured.' };
      return callHuggingFace_(props, apiKey, model, prompt, systemPrompt);
    }
    if (provider === 'kilo' || provider === 'kilocode') {
      return callKilo_(props, apiKey, model, prompt, systemPrompt);
    }
    if (!apiKey) return { success: false, message: 'AI credentials are not configured.' };
    return callOpenRouter_(props, ai, apiKey, model, prompt, systemPrompt);
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

function aiEnabled_() {
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('AI_INSIGHTS_ENABLED') === 'true' || ai.enabled === true;
}

function findItemByRow_(row) {
  var items = getData().items || [];
  for (var i = 0; i < items.length; i++) {
    if (String(items[i].row) === String(row)) return items[i];
  }
  return null;
}

/* First usable link on a record, preferring the action field. */
function firstLinkUrl_(item) {
  var links = (item && item.linkUrls) || {};
  if (links.action) return links.action;
  var keys = Object.keys(links);
  for (var i = 0; i < keys.length; i++) {
    if (links[keys[i]]) return links[keys[i]];
  }
  return '';
}

/* Editor/admin-gated: AI insight for one record (its own fields only). */
function getCardAiInsight(token, row) {
  requireEditor_(token);
  if (!aiEnabled_()) {
    return { success: false, message: 'AI insights are not enabled.' };
  }
  var item = findItemByRow_(row);
  if (!item) return { success: false, message: 'Record not found.' };
  var linkUrl = firstLinkUrl_(item);
  var prompt = 'India Post dashboard record #' + (item.id || '') + ':\n' +
    'Sector: ' + (item.sector || '') + '\n' +
    'Description: ' + (item.description || '') + '\n' +
    'Action: ' + (item.action || '') + '\n' +
    'Responsibility: ' + (item.responsibility || '') + '\n' +
    'Entry date: ' + (item.entryDate || '') + '\n' +
    'Review date: ' + (item.reviewDate || '') + '\n' +
    'Review status: ' + (item.reviewStatus || '') + '\n' +
    (linkUrl ? 'Linked file URL: ' + linkUrl + '\n' : '') +
    'Give exactly 3 concise bullet follow-up actions for this record.';
  var result = generateAiText_(prompt, ENTERPRISE_AI_RECORD_SYSTEM_PROMPT);
  if (result.success === true) {
    result.row = item.row;
    result.id = item.id;
    result.hasLink = !!linkUrl;
  }
  return result;
}

/* Editor/admin-gated: fetches the record's linked file content (public URLs and
   "anyone with the link" Drive files only) and runs AI analysis over it. */
function getLinkContentAiInsight(token, row) {
  requireEditor_(token);
  if (!aiEnabled_()) {
    return { success: false, message: 'AI insights are not enabled.' };
  }
  var item = findItemByRow_(row);
  if (!item) return { success: false, message: 'Record not found.' };
  var url = firstLinkUrl_(item);
  if (!url) return { success: false, message: 'This record has no linked file.' };
  if (!isSafeLinkUrl_(url)) return { success: false, message: 'Unsafe link rejected.' };
  var previewRows = [];
  var previewRowTotal = 0;
  var fetched;
  if (isSheetsLink_(url)) {
    var table = fetchLinkTable_(url);
    previewRows = table.rows;
    previewRowTotal = table.rowCount;
    fetched = table.text || fetchLinkText_(url);
  } else {
    fetched = fetchLinkText_(url);
  }
  fetched = String(fetched || '').replace(/\s+/g, ' ').trim();
  var contentTruncated = fetched.length > ENTERPRISE_AI_LINK_MAX_CHARS;
  var text = contentTruncated ? fetched.substring(0, ENTERPRISE_AI_LINK_MAX_CHARS) : fetched;
  var contentRead = text.length > 40;
  var prompt = 'India Post dashboard record #' + (item.id || '') + ' (sector: ' + (item.sector || '') + ').\n' +
    'Linked file URL: ' + url + '\n' +
    (contentRead
      ? 'Linked file content: ' + text + '\n'
      : 'The linked file content could not be read (private, blocked, or unreadable). Base your answer on the record and URL only.\n') +
    'Give exactly 3 concise bullet follow-up actions.';
  var result = generateAiText_(prompt, ENTERPRISE_AI_RECORD_SYSTEM_PROMPT);
  if (result.success === true) {
    result.row = item.row;
    result.id = item.id;
    result.source = url;
    result.contentRead = contentRead;
    result.contentLength = text.length;
    result.contentTruncated = contentTruncated;
    result.preview = contentRead ? text.substring(0, 600) : '';
    result.previewFormat = 'text';
    if (previewRows.length) {
      result.previewFormat = 'table';
      result.previewRows = previewRows.slice(0, ENTERPRISE_AI_PREVIEW_MAX_ROWS).map(function (r) {
        return r.slice(0, ENTERPRISE_AI_PREVIEW_MAX_CELLS).map(function (c) {
          var s = String(c == null ? '' : c);
          return s.length > ENTERPRISE_AI_PREVIEW_MAX_CELL_CHARS ? s.substring(0, ENTERPRISE_AI_PREVIEW_MAX_CELL_CHARS) + '\u2026' : s;
        });
      });
      result.previewRowTotal = previewRowTotal;
    }
  }
  return result;
}

/* SSRF guard: only http(s), no localhost/private/link-local/metadata hosts. */
function isSafeLinkUrl_(url) {
  var s = String(url || '').trim();
  var m = s.match(/^(https?):\/\/([^\/?#:]+)(?::\d+)?([\/?#]|$)/i);
  if (!m) return false;
  if (m[1].toLowerCase() !== 'http' && m[1].toLowerCase() !== 'https') return false;
  var host = m[2].toLowerCase();
  if (host.indexOf('@') !== -1) return false;
  if (host === 'localhost' || host.indexOf('.localhost') !== -1 || host.indexOf('.local') !== -1) return false;
  if (host === '169.254.169.254') return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host)) return false;
  var r = host.match(/^172\.(\d+)\./);
  if (r) { var n = parseInt(r[1], 10); if (n >= 16 && n <= 31) return false; }
  return true;
}

/* Rewrites Google Drive/Docs links to plain-text-readable forms. */
function toReadableLinkUrl_(url) {
  var doc = url.match(/docs\.google\.com\/document\/d\/([^/?#]+)/);
  if (doc) return 'https://docs.google.com/document/d/' + doc[1] + '/export?format=txt';
  var sheets = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/?#]+)/);
  if (sheets) {
    var gid = (url.match(/[?&#]gid=(\d+)/) || [])[1];
    return 'https://docs.google.com/spreadsheets/d/' + sheets[1] + '/export?format=csv' + (gid ? '&gid=' + gid : '');
  }
  var file = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (file) return 'https://drive.google.com/uc?export=download&id=' + file[1];
  var open = url.match(/drive\.google\.com\/open\?id=([^&#]+)/);
  if (open) return 'https://drive.google.com/uc?export=download&id=' + open[1];
  return url;
}

/* Crude HTML-to-text for link content extraction. */
function htmlToText_(html) {
  var s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ');
  s = s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  s = s.replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/* Fetches link content as plain text, trying the readable export URL first,
   then the raw URL (htmlToText_). Returns '' when unreadable/private/blocked. */
function fetchLinkText_(url) {
  var candidates = [toReadableLinkUrl_(url), url];
  var seen = {};
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    if (!candidate || seen[candidate]) continue;
    seen[candidate] = true;
    var raw = fetchRawText_(candidate);
    if (isReadableAiText_(raw)) return raw;
  }
  return '';
}

function fetchRawBody_(url) {
  var current = String(url || '');
  var hops = 5;
  var guard = {};
  while (hops-- > 0) {
    try {
      if (!isSafeLinkUrl_(current)) return '';
      if (guard[current]) return '';
      guard[current] = true;
      var resp = UrlFetchApp.fetch(current, { muteHttpExceptions: true, timeoutSeconds: 15, followRedirects: false });
      var code = resp.getResponseCode();
      if (code >= 300 && code < 400) {
        var loc = '';
        var hdr = resp.getHeaders();
        for (var k in hdr) { if (String(k).toLowerCase() === 'location') loc = hdr[k]; }
        current = toAbsoluteUrl_(current, loc);
        if (!current) return '';
        continue;
      }
      if (code < 200 || code >= 300) return '';
      var body = resp.getContentText();
      if (!body || body.indexOf('\u0000') !== -1) return '';
      return body;
    } catch (err) { return ''; }
  }
  return '';
}

function fetchRawText_(url) {
  var body = fetchRawBody_(url);
  if (!body) return '';
  var lower = body.substring(0, 500).toLowerCase();
  if (lower.indexOf('<html') !== -1 || lower.indexOf('<!doctype') !== -1) {
    return htmlToText_(body);
  }
  return String(body).replace(/\s+/g, ' ').trim();
}

function isSheetsLink_(url) {
  return /docs\.google\.com\/spreadsheets\//i.test(String(url || ''));
}

/* Parses CSV text into an array of rows (array of cell strings). Handles
   quoted fields, escaped quotes, and newlines inside quotes. */
function parseCsv_(csv) {
  var rows = [];
  var row = [];
  var cur = '';
  var inQ = false;
  var s = String(csv || '');
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (s.charAt(i + 1) === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s.charAt(i + 1) === '\n') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/* Fetches a Google Sheets export as a structured table: {rows, rowCount, text}.
   Returns {rows: [], rowCount: 0} when the export is unreadable/private. */
function fetchLinkTable_(url) {
  var body = fetchRawBody_(toReadableLinkUrl_(url));
  if (!body) return { rows: [], rowCount: 0 };
  var trimmed = String(body).trim();
  var lower = trimmed.substring(0, 500).toLowerCase();
  if (lower.indexOf('<html') !== -1 || lower.indexOf('<!doctype') !== -1) return { rows: [], rowCount: 0 };
  if (!isReadableAiText_(htmlToText_(trimmed))) return { rows: [], rowCount: 0 };
  var rows = parseCsv_(trimmed).filter(function (r) {
    for (var i = 0; i < r.length; i++) { if (String(r[i]).trim() !== '') return true; }
    return false;
  });
  if (!rows.length) return { rows: [], rowCount: 0 };
  var text = rows.map(function (r) { return r.join(', '); }).join('\n');
  return { rows: rows, rowCount: rows.length, text: text };
}

/* Resolves a Location header against the current URL (absolute or relative). */
function toAbsoluteUrl_(base, loc) {
  loc = String(loc || '').trim();
  if (!loc) return '';
  if (/^https?:\/\//i.test(loc)) return loc;
  if (loc.charAt(0) === '/') {
    var m = String(base || '').match(/^https?:\/\/[^\/]+/i);
    return m ? m[0] + loc : '';
  }
  var idx = String(base || '').lastIndexOf('/');
  return idx !== -1 ? base.substring(0, idx + 1) + loc : loc;
}

function isReadableAiText_(text) {
  var t = String(text || '').trim();
  if (t.length <= 40) return false;
  var low = t.toLowerCase();
  if (low.indexOf('request access') !== -1) return false;
  if (low.indexOf('sign in to continue') !== -1) return false;
  if (low.indexOf('javascript isn\'t enabled') !== -1) return false;
  if (low.indexOf('can\'t be opened') !== -1) return false;
  if (low.indexOf('enable and reload') !== -1) return false;
  if (low.indexOf('this browser version is no longer supported') !== -1) return false;
  if (low.indexOf('unable to load') !== -1) return false;
  if (low.indexOf('an error occurred') !== -1) return false;
  return true;
}

/* Admin-gated: stores the OpenRouter API key in Script Properties so the
   real credential is never committed to the repo. Never echoes the value back. */
function setOpenRouterApiKey(token, apiKey) {
  requireAdmin_(token);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, message: 'Missing API key.' };
  }
  PropertiesService.getScriptProperties().setProperty('OPENROUTER_API_KEY', apiKey.trim());
  return { ok: true };
}

/* Admin-gated: stores the Gemini API key in Script Properties. */
function setGeminiApiKey(token, apiKey) {
  requireAdmin_(token);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, message: 'Missing API key.' };
  }
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey.trim());
  return { ok: true };
}

/* Admin-gated: stores the Groq API key in Script Properties so the real
   credential is never committed to the repo. Never echoes the value back. */
function setGroqApiKey(token, apiKey) {
  requireAdmin_(token);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, message: 'Missing API key.' };
  }
  PropertiesService.getScriptProperties().setProperty('GROQ_API_KEY', apiKey.trim());
  return { ok: true };
}

/* Admin-gated: stores the Hugging Face token in Script Properties so the
   real credential is never committed to the repo. Never echoes the value back. */
function setHuggingFaceApiKey(token, apiKey) {
  requireAdmin_(token);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, message: 'Missing API token.' };
  }
  PropertiesService.getScriptProperties().setProperty('HUGGINGFACE_API_KEY', apiKey.trim());
  return { ok: true };
}

/* Admin-gated: stores the Kilo Gateway API key in Script Properties (optional —
   the free tier works with the keyless 'anonymous' fallback). */
function setKiloApiKey(token, apiKey) {
  requireAdmin_(token);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, message: 'Missing API key.' };
  }
  PropertiesService.getScriptProperties().setProperty('KILO_API_KEY', apiKey.trim());
  return { ok: true };
}

/* Groq Whisper transcription (free tier: whisper-large-v3). Sends a multipart
   upload with {model, file} and returns {ok, text} or {ok: false, reason}. */
function callGroqTranscribe_(apiKey, blob) {
  try {
    var resp = UrlFetchApp.fetch(ENTERPRISE_AI_GROQ_TRANSCRIBE_ENDPOINT, {
      method: 'post',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: {
        model: ENTERPRISE_AI_TRANSCRIBE_MODEL,
        file: blob,
        response_format: 'json'
      },
      muteHttpExceptions: true,
      timeoutSeconds: 300
    });
    var body = JSON.parse(resp.getContentText());
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      var apiErr = body && body.error && (body.error.message || body.error.code || body.error.type);
      return { ok: false, reason: apiErr || ('Groq transcription HTTP ' + code) };
    }
    return { ok: true, text: String(body.text || '') };
  } catch (err) {
    return { ok: false, reason: 'Transcription failed: ' + String(err) };
  }
}

/* Strips common LLM wrapper noise and parses a JSON object, or null. */
function tryParseJsonObject_(text) {
  var s = String(text || '').trim();
  if (!s) return null;
  if (s.charAt(0) === '`') s = s.replace(/^`+/, '').replace(/`+$/, '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  var start = s.indexOf('{');
  var end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.substring(start, end + 1);
  try { return JSON.parse(s); } catch (err) { return null; }
}

/* Sanitizes a string for use as a Drive file name. */
function sanitizeFileName_(name) {
  var s = String(name || '').replace(/[\/\\:*?"<>|]/g, '_').trim();
  return s.length ? s : 'Meeting';
}

/* Derives a file extension from the client file name, else from mimeType. */
function meetingFileExt_(fileName, mimeType) {
  var m = String(fileName || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  mimeType = String(mimeType || '');
  if (mimeType.indexOf('m4a') !== -1 || mimeType.indexOf('mp4') !== -1) return 'm4a';
  if (mimeType.indexOf('ogg') !== -1) return 'ogg';
  if (mimeType.indexOf('wav') !== -1) return 'wav';
  if (mimeType.indexOf('mpeg') !== -1) return 'mp3';
  if (mimeType.indexOf('flac') !== -1) return 'flac';
  return 'webm';
}

/* Finds (or creates) a folder named `name`. Prefers the spreadsheet's parent
   folder (so meeting artifacts live next to the dashboard workbook), then
   falls back to the Drive root when the parent folder is not writable under
   the drive.file scope. Errors are logged, never silently swallowed. */
function getMeetingDriveFolder_(name) {
  var ss = getSpreadsheet_();
  if (!ss) return null;
  var candidates = [];
  try {
    var parents = DriveApp.getFileById(ss.getId()).getParents();
    if (parents.hasNext()) candidates.push(parents.next());
  } catch (err) {
    console.error('getMeetingDriveFolder_: DriveApp parent lookup failed: ' + err);
  }
  try {
    candidates.push(DriveApp.getRootFolder());
  } catch (err) {
    console.error('getMeetingDriveFolder_: root folder lookup failed: ' + err);
  }
  for (var i = 0; i < candidates.length; i++) {
    var parent = candidates[i];
    try {
      var it = parent.getFoldersByName(name);
      if (it.hasNext()) return it.next();
      return parent.createFolder(name);
    } catch (err3) {
      console.error('getMeetingDriveFolder_: could not create/list folder "' + name +
        '" under ' + (parent ? parent.getName() : '(null)') + ': ' + err3);
    }
  }
  return null;
}

/* Admin-only: transcribes an uploaded or browser-recorded meeting via Groq
   Whisper and generates structured minutes (summary, decisions, action items,
   risks) via the configured AI provider. The raw audio and the generated
   minutes are saved to Drive folders next to the spreadsheet (best effort).
   Returns {success, title, transcript, minutes, minutesText, driveAudio,
   driveMinutes}. */
function processMeetingRecording(payload, token) {
  var user = requireAdmin_(token);
  if (!aiEnabled_()) return { success: false, message: 'AI insights are not enabled.' };
  var props = PropertiesService.getScriptProperties();
  var groqKey = props.getProperty('GROQ_API_KEY');
  if (!groqKey) return { success: false, message: 'Groq API key not configured (required for transcription).' };
  payload = payload || {};
  var title = String(payload.title || '').trim() || 'Review meeting';
  var base64 = String(payload.base64 || '');
  var mimeType = String(payload.mimeType || 'audio/mpeg');
  var fileName = String(payload.fileName || 'recording.' + (mimeType.indexOf('m4a') !== -1 ? 'm4a' : 'mpeg'));
  if (!base64) return { success: false, message: 'No audio was provided.' };
  var bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (err) {
    return { success: false, message: 'Audio data could not be decoded.' };
  }
  if (!bytes.length) return { success: false, message: 'The audio file appears to be empty.' };
  if (bytes.length > ENTERPRISE_AI_TRANSCRIBE_MAX_BYTES) {
    return { success: false, message: 'Audio exceeds the 25 MB transcription limit.' };
  }

  var driveAudio = null;
  try {
    var audioFolder = getMeetingDriveFolder_('IPD Meeting Recordings');
    if (audioFolder) {
      var stamp = Utilities.formatDate(new Date(), props.getProperty('TIMEZONE') || 'Asia/Kolkata', 'yyyy-MM-dd_HHmm');
      var audioName = sanitizeFileName_(title) + '_' + stamp + '.' + meetingFileExt_(fileName, mimeType);
      var savedFile = audioFolder.createFile(Utilities.newBlob(bytes, mimeType, audioName));
      driveAudio = { id: savedFile.getId(), url: savedFile.getUrl(), name: audioName, size: bytes.length };
    }
  } catch (err) { driveAudio = null; }

  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var tr = callGroqTranscribe_(groqKey, blob);
  if (!tr.ok) return { success: false, message: tr.reason, driveAudio: driveAudio };
  var transcript = String(tr.text || '').trim();
  if (!transcript) return { success: false, message: 'No speech was detected in the recording.', driveAudio: driveAudio };
  var minutesPrompt = 'Meeting title: ' + title + '\n\nTranscript:\n' +
    transcript.substring(0, ENTERPRISE_AI_TRANSCRIPT_MAX_CHARS);
  var ai = generateAiText_(minutesPrompt, ENTERPRISE_AI_MEETING_SYSTEM_PROMPT);
  var minutes = { summary: '', decisions: [], actionItems: [], risks: [] };
  var minutesText = '';
  if (ai.success) {
    minutesText = String(ai.insights || '');
    var parsed = tryParseJsonObject_(minutesText);
    if (parsed && typeof parsed === 'object') minutes = parsed;
  }

  var driveMinutes = null;
  try {
    var notesFolder = getMeetingDriveFolder_('IPD Meeting Notes');
    if (notesFolder) {
      var md = '# ' + title + '\n\nGenerated: ' + new Date().toString() + '\n\n';
      md += '## Summary\n' + (String(minutes.summary || '').trim() || '(no summary)') + '\n\n';
      if (minutes.decisions && minutes.decisions.length) {
        md += '## Decisions\n' + minutes.decisions.map(function (d) { return '- ' + String(d); }).join('\n') + '\n\n';
      }
      if (minutes.actionItems && minutes.actionItems.length) {
        md += '## Action items\n' + minutes.actionItems.map(function (a) {
          return '- [' + String((a && a.priority) || 'MEDIUM') + '] ' + String((a && a.task) || '') +
            ((a && a.assignee) ? ' (assigned: ' + a.assignee + ')' : '') +
            ((a && a.dueDate) ? ' (due: ' + a.dueDate + ')' : '');
        }).join('\n') + '\n\n';
      }
      if (minutes.risks && minutes.risks.length) {
        md += '## Risks\n' + minutes.risks.map(function (r) { return '- ' + String(r); }).join('\n') + '\n\n';
      }
      md += '## Transcript\n' + transcript + '\n';
      var stamp2 = Utilities.formatDate(new Date(), props.getProperty('TIMEZONE') || 'Asia/Kolkata', 'yyyy-MM-dd_HHmm');
      var mdFile = notesFolder.createFile(sanitizeFileName_(title) + '_' + stamp2 + '.md', md, MimeType.PLAIN_TEXT);
      driveMinutes = { id: mdFile.getId(), url: mdFile.getUrl(), name: mdFile.getName() };
    }
  } catch (err) { driveMinutes = null; }

  return {
    success: true,
    title: title,
    transcript: transcript,
    transcriptChars: transcript.length,
    minutes: minutes,
    minutesText: minutesText,
    driveAudio: driveAudio,
    driveMinutes: driveMinutes,
    fallbackProvider: ai.fallbackProvider || ''
  };
}

/* Admin-only: transcribes ONE audio segment (used by the client fallback
   that re-encodes long or undecodable recordings into ~10-minute chunks). */
function transcribeMeetingSegment(payload, token) {
  var user = requireAdmin_(token);
  var props = PropertiesService.getScriptProperties();
  var groqKey = props.getProperty('GROQ_API_KEY');
  if (!groqKey) return { success: false, message: 'Groq API key not configured (required for transcription).' };
  payload = payload || {};
  var title = String(payload.title || '').trim() || 'Review meeting';
  var base64 = String(payload.base64 || '');
  var mimeType = String(payload.mimeType || 'audio/webm');
  var fileName = String(payload.fileName || 'segment.webm');
  if (!base64) return { success: false, message: 'No audio was provided.' };
  var bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (err) {
    return { success: false, message: 'Audio data could not be decoded.' };
  }
  if (!bytes.length) return { success: false, message: 'The audio file appears to be empty.' };
  if (bytes.length > ENTERPRISE_AI_TRANSCRIBE_MAX_BYTES) {
    return { success: false, message: 'Audio segment exceeds the 25 MB transcription limit.' };
  }
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var tr = callGroqTranscribe_(groqKey, blob);
  if (!tr.ok) return { success: false, message: tr.reason };
  var transcript = String(tr.text || '').trim();
  if (!transcript) return { success: false, message: 'No speech was detected in this segment.' };
  return { success: true, title: title, transcript: transcript };
}

/* Admin-only: drafts structured minutes from a full transcript (after segment
   transcription) and saves a .md copy to Drive (best effort). */
function generateMeetingMinutes(payload, token) {
  var user = requireAdmin_(token);
  if (!aiEnabled_()) return { success: false, message: 'AI insights are not enabled.' };
  payload = payload || {};
  var title = String(payload.title || '').trim() || 'Review meeting';
  var transcript = String(payload.transcript || '').trim();
  if (!transcript) return { success: false, message: 'No transcript was provided.' };
  var minutesPrompt = 'Meeting title: ' + title + '\n\nTranscript:\n' +
    transcript.substring(0, ENTERPRISE_AI_TRANSCRIPT_MAX_CHARS);
  var ai = generateAiText_(minutesPrompt, ENTERPRISE_AI_MEETING_SYSTEM_PROMPT);
  var minutes = { summary: '', decisions: [], actionItems: [], risks: [] };
  var minutesText = '';
  if (ai.success) {
    minutesText = String(ai.insights || '');
    var parsed = tryParseJsonObject_(minutesText);
    if (parsed && typeof parsed === 'object') minutes = parsed;
  }
  var driveMinutes = null;
  try {
    var notesFolder = getMeetingDriveFolder_('IPD Meeting Notes');
    if (notesFolder) {
      var md = '# ' + title + '\n\nGenerated: ' + new Date().toString() + '\n\n';
      md += '## Summary\n' + (String(minutes.summary || '').trim() || '(no summary)') + '\n\n';
      if (minutes.decisions && minutes.decisions.length) {
        md += '## Decisions\n' + minutes.decisions.map(function (d) { return '- ' + String(d); }).join('\n') + '\n\n';
      }
      if (minutes.actionItems && minutes.actionItems.length) {
        md += '## Action items\n' + minutes.actionItems.map(function (a) {
          return '- [' + String((a && a.priority) || 'MEDIUM') + '] ' + String((a && a.task) || '') +
            ((a && a.assignee) ? ' (assigned: ' + a.assignee + ')' : '') +
            ((a && a.dueDate) ? ' (due: ' + a.dueDate + ')' : '');
        }).join('\n') + '\n\n';
      }
      if (minutes.risks && minutes.risks.length) {
        md += '## Risks\n' + minutes.risks.map(function (r) { return '- ' + String(r); }).join('\n') + '\n\n';
      }
      md += '## Transcript\n' + transcript + '\n';
      var props = PropertiesService.getScriptProperties();
      var stamp2 = Utilities.formatDate(new Date(), props.getProperty('TIMEZONE') || 'Asia/Kolkata', 'yyyy-MM-dd_HHmm');
      var mdFile = notesFolder.createFile(sanitizeFileName_(title) + '_' + stamp2 + '.md', md, MimeType.PLAIN_TEXT);
      driveMinutes = { id: mdFile.getId(), url: mdFile.getUrl(), name: mdFile.getName() };
    }
  } catch (err) { driveMinutes = null; }
  return {
    success: true,
    title: title,
    transcript: transcript,
    transcriptChars: transcript.length,
    minutes: minutes,
    minutesText: minutesText,
    driveMinutes: driveMinutes,
    fallbackProvider: ai.fallbackProvider || ''
  };
}

/* ------------------------------------------------------------------ */
/* Fathom AI meeting notes — pull summaries, transcripts, and action   */
/* items recorded by Fathom into the dashboard.                        */
/* ------------------------------------------------------------------ */

/* Admin-gated: stores the Fathom API key in Script Properties so the
   real credential is never committed to the repo. Never echoes the value. */
function setFathomApiKey(token, apiKey) {
  requireAdmin_(token);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { ok: false, message: 'Missing API key.' };
  }
  PropertiesService.getScriptProperties().setProperty('FATHOM_API_KEY', apiKey.trim());
  return { ok: true };
}

function fathomEnabled_() {
  var props = PropertiesService.getScriptProperties();
  var f = (ENTERPRISE_SETTINGS || {}).FATHOM || {};
  return props.getProperty('FATHOM_ENABLED') === 'true' || f.enabled === true;
}

function fathomApiKey_() {
  var props = PropertiesService.getScriptProperties();
  var f = (ENTERPRISE_SETTINGS || {}).FATHOM || {};
  return props.getProperty('FATHOM_API_KEY') || f.apiKey || '';
}

function fathomBaseUrl_() {
  var f = (ENTERPRISE_SETTINGS || {}).FATHOM || {};
  return f.apiBaseUrl || 'https://api.fathom.ai/external/v1';
}

/* Tokenless (trigger-safe) config probe used by admin-gated endpoints. */
function fathomConfig_() {
  return {
    enabled: fathomEnabled_(),
    configured: !!fathomApiKey_(),
    baseUrl: fathomBaseUrl_()
  };
}

/* Admin-gated: Fathom connection status for the client. */
function getFathomStatus(token) {
  requireAdmin_(token);
  return { success: true, fathom: fathomConfig_() };
}

/* Admin-gated: lists recent Fathom meetings (summary + action items) so the
   UI can pick one to pull notes from. Heavier content (transcript) is fetched
   on demand via getFathomMeetingContent. */
function listFathomMeetings(token, opts) {
  requireAdmin_(token);
  opts = opts || {};
  var cfg = fathomConfig_();
  if (!cfg.enabled) return { success: false, message: 'Fathom integration is not enabled.' };
  if (!cfg.configured) return { success: false, message: 'Fathom API key is not configured.' };
  var key = fathomApiKey_();
  var max = parseInt(opts.max, 10) || ((ENTERPRISE_SETTINGS || {}).FATHOM || {}).maxMeetings || 20;
  if (max < 1) max = 20;
  if (max > 100) max = 100;

  var qs = [
    'include_summary=true',
    'include_action_items=true',
    'limit=' + max
  ];
  if (opts.createdAfter) qs.push('created_after=' + encodeURIComponent(String(opts.createdAfter)));

  try {
    var resp = UrlFetchApp.fetch(cfg.baseUrl + '/meetings?' + qs.join('&'), {
      method: 'get',
      headers: { 'X-Api-Key': key },
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var body = JSON.parse(resp.getContentText());
    if (code < 200 || code >= 300) {
      var apiErr = body && body.error && (body.error.message || body.error.code || body.error.type);
      return { success: false, message: apiErr || ('Fathom HTTP ' + code), code: code };
    }
    var items = (body.items || []).map(fathomMeetingToCard_);
    return { success: true, items: items, nextCursor: body.next_cursor || '' };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

/* Maps one Fathom meeting payload to the record-card shape the client renders. */
function fathomMeetingToCard_(m) {
  var summary = (m.default_summary && m.default_summary.markdown_formatted) ||
    (m.summary && m.summary.markdown_formatted) || '';
  var actions = (m.action_items || []).map(function (a) {
    return {
      task: String(a.description || '').trim(),
      assignee: (a.assignee && (a.assignee.name || a.assignee.email)) || '',
      completed: !!a.completed,
      timestamp: a.recording_timestamp || ''
    };
  });
  return {
    recordingId: m.recording_id,
    title: m.title || m.meeting_title || 'Untitled meeting',
    meetingTitle: m.meeting_title || '',
    url: m.url || '',
    shareUrl: m.share_url || '',
    createdAt: m.created_at || '',
    recordedBy: m.recorded_by ? (m.recorded_by.name || m.recorded_by.email) : '',
    summary: String(summary || '').trim(),
    actionItems: actions
  };
}

/* Admin-gated: fetches the full transcript for one recording and combines it
   with the already-known summary/action items. */
function getFathomMeetingContent(token, recordingId) {
  requireAdmin_(token);
  var cfg = fathomConfig_();
  if (!cfg.enabled) return { success: false, message: 'Fathom integration is not enabled.' };
  if (!cfg.configured) return { success: false, message: 'Fathom API key is not configured.' };
  if (!recordingId) return { success: false, message: 'Missing recording id.' };
  var key = fathomApiKey_();
  try {
    var resp = UrlFetchApp.fetch(cfg.baseUrl + '/recordings/' + encodeURIComponent(String(recordingId)) + '/transcript', {
      method: 'get',
      headers: { 'X-Api-Key': key },
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var body = JSON.parse(resp.getContentText());
    if (code < 200 || code >= 300) {
      var apiErr = body && body.error && (body.error.message || body.error.code || body.error.type);
      return { success: false, message: apiErr || ('Fathom HTTP ' + code), code: code };
    }
    var transcript = (body.transcript || []).map(function (t) {
      var speaker = (t.speaker && t.speaker.display_name) || 'Speaker';
      return '[' + (t.timestamp || '') + '] ' + speaker + ': ' + String(t.text || '');
    }).join('\n');
    return { success: true, recordingId: recordingId, transcript: transcript, transcriptChars: transcript.length };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

function aiKeyConfigured_() {
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  var props = PropertiesService.getScriptProperties();
  var provider = (props.getProperty('AI_PROVIDER') || ai.provider || 'openrouter').toLowerCase();
  var propName = aiKeyPropName_(provider);
  if (props.getProperty(propName) || ai.apiKey) return true;
  var kiloFallback = (props.getProperty('AI_KILO_FALLBACK') || 'true').toLowerCase() !== 'false';
  return kiloFallback && provider !== 'kilo' && provider !== 'kilocode';
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
    fathomEnabled: cfg.fathomEnabled,
    fathomConfigured: cfg.fathomConfigured,
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
