# Developer Guide

Everything a developer needs to work on the India Post Dashboard: local setup,
the file layout, the data model, and how key features are implemented.

## Setup

```powershell
npm i -g @google/clasp
clasp login
```

Then, from the repo root (see `.clasp.json` for the script ID):

```powershell
clasp pull   # sanity-check the binding (do NOT commit pulled files over yours)
clasp push --force
clasp deploy --deploymentId AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian --description "desc"
```

Live URLs:

- PWA: `https://dashboardharyana.site/app.html`
- GAS exec: `https://script.google.com/macros/s/AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian/exec`
- Compliance site: `https://www.dashboardharyana.site`

Details in the [Deployment Guide](Deployment%20Guide.md). The one-command path is
`.\deploy-all.ps1 "commit message"`.

## File layout

```
code.js             doGet/doPost JSON API, getData/getAppData, record CRUD, title stamping
DashboardService.js item building + review-status logic
RecordService.js    record CRUD + review-done service layer
Auth.js             users, hashing, sessions, throttling, login/logout/reset, admin user mgmt
Data.js             low-level sheet read/write/insert/delete/renumber
Utils.js            sheet/header detection, field mapping, locks, cache, properties, binding, preauthorize
Audit.js            Audit Log sheet + logAudit_ + read/delete/clear
Reports.js          analytics builders, XLSX + PDF export
Submissions.js      Submissions sheet, submission CRUD + locks + display toggle
Settings.js         CONFIG constants, COL map, PROP keys
Triggers.js         daily trigger management + setupProject
Notifications.js    Notifications sheet + per-user notification CRUD + event hooks
Tasks.js            Tasks sheet + task CRUD + status/priority tracking
Analytics.js        analytics builder (trends, sector/office breakdowns)
DashboardStudio.js  user dashboard preferences (view mode, column visibility)
Documents.js        Documents sheet + Drive upload/delete + record links
EnterpriseService.gs  enterprise endpoints (ics, whatsapp, ai)
EnterpriseSettings.js / EnterpriseUtils.js  enterprise feature flags + helpers
index.html          GAS page shell + all screens + base64 logos
styles.html         design system (CSS variables, dark mode)
script.html         GAS client logic (auth → dashboard → analytics → audit → reports → settings → tasks → AI)
docs/app.html       static PWA copy of index.html
docs/app.js         static PWA copy of script.html
ReportPdf.html      PDF report template
appsscript.json     manifest
.clasp.json         script binding
worker.js           Cloudflare Worker split-routing proxy
worker-enterprise-routes.js  enterprise PWA header upgrades for the Worker
deploy-all.ps1      full deployment pipeline
wrangler.toml       Worker config + routes + KV binding + GAS URL var
```

## Data model

- **`Sheet1`** — data rows, 7 columns:
  `ID, Sector, Description, Entry Date, Action, Responsibility, Review Date`.
  Data starts at row 4 (`CONFIG.SHEET.START_ROW`); rows 1–3 hold the title
  and header.
- **`Users`** (hidden, auto-created) — `Email, Role, Salt, PasswordHash,
  MustChange, CreatedBy, CreatedAt, ResetToken, ResetExpires, Group,
  Department, Office, Preferences`.
- **`Submissions`** (hidden, auto-created) — `Id, CardRow, CardId, Email, Text,
  CreatedAt, UpdatedAt, LockedBy, LockedAt, Displayed`.
- **`Tasks`** (hidden, auto-created) — title, description, assignee, priority,
  status, due date, record link.
- **`Notifications`** (hidden, auto-created) — one row per recipient, pruned to 50.
- **`Documents`** (hidden, auto-created) — Drive file metadata per record.
- **`Audit Log`** — `Timestamp, User, Action, Record ID, Details`.

### Review status (how it works)

The dashboard does not store a status column. Status is derived from the
**background colour of the review-date cell**:

- non-white (e.g. `#ffab00`) → `due`
- "green-ish" (`g >= 150 && g > r + 20 && g > b + 20`, e.g. `#c8e6c9`) → `done`
- `#ffffff` → normal

`isFlagged_` / `isReviewDoneColor_` in `code.js` compute it; `markReviewDone`
sets the green background. This is why editing a row should preserve the action
cell's rich text (see the conditional rewrite in `updateItem`).

## How the client talks to the server

