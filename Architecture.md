# Architecture

This document describes how the India Post Dashboard works end to end: the Google
Apps Script backend, the served frontend, the data model, and the auth flow.

## 1. Overview

```
browser ── https://script.google.com/macros/s/<deploymentId>/exec
   │          (ANYONE_ANONYMOUS, executes as the deploying user)
   ▼
Apps Script web app
   │  doGet → index.html (HTML + styles.html + script.html)
   │  google.script.run.* → *.js server functions
   ▼
Bound Google Spreadsheet
   ├── Sheet1        → dashboard records (visible)
   ├── Users         → user accounts (hidden, auto-created)
   ├── Submissions   → viewer/editor updates (hidden, auto-created)
   └── Audit Log     → action history (visible)
```

The web app is deployed as `ANYONE_ANONYMOUS` with `USER_DEPLOYING` execution, so
no Google sign-in is required to reach the page. Access control is implemented in
the app itself with email/password login and token-based sessions.

## 2. Backend modules

### `code.js` — entry point and dashboard data
- `doGet(e)` — serves the app. Supports `?inspect=1`, which returns a raw JSON dump
  of the bound sheet (sheets, last row/column, and preview) for debugging.
  Otherwise returns `HtmlService` with `index.html` (with `styles.html` and
  `script.html` included).
- `getData()` — reads rows from the data sheet, applies review-status heuristics
  from the review-date cell background, formats dates, linkifies URLs, preserves
  rich-text formatting in the action field, and returns `{ title, heading, asOf, items }`.
- `updateItem(item, token)` / `addItem(item, token)` / `deleteItem(row, token)` —
  record CRUD, gated by `requireEditor_`. Adds borders and flag/normal background
  colours. Deleting renumbers the ID column.
- `markReviewDone(row, token)` — admin only; sets the review-date cell background
  to the "done" colour and writes an `REVIEW_DONE` audit entry.
- `getAppData(token)` — the aggregate bootstrap payload for the client:
  `user`, `items`, `summary`, `analytics`, `audit` (last 80), `settings`,
  `submissionCounts`, `submissionFlash`, `displayedSubmissions`.
- `stampTitle_()` / `dailyDateUpdate()` — write/update the "… on <date>" heading in
  cell A1 of the data sheet.
- Rendering helpers — `escHtml_`, `looksLikeUrl_`, `linkifyText_`,
  `richToHtml_` (converts rich-text runs + colours + links to inline HTML).

### `Auth.js` — users, sessions, roles
- Users live in the hidden `Users` sheet with headers
  `Email | Role | Salt | PasswordHash | MustChange | CreatedBy | CreatedAt |
  ResetToken | ResetExpires`.
- The bootstrap admin (`ADMIN_USERS[0]`) is created on first login with
  `DEFAULT_ADMIN_PASSWORD` and `mustChange = true`. Static `EDITOR_USERS` /
  `VIEWER_USERS` arrays are empty — all other users are created through the
  admin UI.
- `hashPassword_(password, salt)` — `sha256(salt | password)` iterated 500 times.
- Sessions are random tokens stored in `CacheService` (`session_<token>`) with
  `SESSION_TTL_SECONDS = 21600` (6 hours).
- Login throttling: failed attempts counted in cache (`loginfail_<key>`); after
  `MAX_LOGIN_ATTEMPTS = 5` attempts the email is blocked for
  `LOCK_MINUTES = 15`.
- Role resolution (`getUserRole`) checks the Users sheet first, then the static
  admin/editor/viewer arrays.
- Guards: `requireLogin_(token)`, `requireEditor_(token)`, `requireAdmin_(token)`
  throw on insufficient permission.
- Password reset: `requestPasswordReset` emails a link with a token valid for
  `RESET_TTL_MINUTES = 30`; `resetPasswordWithToken` sets a new password.
- Admin user management: `adminGetUsers`, `adminAddUser`, `adminDeleteUser`,
  `adminResetPassword`. The primary admin account cannot be deleted.

### `Data.js` — low-level data sheet access
- `dataSheet_()` with sheet-level memoization, `dataRead_`, `dataUpdate_`,
  `dataInsert_`, `dataDelete_`, and `dataRenumber_` (rewrites the ID column
  sequentially from the data start row).

