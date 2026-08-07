/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * EnterpriseService.gs
 * Enterprise addons server endpoints: review calendar (.ics),
 * WhatsApp review reminders (Meta WhatsApp Cloud API), and
 * AI dashboard insights (provider-switchable: Groq, Hugging Face,
 * OpenRouter, or Google Gemini).
 * All features are gated by ENTERPRISE_SETTINGS (EnterpriseSettings.js)
 * and optional Script Properties overrides.
 * ============================================================
 */

var ENTERPRISE_AI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
var ENTERPRISE_AI_OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
var ENTERPRISE_AI_GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
var ENTERPRISE_AI_HF_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
var ENTERPRISE_AI_SYSTEM_PROMPT = 'You are a concise data-analytics assistant for the India Post Haryana dashboard. ' +
  'The user gives current dashboard summary numbers. Respond ONLY with exactly 3 short bullet ' +
  'points of concrete follow-up actions derived from those numbers. Do not describe India, ' +
  'its geography, history, or culture.';
var ENTERPRISE_AI_RECORD_SYSTEM_PROMPT = 'You are a concise data-analytics assistant for the India Post Haryana dashboard. ' +
  'The user gives one dashboard record and optionally the text of its linked file. Respond ONLY with exactly 3 short bullet ' +
  'points of concrete follow-up actions derived from that record and link. Do not describe India, ' +
  'its geography, history, or culture.';
var ENTERPRISE_AI_LINK_MAX_CHARS = 25000;

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
  return 'OPENROUTER_API_KEY';
}

function aiDefaultModel_(provider) {
  if (provider === 'gemini') return 'gemini-2.0-flash';
  if (provider === 'groq') return 'llama-3.3-70b-versatile';
  if (provider === 'huggingface') return 'meta-llama/Llama-3.3-70B-Instruct';
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
   prompt through it. Returns {success, insights} or {success: false, message}. */
function generateAiText_(prompt, systemPrompt) {
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  var props = PropertiesService.getScriptProperties();
  var provider = (props.getProperty('AI_PROVIDER') || ai.provider || 'openrouter').toLowerCase();
  var apiKey = props.getProperty(aiKeyPropName_(provider)) || ai.apiKey || '';
  if (!apiKey) {
    return { success: false, message: 'AI credentials are not configured.' };
  }
  var model = props.getProperty('AI_MODEL') || ai.model || aiDefaultModel_(provider);
  try {
    if (provider === 'gemini') return callGemini_(props, ai, apiKey, model, prompt, systemPrompt);
    if (provider === 'groq') return callGroq_(props, apiKey, model, prompt, systemPrompt);
    if (provider === 'huggingface') return callHuggingFace_(props, apiKey, model, prompt, systemPrompt);
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
  var fetched = String(fetchLinkText_(url) || '').replace(/\s+/g, ' ').trim();
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
  if (sheets) return 'https://docs.google.com/spreadsheets/d/' + sheets[1] + '/export?format=csv';
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

function fetchRawText_(url) {
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, timeoutSeconds: 15, followRedirects: false });
    if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) return '';
    var body = resp.getContentText();
    if (!body || body.indexOf('\u0000') !== -1) return '';
    var lower = body.substring(0, 500).toLowerCase();
    if (lower.indexOf('<html') !== -1 || lower.indexOf('<!doctype') !== -1) {
      return htmlToText_(body);
    }
    return String(body).replace(/\s+/g, ' ').trim();
  } catch (err) { return ''; }
}

function isReadableAiText_(text) {
  var t = String(text || '').trim();
  if (t.length <= 40) return false;
  var low = t.toLowerCase();
  if (low.indexOf('request access') !== -1) return false;
  if (low.indexOf('sign in to continue') !== -1) return false;
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

function aiKeyConfigured_() {
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  var props = PropertiesService.getScriptProperties();
  var provider = (props.getProperty('AI_PROVIDER') || ai.provider || 'openrouter').toLowerCase();
  var propName = aiKeyPropName_(provider);
  return !!props.getProperty(propName) || !!ai.apiKey;
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
