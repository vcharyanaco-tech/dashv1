# Enterprise Addons - India Post Dashboard

This folder-level build adds four enterprise capabilities on top of the
existing Circle Office Haryana dashboard: PWA + offline action queue, a
review-calendar .ics export, WhatsApp review reminders, and AI dashboard
insights. All features are gated by ENTERPRISE_SETTINGS in
EnterpriseSettings.js and are DISABLED by default.

## What was added

| Part | Files | Purpose |
|------|-------|---------|
| 1 | .clasp.json, .claspignore | Clasp hygiene: skip docs/, exclude build/Node artifacts, keep GAS push safe |
| 1 | docs/manifest.json, docs/sw.js, docs/docs-pwa-icon.svg | PWA app-shell manifest, service worker, icon |
| 1 | EnterpriseSettings.js, EnterpriseUtils.js | Feature flags + shared helpers (ics escape/format, feature gating) |
| 2 | docs/offline-queue.js | Wraps apiCall_: queues mutating calls while offline, replays FIFO on reconnect, registers sw.js |
| 2 | docs/app.html (patched) | Manifest link, theme-color, offline label span, offline-queue include |
| 3 | EnterpriseService.gs | Server endpoints: exportReviewCalendarIcs, sendWhatsAppReviewReminders, getAiInsights |
| 3 | appsscript.json (patched) | Adds script.external_request scope for UrlFetchApp |
| 3 | docs/app.js (patched) | Client API methods for the three endpoints |
| 4 | worker-enterprise-routes.js | Optional Worker module: PWA header upgrades |
| 4 | Apply / Run / Verify scripts | Orchestration + verification (never push/deploy) |

## Configuration (EnterpriseSettings.js)

- WHATSAPP.enabled / apiBaseUrl / apiToken / senderNumber - WhatsApp provider.
- CALENDAR.enabled - .ics export for review-due records.
- AI_INSIGHTS.enabled / apiKey / model / endpoint - AI summary provider.
  Endpoint defaults to ENTERPRISE_AI_DEFAULT_ENDPOINT in EnterpriseService.gs.

Placeholder credentials are empty strings. Nothing is sent until you set real
values AND flip the matching enabled flag. Never commit real secrets.

## Offline queue (docs/offline-queue.js)

- Mutating calls (addItem, updateItem, deleteItem, markReviewDone, tasks,
  submissions, documents, approvals, settings) are queued in localStorage
  (key ipd_offline_queue_v1, capped at 200) when navigator.onLine is false.
- Read calls pass through untouched.
- On the online event the queue replays FIFO; each item is removed whether it
  succeeds or fails, so the queue can never deadlock.
- After a successful flush the app calls refreshData() and loadNotifications(true).

## Service worker (docs/sw.js)

- Precache: /app.html, /app.js, /assets/styles.css, /manifest.json,
  /docs-pwa-icon.svg.
- Bypass /macros/* so API calls always go to GAS.
- Runtime cache same-origin GETs; offline fallback to /app.html.

## Worker wiring (optional, Part 4)

worker.js already serves every file in docs/. To upgrade PWA headers:

  import { isEnterprisePath, enterpriseHeadersForPath } from './worker-enterprise-routes.js';

  // in fetch(), before the static-bundle fallback:
  if (isEnterprisePath(path)) {
    const resp = await fetchFromPages(path, url.search);
    const headers = new Headers(resp.headers);
    Object.entries(enterpriseHeadersForPath(path)).forEach(([k, v]) => headers.set(k, v));
    return new Response(resp.body, { status: resp.status, headers });
  }

Then redeploy the Worker. Without this, the PWA still works; the headers are
only an optimization.

## Build + verify (offline only)

- Double-click Run-EnterpriseAddons.bat, or run Apply-EnterpriseAddons.ps1.
- It runs Parts 1-3 then Verify-EnterpriseAddons.ps1.
- It never commits, pushes, runs clasp, or deploys.

## Deploy checklist (manual, in order)

1. git add -A; git commit -m 'feat: enterprise addons (PWA, offline queue, ics, whatsapp, ai)'; git push
   -> GitHub Pages rebuilds docs/.
2. clasp push --force
   -> pushes EnterpriseService.gs + EnterpriseSettings.js + EnterpriseUtils.js
      (docs/ and *.ps1/*.md are excluded via .claspignore).
3. clasp version '<message>'
   clasp deploy -i <worker-target-deployment-id> -V <newVersion> -d '<message>'
   -> GAS exec URL now serves the new endpoints.
4. Bump the cache-buster in docs/app.html (?v=...) so clients fetch the new
   app.js, then commit + push again.
5. Redeploy the Cloudflare Worker after wiring worker-enterprise-routes.js.

## Verification

Run Verify-EnterpriseAddons.ps1 any time after building. It checks all files
and key markers and exits non-zero on failure.

## Safety notes

- .claspignore excludes docs/**, sw.js, manifest.json, worker-enterprise-routes.js,
  deploy-worker-api.js, *.ps1 and *.md, so no Node/PowerShell/PWA file can ever
  be pushed to Apps Script.
- All generated content is ASCII-only and UTF-8 (no BOM) to survive Windows
  PowerShell 5.1 and Git line-ending handling.
- Every patched file is backed up to <name>.bak before modification.