`script.html` / `docs/app.js` wrap every server call in `ApiService`:
`apiCall_(functionName, ...args)` posts `{ function, args }` as `text/plain`
JSON to `API_URL` (the GAS exec URL via the Worker's `/macros/*` route). The
backend `doPost` resolves the named global function and returns JSON. Protected
functions throw on a bad token; the client catches `isAuthError` messages and
redirects to login.

The bootstrap payload comes from `getAppData(token)` which returns:

```
user, items, summary, analytics { sectors, offices, flaggedItems, trend },
settings, submissionCounts, submissionFlash, displayedSubmissions
```

The audit tail and notifications are loaded lazily the first time their tabs are
opened (`ensureAuditLoaded`, `loadNotifications`).

## Key implementation notes

- **XLSX export** (`Reports.js`) tries three fast paths (Drive v3 export,
  `DriveApp.getAs`, spreadsheet blob) and falls back to building the `.xlsx`
  package in memory with `Utilities.zip` — this always works and needs no extra
  scopes.
- **PDF export** renders `ReportPdf.html` with `HtmlService` and converts the HTML
  blob to PDF.
- **Print layouts** — `printReport()` / `printAudit()` in `script.html` open a new
  window, write a self-contained styled document, and call `print()`.
- **Batch sheet writes** — record re-sequencing and updates use the advanced
  `Sheets` service (`spreadsheets.values.batchUpdate`) instead of per-cell
  writes.
- **Optimistic UI** — mutations update the DOM immediately via `paintItem_`
  (which scrolls the edited card into view) and roll back on failure.
- **Sorting** — `sortedItems()` applies `dashSortKey`/`dashSortDir`, with
  `dashDateKey()` giving numeric ordering for `dd.MM.yyyy` dates; the card and
  table views share it.
- **Submissions visibility** — server-side `canEditSubmission_` enforces rules;
  admins override locks, editors are blocked only by admin locks, viewers edit
  only their own.
- **Sessions** — tokens stored in `CacheService` (`session_<token>`, 6 h TTL);
  `login` also records failed attempts with a 5-strike/15-min lockout.
- **Data sheet header detection** (`Utils.js`) — `getPreferredHeaderRow_` prefers
  row 3, then scans for a header row; `buildFieldMap_` matches column labels
  flexibly so field order in the sheet is not required to be fixed.
- **Auto-refresh** — a 60 s `setInterval` polls `getAppData` when the dashboard
  tab is visible; it preserves the current page and scroll.

## Debugging

- `?inspect=1` on the web app URL dumps the bound spreadsheet as JSON.
- `preauthorize()` (run once in the editor) forces the OAuth consent flow.
- `listTriggers()` shows installed triggers; `setupProject()` installs the daily
  trigger, stamps the title, and seeds the bootstrap admin.
- Server errors surface as `ERROR` audit entries and in the Apps Script editor's
  logs (STACKDRIVER).

## Verification checklist

1. `node --check` on the extracted inline script of `script.html`.
2. Every `getEl(...)` ID in `script.html` exists in `index.html`.
3. Every inline `onclick` handler is defined.
4. `clasp push -f` succeeds (catches server-side syntax errors).
5. Redeploy the stable deployment ID, hard-refresh the live URL, sign in, and
   exercise the affected feature.

## Measuring performance before/after a deploy

For login and bulk-import timing see *Measuring speed before/after a deploy* in
the [Admin Guide](Admin%20Guide.md). This section covers the two client-facing
load paths: the dashboard boot and the Tasks tab.

Common method: DevTools → **Network** (F12), **hard refresh** (**Ctrl+Shift+R**)
so the cache-busted client bundle loads, then 2–3 runs taking the median — GAS
cold starts make the first call of a session noisy. Use the same browser,
network, and data volume before and after the deploy.

**Dashboard load**

1. The app is usable once the bootstrap `getAppData` request resolves and the
   "Loading app…" overlay clears — that duration is the number to compare.
   `getAppData` returns `user, items, summary, analytics, settings,
   submissionCounts, submissionFlash, displayedSubmissions`; audit and
   notifications load lazily the first time their tabs open.
2. Server-side reads are generation-cached: the records payload is keyed by
   `dataGeneration_`, count tiles by `countCacheKey_` (records/tasks/notif
   gens), and the submissions overview by `subm:v1:g<submissionsGen>`. A
   request that follows a mutation re-reads a sheet at most once per
   generation instead of once per request.
3. Compare warm-vs-warm: the first load in a new generation window (after any
   mutation) pays the sheet read; subsequent ones hit the cache.

**Tasks tab load**

1. Click the Tasks tab with the Network tab open. `openTab('tasks')` calls
   `renderTasks()` plus `refreshCounts()` for the KPI tiles.
2. The client keeps a 30 s in-memory cache (`TASKS_CACHE_TTL_MS`): a tab
   switch within 30 s of the last fetch renders instantly from
   `appState.tasks` with no network call and no overlay. After the TTL, or
   when the filter changes, `renderTasks()` fetches `ApiService.getTasks(...)`
   and shows the "Loading tasks…" overlay — that fetch is what you time.
3. Mutations force freshness: edit/delete/complete call `renderTasks(true)`
   (immediate refetch with the overlay; `renderTasks(!0)` in the minified
   clients), while off-tab quick-adds (meeting notes → tasks) call
   `invalidateTasksCache_()` so the next tab visit refetches — saved changes
   never wait for the 30 s window.
4. Server side, `getTasks` reads `cachedTasksList_` (payload cache keyed
   `tasks:v1:g<tasksGen>`), so one Tasks-sheet read serves the tab, the KPI
   counts, and "my tasks" per generation. Mutation flows batch their
   generation bumps (`runWithBatchedCountBumps_`), collapsing N bumps per
   request into one per family.

**Checking where the time goes**

- `?inspect=1` on the web app URL dumps the bound spreadsheet as JSON (see
  Debugging) — handy for confirming the cache would have returned fresh data.
- Apps Script editor → **Execution transcript** (or STACKDRIVER logs) shows the
  per-request server time; a slow sheet read there points at a cache miss
  (new generation after a mutation) rather than client-side work.

## Logo assets

Logo data URIs live in `index.html` (sidebar, splash, About, favicon) as base64
PNGs (512/192/96 px variants of the Dak Sewa Jan Sewa logo with transparency).
To replace them, downscale the source PNG to those three sizes, base64-encode,
and swap the `data:image/png;base64,...` values. The splash tile uses a white
background so the logo stays legible.
