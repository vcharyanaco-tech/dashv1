# Build-EnterpriseAddons-Part1.ps1
# Writes the foundational enterprise-addon files for the India Post Dashboard.
# ASCII-only source. Single-quoted here-strings. UTF-8 (BOM) output.
# Backs up any existing target file before overwriting.

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot

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
  if (Test-Path -LiteralPath $abs) {
    $bak = $abs + '.bak'
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
    Copy-Item -LiteralPath $abs -Destination $bak -Force
    Write-Host ('Backed up existing -> ' + $RelativePath + '.bak')
  }
  $utf8 = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($abs, $Content, $utf8)
  Write-Host ('Wrote ' + $RelativePath)
}

# ------------------------------------------------------------ .clasp.json
$claspJson = @'
{
  "scriptId": "1QYwVDQGWPL5o64Xrvv9kKfE-AFT2nUuVMlvOc5CTK46qClfTCu3ofWcU",
  "rootDir": "",
  "projectId": "dashboard-504111",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": true
}
'@
Write-TextFile '.clasp.json' $claspJson

# ------------------------------------------------------------ .claspignore
$claspIgnore = @'
node_modules/**
worker.js
worker-enterprise-routes.js
wrangler.toml
deploy-worker-api.js
auto-commit.ps1
.gitignore
.git/**
SESSION.md
SESSION_EXPORT.md
.claspignore
app.js
docs/**
sw.js
manifest.json
Apply-EnterpriseAddons.ps1
Build-EnterpriseAddons-Part1.ps1
Build-EnterpriseAddons-Part2.ps1
Build-EnterpriseAddons-Part3.ps1
Build-EnterpriseAddons-Part4.ps1
Run-EnterpriseAddons.bat
Verify-EnterpriseAddons.ps1
README_ENTERPRISE_ADDONS.md
*.ps1
*.md
'@
Write-TextFile '.claspignore' $claspIgnore

# ------------------------------------------------------------ docs/manifest.json
$manifest = @'
{
  "name": "India Post Dashboard",
  "short_name": "Dashboard",
  "start_url": "/app.html",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#2563eb",
  "description": "Circle Office Haryana - India Post Dashboard",
  "icons": [
    {
      "src": "/docs-pwa-icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ]
}
'@
Write-TextFile 'docs/manifest.json' $manifest

# ------------------------------------------------------------ docs/sw.js
$sw = @'
const SW_VERSION = '2026.08.07';
const CACHE_NAME = 'ipd-dashboard-' + SW_VERSION;
const PRECACHE_URLS = [
  '/app.html',
  '/app.js',
  '/assets/styles.css',
  '/manifest.json',
  '/docs-pwa-icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.indexOf('/macros/') === 0) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        if (resp && resp.status === 200 && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return resp;
      }).catch(function () {
        return caches.match('/app.html');
      });
    })
  );
});
'@
Write-TextFile 'docs/sw.js' $sw

# ------------------------------------------------------------ docs/docs-pwa-icon.svg
$icon = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2563eb"/>
  <circle cx="256" cy="256" r="128" fill="#ffffff"/>
  <path d="M176 256l56 56 112-112" fill="none" stroke="#0f172a" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@
Write-TextFile 'docs/docs-pwa-icon.svg' $icon

# ------------------------------------------------------------ EnterpriseSettings.js
$settings = @'
var ENTERPRISE_SETTINGS = Object.freeze({
  PWA: {
    enabled: true,
    cacheBuster: '2026.08.07'
  },
  WHATSAPP: {
    enabled: false,
    apiBaseUrl: '',       // PLACEHOLDER - never commit real credentials
    apiToken: '',         // PLACEHOLDER
    senderNumber: '',     // PLACEHOLDER
    templateName: ''      // PLACEHOLDER
  },
  CALENDAR: {
    enabled: false,
    outputSheetName: 'ICS_EXPORT'
  },
  AI_INSIGHTS: {
    enabled: false,
    apiKey: '',           // PLACEHOLDER
    model: 'gpt-4o-mini',
    dailySummary: {
      hour: 18,
      minute: 30
    }
  }
});
'@
Write-TextFile 'EnterpriseSettings.js' $settings

# ------------------------------------------------------------ EnterpriseUtils.js
$utils = @'
function enterpriseFeatureEnabled_(feature) {
  var s = (ENTERPRISE_SETTINGS || {})[feature];
  return !!(s && s.enabled);
}

function icsEscapeText_(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function icsFormatDate_(date) {
  var d = date instanceof Date ? date : new Date(date);
  function two(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + 'T' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
}

function icsFormatDateOnly_(date) {
  var d = date instanceof Date ? date : new Date(date);
  function two(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate());
}
'@
Write-TextFile 'EnterpriseUtils.js' $utils

Write-Host ''
Write-Host 'Part 1 complete. Files: .clasp.json, .claspignore, docs/manifest.json, docs/sw.js, docs/docs-pwa-icon.svg, EnterpriseSettings.js, EnterpriseUtils.js'