### `Utils.js` — shared infrastructure
- Spreadsheet binding: `SOURCE_SPREADSHEET_ID` (the bound sheet), `getSpreadsheet_`
  (memoized `openById`).
- Header detection: `isLikelyHeaderRow_`, `findHeaderRow_`,
  `getPreferredHeaderRow_` (prefers row 3), `buildFieldMap_`, and
  `getSheetDataRows_` which normalizes each row to
  `{ rowNumber, id, sector, description, entryDate, action, responsibility,
  reviewDate, displayFields }`.
- Audit-derived fallback: `getAuditDerivedRows_` rebuilds items from `ADD` audit
  rows when the data sheet is empty.
- Locking: `runWithLock_(callback)` wraps mutations in `LockService` with a
  `CONFIG.LOCK.WAIT_TIME = 30000` ms timeout.
- Caching: `cacheGet_` / `cachePut_` over `CacheService` (300 s TTL, disabled via
  `CONFIG.CACHE.ENABLED`).
- Helpers: `preauthorize()` (forces OAuth consent as the deploying user),
  `inspectBoundSheet_`, date/colour/validation helpers.

### `Audit.js` — audit log
- The `Audit Log` sheet has columns `Timestamp | User | Action | Record ID | Details`.
- `logAudit_(action, id, details, userEmail)` appends entries; dedicated helpers
  `auditAdd_`, `auditUpdate_`, `auditDelete_`, `auditError_`.
- `getAuditEntries(limit)` returns the most recent rows (default 100; the client
  requests 80) newest-first, each with its physical `row` number.
- `adminDeleteAuditRows(rowNumbers, token)` — admin only; deletes the given rows
  (descending order) and logs `AUDIT_DELETE`.
- `adminClearAudit(token)` — admin only; wipes all entries and logs `AUDIT_CLEAR`.

### `Reports.js` — analytics and exports
- Builders: `buildSummaryFromItems` (total/flagged/normal/sector counts),
  `buildSectorReportFromSummary`, `buildFlaggedItemsFromItems`,
  `buildMonthlyTrendFromItems` (YYYY-MM keys), `getPrintableReport`.
- `exportToSpreadsheet(token)` — builds a temporary spreadsheet, converts it to
  `.xlsx` through up to three fast paths (Drive v3 export, `DriveApp.getAs`,
  spreadsheet blob) and a guaranteed in-memory fallback
  (`buildXlsxFromItems_` constructs the ZIP with `Utilities.zip`), then trashes the
  temp spreadsheet and returns `{ filename, base64 }`.
- `createPdfReport(token)` — renders `ReportPdf.html` with the report data and
  converts it to a PDF, returning `{ filename, base64 }`.

### `Submissions.js` — submissions store
- The hidden `Submissions` sheet has columns
  `Id | CardRow | CardId | Email | Text | CreatedAt | UpdatedAt | LockedBy |
  LockedAt | Displayed`.
- Visibility rules (`canEditSubmission_` / `visibleSubmission_`):
  - ADMIN can edit anything.
  - EDITOR can edit unless an admin locked the submission.
  - VIEWER can edit only their own, unlocked submissions.
- `getSubmissions(token, cardRow)` — submissions for a card, newest first.
- `addSubmission` / `updateSubmission` — validate length
  (`MAX_TEXT_LENGTH = 5000`), append/update rows inside `runWithLock_`.
- `lockSubmission` / `unlockSubmission` — editor+; admin locks are admin-only.
- `deleteSubmission` — admin only; deletes the row.
- `toggleSubmissionDisplay` — admin only; shows/hides the submission on the card.
- `getSubmissionOverview_()` — per-card counts, a 24-hour `flash` map, and the
  list of displayed submissions. Cached for the request.

### `Settings.js` — configuration
- `CONFIG` holds every constant: sheet name/start row/column count, colours,
  cache TTL, users/session/lock limits, submissions limits, and
  `APP = { NAME: 'India Post Dashboard', VERSION: '1.0.0', BRAND: 'India Post' }`.
- `COL` maps the 7 data columns; `PROP` lists property keys
  (`APP_NAME`, `SHEET_NAME`, `START_ROW`, `LAST_SYNC`).
- `getAppSettings()` / `saveAppSettings(...)` remain as a thin property-store
  wrapper (the client no longer exposes an Application settings UI).

