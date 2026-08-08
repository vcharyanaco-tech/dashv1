# Build-EnterpriseAddons-Part2.ps1
# Adds the PWA offline action queue + service-worker registration.
# Creates docs/offline-queue.js and patches docs/app.html.
# ASCII-only. Single-quoted here-strings. UTF-8 (no BOM). Backups before patches.

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot

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

# ------------------------------------------------------------ docs/offline-queue.js
$offlineQueue = @'
/*
 * OfflineQueue - PWA offline action queue for the India Post Dashboard.
 * Loaded AFTER app.js so the original global apiCall_ can be captured and
 * wrapped. Mutating calls made while offline are queued in localStorage and
 * replayed FIFO when the connection returns. Read-only calls pass through
 * unchanged. Also registers the service worker (sw.js).
 */
(function () {
  'use strict';

  var QUEUE_KEY = 'ipd_offline_queue_v1';
  var MAX_QUEUE = 200;

  var MUTATIONS = {
    addItem: true, updateItem: true, deleteItem: true, markReviewDone: true,
    changePassword: true,
    adminAddUser: true, adminUpdateUser: true, adminDeleteUser: true,
    adminResetPassword: true, adminImportUsers: true, adminEmailAllUsers: true,
    markNotificationsRead: true, clearMyNotifications: true,
    submitRecordReview: true, reviewApproval: true,
    createTask: true, updateTask: true, deleteTask: true,
    saveDashboardPreferences: true,
    addSubmission: true, updateSubmission: true, deleteSubmission: true,
    lockSubmission: true, unlockSubmission: true, toggleSubmissionDisplay: true,
    uploadDocument: true, deleteDocument: true,
    adminDeleteAuditRows: true, adminClearAudit: true,
    exportToSpreadsheet: true
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function save(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  }

  function pending() { return load().length; }

  function emit(name, detail) {
    try {
      if (window.EventBus) window.EventBus.emit(name, detail);
    } catch (e) {}
  }

  function renderQueueStatus() {
    var label = document.getElementById('offlineLabel');
    if (!label) return;
    var n = pending();
    label.textContent = n
      ? 'You are offline. ' + n + ' queued action(s) will sync when you reconnect.'
      : 'You appear to be offline. Some actions may not work until your connection returns.';
  }

  function enqueue(fn, args) {
    var q = load();
    q.push({ fn: fn, args: args, ts: Date.now() });
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    save(q);
    renderQueueStatus();
    emit('OfflineQueueChange', { pending: q.length });
    return Promise.resolve({ queued: true, pending: q.length });
  }

  function remove(item) {
    var q = load();
    var i = q.indexOf(item);
    if (i !== -1) { q.splice(i, 1); save(q); }
    return q.length;
  }

  function flush() {
    var q = load();
    if (!q.length) return Promise.resolve({ flushed: 0, failed: 0, pending: 0 });
    var flushed = 0;
    var failed = 0;
    var chain = Promise.resolve();
    q.forEach(function (item) {
      chain = chain.then(function () {
        return realApiCall(item.fn).apply(null, item.args).then(function () {
          flushed++;
          renderQueueStatus();
          emit('OfflineQueueChange', { pending: remove(item) });
        }, function () {
          failed++;
          renderQueueStatus();
          emit('OfflineQueueChange', { pending: remove(item) });
        });
      });
    });
    return chain.then(function () {
      renderQueueStatus();
      emit('OfflineQueueFlushed', { flushed: flushed, failed: failed, pending: pending() });
      return { flushed: flushed, failed: failed, pending: pending() };
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var realApiCall = window.apiCall_ || function () {
    throw new Error('apiCall_ not available');
  };

  window.apiCall_ = function (fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (MUTATIONS[fn] && navigator.onLine === false) {
      return enqueue(fn, args);
    }
    return realApiCall.apply(null, arguments);
  };

  window.OfflineQueue = {
    enqueue: enqueue,
    flush: flush,
    pending: pending,
    isMutation: function (fn) { return !!MUTATIONS[fn]; }
  };

  registerServiceWorker();

  window.addEventListener('online', function () {
    if (pending()) {
      flush().then(function (res) {
        if (res.flushed && window.refreshData) window.refreshData();
        if (window.loadNotifications) window.loadNotifications(true);
      });
    }
  });

  renderQueueStatus();
})();
'@
Write-TextFile 'docs/offline-queue.js' $offlineQueue

# ------------------------------------------------------------ docs/app.html: manifest + theme-color
$descMeta = '<meta name="description" content="Operations and compliance tracker for Circle Office Haryana.">'
$descReplacement = @'
<meta name="description" content="Operations and compliance tracker for Circle Office Haryana.">
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#2563eb">
'@
Patch-TextFile 'docs/app.html' $descMeta $descReplacement

# ------------------------------------------------------------ docs/app.html: offline banner label span
$offlineText = 'You appear to be offline. Some actions may not work until your connection returns.'
$offlineReplacement = '<span id="offlineLabel">You appear to be offline. Some actions may not work until your connection returns.</span>'
Patch-TextFile 'docs/app.html' $offlineText $offlineReplacement

# ------------------------------------------------------------ docs/app.html: load offline-queue.js after app.js
$scriptTag = '<script src="app.js?v=2026.08.07bb"></script>'
$scriptReplacement = @'
<script src="app.js?v=2026.08.07bb"></script>
  <script src="offline-queue.js?v=2026.08.07bb"></script>
'@
Patch-TextFile 'docs/app.html' $scriptTag $scriptReplacement

Write-Host ''
Write-Host 'Part 2 complete. Files: docs/offline-queue.js (created), docs/app.html (3 patches: manifest link, offline label span, offline-queue include).'
Write-Host 'Verify: run the app, open DevTools -> Application -> Service Workers (sw.js active), then go offline, make an edit, go online and watch it sync.'
