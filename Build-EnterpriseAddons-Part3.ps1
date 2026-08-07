# Build-EnterpriseAddons-Part3.ps1
# Adds the enterprise server endpoints (review calendar .ics, WhatsApp
# reminders, AI insights) to Apps Script plus the external_request scope,
# and exposes client API methods in docs/app.js.
# ASCII-only. Single-quoted here-strings. UTF-8 (no BOM). Backups before patches.

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$nl = "`r`n"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Backup-Existing {
  param([string]$RelativePath)
  $abs = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $abs)) { return }
  $bak = $abs + '.bak'
  if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
  Copy-Item -LiteralPath $abs -Destination $bak -Force
  Write-Host ('Backed up ' + $RelativePath + ' -> ' + (Split-Path -Leaf $bak))
}

function Write-TextFile {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $abs = Join-Path $repoRoot $RelativePath
  $dir = Split-Path -Parent $abs
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  Backup-Existing $RelativePath
  [System.IO.File]::WriteAllText($abs, $Content, $utf8)
  Write-Host ('Wrote ' + $RelativePath)
}

function Patch-TextFile {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Anchor,
    [Parameter(Mandatory = $true)][string]$Replacement
  )
  $abs = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $abs)) { throw ('Missing: ' + $RelativePath) }
  $content = [System.IO.File]::ReadAllText($abs, $utf8)
  if (-not $content.Contains($Anchor)) { throw ('Anchor not found in ' + $RelativePath + ': ' + $Anchor) }
  Backup-Existing $RelativePath
  $content = $content.Replace($Anchor, $Replacement)
  [System.IO.File]::WriteAllText($abs, $content, $utf8)
  Write-Host ('Patched ' + $RelativePath)
}

# ------------------------------------------------------------ EnterpriseService.gs
$service = @'
/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * EnterpriseService.gs
 * Enterprise addons server endpoints: review calendar (.ics),
 * WhatsApp review reminders, and AI dashboard insights.
 * All features are gated by ENTERPRISE_SETTINGS (EnterpriseSettings.js).
 * ============================================================
 */

var ENTERPRISE_AI_DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

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

/* Sends WhatsApp review reminders to users whose records are due today or
   tomorrow. Admin only. Gated by ENTERPRISE_SETTINGS.WHATSAPP. */
function sendWhatsAppReviewReminders(token) {
  var user = requireAdmin_(token);
  var wa = (ENTERPRISE_SETTINGS || {}).WHATSAPP || {};
  if (!wa.enabled) {
    return { success: false, message: 'WhatsApp reminders are not enabled.' };
  }
  if (!wa.apiBaseUrl || !wa.apiToken || !wa.senderNumber) {
    return { success: false, message: 'WhatsApp credentials are not configured.' };
  }
  var data = getData();
  var users = listUserRecords_();
  var due = (data.items || []).filter(function (item) {
    if (item.reviewStatus === 'done') return false;
    var days = daysUntilDate_(item.reviewDate);
    return days === 0 || days === 1;
  });
  var sent = [];
  users.forEach(function (u) {
    var phone = String(u.phone || '').trim();
    if (!phone) return;
    due.forEach(function (item) {
      if (!responsibilityMatchesUser_(String(item.responsibility || '').trim(), u)) return;
      var payload = {
        to: phone,
        type: 'text',
        text: 'Review due ' + (item.reviewDate || '') + ' for record #' + item.id +
          ' - ' + (item.sector || '') + '. Please log in to the India Post Dashboard.'
      };
      var ok = postWhatsApp_(wa, payload);
      sent.push({ phone: phone, record: item.id, ok: ok });
    });
  });
  return { success: true, sent: sent.length, attempts: sent };
}

/* POSTs one message to the configured WhatsApp provider. */
function postWhatsApp_(wa, payload) {
  try {
    var resp = UrlFetchApp.fetch(wa.apiBaseUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + wa.apiToken,
        'X-Sender': wa.senderNumber
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    return code === 200 || code === 201;
  } catch (err) {
    return false;
  }
}

/* Returns AI-generated insights for the admin dashboard. Gated by
   ENTERPRISE_SETTINGS.AI_INSIGHTS. */
function getAiInsights(token) {
  var user = requireAdmin_(token);
  var ai = (ENTERPRISE_SETTINGS || {}).AI_INSIGHTS || {};
  if (!ai.enabled) {
    return { success: false, message: 'AI insights are not enabled.' };
  }
  if (!ai.apiKey) {
    return { success: false, message: 'AI credentials are not configured.' };
  }
  var data = getData();
  var summary = buildSummaryFromItems(data.items || []);
  var prompt = 'Summarize the India Post dashboard: total=' + summary.total +
    ', reviewDue=' + summary.flagged + ', normal=' + summary.normal +
    '. Suggest the top 3 follow-up actions in short bullet points.';
  try {
    var resp = UrlFetchApp.fetch(ai.endpoint || ENTERPRISE_AI_DEFAULT_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ai.apiKey },
      payload: JSON.stringify({
        model: ai.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });
    var body = resp.getContentText();
    return { success: true, insights: body };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}
'@
Write-TextFile 'EnterpriseService.gs' $service

# ------------------------------------------------------------ appsscript.json: external_request scope
$scopeAnchor = '    "https://www.googleapis.com/auth/userinfo.email"'
$scopeReplacement = '    "https://www.googleapis.com/auth/userinfo.email",' + $nl + '    "https://www.googleapis.com/auth/script.external_request"'
Patch-TextFile 'appsscript.json' $scopeAnchor $scopeReplacement

# ------------------------------------------------------------ docs/app.js: client API methods
$apiAnchor = "  emailReport: function (recipient, templateKey) { return apiCall_('emailReport', getAuthToken(), recipient, templateKey); }"
$apiReplacement = $apiAnchor + $nl +
  "  exportReviewCalendarIcs: function () { return apiCall_('exportReviewCalendarIcs', getAuthToken()); }," + $nl +
  "  sendWhatsAppReviewReminders: function () { return apiCall_('sendWhatsAppReviewReminders', getAuthToken()); }," + $nl +
  "  getAiInsights: function () { return apiCall_('getAiInsights', getAuthToken()); }"
Patch-TextFile 'docs/app.js' $apiAnchor $apiReplacement

Write-Host ''
Write-Host 'Part 3 complete. Files: EnterpriseService.gs (created), appsscript.json (external_request scope), docs/app.js (3 client API methods).'
Write-Host 'Note: features stay disabled until ENTERPRISE_SETTINGS flags + real credentials are provided.'