### `Triggers.js` — scheduled jobs
- `installTriggers()` creates a daily time trigger for `dailyDateUpdate`
  (at 00:00, Asia/Kolkata); `removeTriggers()`, `reinstallTriggers()`,
  `listTriggers()`, and `setupProject()` (install + `stampTitle_` + ensure the
  bootstrap admin) are provided.

## 3. Frontend (`script.html`)

Modules, roughly in order of appearance:

1. **Constants & helpers** — `APP_VERSION = '1.0.0'`, `APP_BUILD`, DOM helpers
   (`getEl`, `escapeHtml`, `escAttr`), `renderLinkableText`, `parseQueryParams`,
   `debounce`, `svgIcon`, toast/overlay, splash handling.
2. **Session & auth** — `getAuthToken`/`setAuthToken` (reads/writes the
   `indiaPostAuthToken` localStorage key), `isAuthError`, `handleServerFailure`,
   login/forgot/reset forms, `logout`.
3. **App chrome** — `initApp` (bootstraps `loadApp`), `loadApp` (calls
   `getAppData`), theme/dark mode, sidebar, profile menu, tab switching,
   `openTab`.
4. **Dashboard** — filter population/chips, search (debounced), KPI cards
   (`renderKpiCards` with sparklines), card builder (`buildCardHtml`), pagination.
5. **Analytics** — `renderAnalytics` using `summary` and `analytics` payload.
6. **Audit** — `renderAudit`, sorting (`setAuditSort`), row selection
   (`auditSelectedRows`, `toggleAuditSelectAll`), `deleteAuditRows`,
   `clearAuditLog`, copy to clipboard, CSV download, `printAudit` (dedicated
   A4 print window).
7. **Reports** — `renderReportPreview`, CSV, `exportSpreadsheet` (XLSX),
   `downloadPdf`, `printReport` (dedicated A4 landscape print window).
8. **Settings** — `renderSettings` (password change), user management
   (`loadUsers`, add/delete/reset).
9. **Record editing** — modal for add/edit (`openEditModal`, `saveEditModal`),
   `deleteItem`, `toggleReviewDropdown`, `markReviewDone`.
10. **Submissions** — `openSubmissionsModal`, `loadSubmissions`,
    `renderSubmissionList`, add/edit (`submitSubmission`), `lockSubmission`,
    `unlockSubmission`, `deleteSubmission`, display toggle.

The client calls server functions via `google.script.run` and always passes the
session token (`getAuthToken()`) as a trailing argument to protected endpoints.

## 4. Data model

### `Sheet1` (dashboard records)
Columns (1-based): 1 `ID`, 2 `Sector`, 3 `Description`, 4 `Entry Date`,
5 `Action`, 6 `Responsibility`, 7 `Review Date`. Data starts at `START_ROW = 4`
(rows 1–3 hold the title/header). The review-date cell background encodes status:
`#ffab00` (or any non-white) = "Review due", a green-ish colour = "Review done",
`#ffffff` = normal.

### `Users` (hidden)
See Auth section above.

### `Submissions` (hidden)
See Submissions section above.

### `Audit Log`
`Timestamp | User | Action | Record ID | Details`; the client shows the newest 80.

## 5. Auth flow

1. `doGet` serves the page; the client checks for a stored token.
2. If present, `validateSession(token)` is called; on success `loadApp()` loads
   `getAppData(token)`.
3. Login (`login(email, password)`) validates, verifies the hash, issues a
   session token, and returns `{ success, token, mustChange, user }`.
4. If `mustChange` is true the user is forced to change their password.
5. "Forgot password" emails a one-time link (`?resetToken=…&email=…`) valid for
   30 minutes.
6. Every protected server function calls `requireLogin_(token)` /
   `requireEditor_(token)` / `requireAdmin_(token)`.

## 6. Key security notes

- Passwords are never stored in plain text (salted, 500× SHA-256).
- Sessions expire after 6 hours; logout destroys the token.
- Failed logins are rate-limited per email address.
- The bootstrap admin is a fixed address in `ADMIN_USERS` and cannot be deleted
  from the admin UI; change its password on first login.
- Audit `ERROR` entries record exceptions; all destructive actions are audited.
