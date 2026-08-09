# Change Log

## 1.0.0 — 2026-08-19 (current, git `main`)

### Phase 1 — Architecture & technical debt (deployment @79)
- Backend service extraction: new `DashboardService.js` (item building + review
  status logic) and `RecordService.js` (record CRUD + review-done), leaving
  `code.js` as a thin entry facade. Role guards now consistently run before the
  sheet lock.
- Client service layer: new `EventBus` and `ApiService` in `script.html`. All 26
  `google.script.run` call sites now go through `ApiService` promise calls;
  token injection, argument order, and failure handling are centralized, and a
  shared `applyAppData` updater keeps every refresh path in sync.
- New `ROLES` (`ADMIN`/`EDITOR`/`VIEWER`) and `ACTIONS` enums in `Settings.js`;
  hard-coded role/action strings replaced across the server code.
- JSDoc added to every public server function.
- Dead code removed: Data.js CRUD layer, Cache helpers, audit alias functions,
  `getConfig`/`getAppInfo`/`saveAppSettings`, `renumber_`/`withLock_` aliases,
  plus the unused `Scripts.html`, `images.png`, and `auto_commit_push.py` files.
- Behavior unchanged; verified with `node --check` and a DOM/onclick audit.

### Phase 2 — UI/UX modernization (deployment @80)
- Enterprise table view for the dashboard (`Cards` / `Table` toggle). Sortable
  columns (ID, Sector, Description, Entry date, Review date), review-due row
  highlighting, and per-row Update/Edit/Delete actions; shares the existing
  filters, search, and pagination with the card view.
- Record drill-down dialog (S8): click any card row or table row to see every
  field, review status, and submission count with contextual actions.
- Shared dialog system (S4): `openDialog`/`closeDialog` manage every modal
  (focus, aria state, body scroll lock) and a styled `confirm` dialog replaces
  all native `confirm()` boxes (delete record/user/audit/submission, clear log,
  mark review done).
- Audit log pagination (S11): 20 entries per page with prev/next controls and a
  page range in the summary; sorting and delete/clear now reset to page 1.
- Global search (S12) was already present (topbar input + sector filters +
  Ctrl-K focus) and continues to work across both views.
- Verified with `node --check` and a DOM/onclick audit; deployed @80.

### Phase 3 — Performance & optimization (deployment @81)
- **Read caching (S1):** the `getData()` payload (items, review statuses,
  formatted fields) is now served from a chunked `CacheService` read cache
  (`CONFIG.CACHE.TTL`, 60 s), so page loads, refreshes, and report/summary
  builders no longer re-read the sheet, rich text, or backgrounds every call.
  The cache is invalidated in every data-sheet write (add/update/delete record,
  mark review done) and safely degrades when disabled or quota-limited.
- **Batch sheet writes (S3):** record ID re-sequencing after a delete
  (`dataRenumber_`) writes all IDs in a single `setValues` instead of one
  `setValue` per row; `addRecord_` reuses a single row `Range` handle.
- **KPI / analytics / review-status (S5):** review-status computation (sheet
  background reads) runs once per cached payload inside `buildDashboardItems_`;
  summary and analytics builders run as pure functions over the cached item set.
- **Payload reduction (S2):** the 80-entry audit tail was removed from the
  `getAppData` bootstrap payload. The client now loads it lazily
  (`ensureAuditLoaded`) the first time the Audit tab is opened and refreshes it
  when that tab is visible during a manual refresh.
- Verified with `node --check` and a DOM/onclick audit; deployed @81.

### Phase 4 — Enterprise Features, Tranche A: User & Role Management (deployment @82)
- **Granular RBAC permission matrix:** new `MODULES` / `MODULE_ACTIONS` /
  `PERMISSIONS` in `Settings.js` with View/Create/Edit/Delete/Export/Approve per
  module (`records`, `submissions`, `audit`, `users`, `reports`, `settings`).
  Server-side `hasPermission_` / `getUserPermissions` / `getUserContext` enforce
  and expose the caller's effective permission set.
- **User groups:** `USER_GROUPS` (Approver, Auditor, Exporter) grant extra
  permissions on top of the role; a user's `Group` cell may list several
  comma-separated groups.
- **Department / office access restrictions:** users now have `Department` and
  `Office` fields. When set (non-admin), `getAppData` scopes visible records to
  the user's department (matches record sector) and office (matches
  responsibility) — summary and analytics follow the scoped set.
- **Users schema v2:** the hidden `Users` sheet gained `Group`, `Department`,
  `Office` columns (auto-migrated on first run). Add-user form, users table, and
  a new Edit-user dialog manage them.
- **Bulk import/export:** `adminExportUsers` downloads all users as CSV;
  `adminImportUsers` creates/updates users from pasted CSV (email, role, group,
  department, office, optional password; random password + forced change for new
  users without one) with per-row error reporting.
- **User activity dashboard:** `adminGetUserActivity` aggregates per-user
  actions/logins/last-seen and recent events from the audit log; rendered as a
  stats grid, table, and recent-activity list in Settings.
- Verified with `node --check` and a DOM/onclick audit; deployed @82.

### Phase 4 — Enterprise Features, Tranche B: Notification Center (deployment @83)
- **In-app notification center:** a bell in the topbar with an unread badge and a
  dropdown panel lists the signed-in user's most recent notifications. Items can
  be opened (marks read + jumps to the relevant tab) or all marked read at once.
- **Notifications sheet:** hidden `Notifications` sheet (auto-created) stores one
  row per recipient; each user keeps at most `CONFIG.NOTIFICATIONS.MAX_PER_USER`
  (50) entries, pruned on write. `getMyNotifications` / `markNotificationsRead`
  power the panel (`notificationsGet` / `notificationsRead` via ApiService).
- **Event hooks:** record add/update/delete and review-done notify all staff
  (ADMIN/EDITOR roles + APPROVER group, excluding the actor); new submissions
  notify approvers; account creation (single or bulk import), password change
  and admin password resets notify the affected user.
- Verified with `node --check` and a DOM/onclick audit; deployed @83.

### Phase 4 — Enterprise Features, Tranche C: Workflow Engine (deployment @84)
> **Removed in Phase 7** — the Approvals tab and `Workflow.js` were later removed
> (see Phase 7). This entry is kept for the historical record.
- **Approval workflow engine:** new `Workflow.js` server module backed by a hidden
  `Approvals` sheet. Defines `WORKFLOW_TYPES` (currently `RECORD_REVIEW`) and
  `APPROVAL_STATUS` (PENDING / APPROVED / REJECTED).
- **Submit for review:** editors can now request formal review from the record
  detail dialog. This creates a pending approval request that routes to all
  APPROVER-group members and admins.
- **Review actions:** approvers/admins see pending requests in the new Approvals
  tab and can approve or reject with an optional comment. Approving a
  `RECORD_REVIEW` automatically marks the record's review-date cell as done
  and writes an audit entry; rejecting notifies the submitter.
- Verified with `node --check` and a DOM/onclick audit; deployed @84.

### Phase 4 — Enterprise Features, Tranche D: Task Management (deployment @85)
- **Task management module:** new `Tasks.js` server module backed by a hidden
  `Tasks` sheet. Tasks can be linked to records, assigned to users, and tracked
  through statuses (OPEN, IN_PROGRESS, DONE, CANCELLED) and priorities
  (LOW, MEDIUM, HIGH, URGENT).
- **Task creation:** editors/admins can create tasks with title, description,
  assignee, priority, due date, and optional record row link.
- **Task list:** dedicated Tasks tab with filterable table (by status and
  priority), status badges, and a quick Complete action.
- **API surface:** `createTask`, `getTasks`, `getMyTasks`, `updateTask`,
  `deleteTask` exposed via ApiService.
- Verified with `node --check` and a DOM/onclick audit; deployed @85.

### Phase 4 — Enterprise Features, Tranche E: Dashboard Studio (deployment @88)
- **Dashboard customization:** new `DashboardStudio.js` server module backed by a
  `Preferences` JSON column in the `Users` sheet. Stores per-user view mode
  (cards/table) and table column visibility.
- **Column visibility toggles:** a Customize dialog lets users pick which columns
  are visible in table view (ID, Sector, Description, Entry date, Review date,
  Status, Actions). Preferences persist across sessions.
- **Default view mode:** users can set Cards or Table as their default dashboard
  view; applied on login.
- Verified with `node --check` and a DOM/onclick audit; deployed @88.

### Phase 4 — Enterprise Features, Tranche F: Analytics (deployment @89)
- **Enhanced analytics engine:** new `Analytics.js` server module with
  `buildAnalytics_` computing sector breakdowns, office breakdowns, flagged items,
  monthly trends, and previous-month trend for comparison.
- **Trend indicators:** analytics cards now show a directional trend (up/down/flat)
  comparing current month to previous month.
- **Office breakdown:** new office-level breakdown in the Analytics tab alongside
  the existing sector breakdown.
- Verified with `node --check` and a DOM/onclick audit; deployed @89.

### Phase 4 — Enterprise Features, Tranche G: Reports (deployment @90)
- **Report templates:** predefined report types (Summary, Detailed, Flagged only)
  selectable from the Reports tab. Template selection filters the preview and
  export payloads.
- **Email scheduling:** admins can email a PDF report directly from the Reports
  tab. `emailReport` generates the PDF via `createPdfReport` and sends it via
  `MailApp` with the selected template.
- Verified with `node --check` and a DOM/onclick audit; deployed @90.

### Phase 4 — Enterprise Features, Tranche H: Global Search & Command Palette (deployment @91)
- **Command palette:** Ctrl+K opens a command palette with quick navigation
  (Dashboard, Audit, Reports, Settings, Tasks), actions (Refresh, Add record,
  Toggle theme, Sign out), and live record search (by ID, sector, description).
- **Keyboard shortcuts:** palette actions show shortcuts; commands are filtered
  by role (editor-only actions hidden for viewers).
- Verified with `node --check` and a DOM/onclick audit; deployed @91.

### Phase 4 — Enterprise Features, Tranche I: Document Management (deployment @92)
- **Document attachments:** new `Documents.js` server module backed by a hidden
  `Documents` sheet. Each document stores Drive file ID, name, MIME type, size,
  and uploader metadata.
- **Record-linked uploads:** from the record detail dialog, users can upload
  files (stored privately in Drive) and view a linked list of all documents for
  that record.
- **Delete:** documents can be removed (trashed in Drive and deleted from the
  sheet).
- Verified with `node --check` and a DOM/onclick audit; deployed @92.

### Phase 5 — Security & Accessibility (deployment @93)
- **Security hardening:** new `Security.js` module with input validation helpers
  (`validateEmail`, `validatePassword`, `sanitizeHtml`) and login rate-limiting
  utilities.
- **Accessibility:** skip-to-content link, keyboard-accessible table rows with
  arrow-key navigation and Enter/Space activation, improved ARIA labeling on
  modals and dynamic regions.
- Verified with `node --check` and a DOM/onclick audit; deployed @93.

### Security patch — Password reset hardening
- **Reset tokens hashed:** `requestPasswordReset` now stores a SHA-256 hash of
  the token in the `Users` sheet instead of plaintext. `resetPasswordWithToken`
  hashes the submitted token before comparison.
- **Base URL reliability:** reset links are built server-side using
  `ScriptApp.getService().getUrl()` instead of the client-provided
  `window.location.href`, eliminating broken links from test/old/preview
  deployments.
- **Mail diagnostics:** `MailApp.sendEmail` failures are now logged to the audit
  trail with the full error message.
- **Token cleanup on password change:** `changePassword` and `adminResetPassword`
  now clear any pending `resetToken` / `resetExpires`.

### Phase 6 — AI & meeting intelligence (deployment @162+)
- **AI insights** — dashboard-wide and per-card AI summaries with provider
  selection (Groq free tier default; OpenRouter, Hugging Face Inference,
  Gemini, Kilo Gateway fallbacks), real provider error surfacing, results
  cached in Cloudflare KV (`AI_INSIGHTS_KV`), and linked-file content analysis
  with an inline table preview.
- **AI meeting notes** — admin-only: upload a meeting recording → Groq Whisper
  transcription with segmented retry hardening, AI-generated minutes (summary,
  action items), and one-click task creation. Live browser recording via
  `getDisplayMedia` (tab/screen share with WebAudio mix and fallback chain),
  floating REC indicator, background recording, and Drive saving.
- **Fathom AI notes integration** — pull Fathom meeting notes (summary,
  transcript, action items) into the AI Meeting Notes modal (enabled by default).

### Phase 7 — Performance & UX (git `main`)
- **Batch sheet writes** — record ID re-sequencing and updates use
  `Sheets.Values.batchUpdate` instead of per-cell `setValue`.
- **Optimistic UI** — add/update/delete records, task completion, and review
  status apply instantly to the DOM while the server write runs in the
  background (with rollback on failure), so actions feel non-blocking.
- **Auto-refresh** — dashboard polls `getAppData` every 60 s without disturbing
  the current page or scroll position.
- **Sorting** — homepage sort dropdown (Sector, Entry date, Review date,
  Responsibility) with ascending/descending toggle; date-aware ordering and a
  removable sort chip.
- **Page preservation** — editing/updating a record no longer jumps the user
  back to page 1; the edited card is scrolled back into view after save.
- **Approvals removed** — the Approvals tab and `Workflow.js` server workflow
  were removed to match the UI (see git `745a535`, `57ed495`).
- **Hyperlink display text** — only the link text is hyperlinked, and link text
  round-trips to the editor.

### Phase 8 — Enterprise production wiring
- **PWA + offline action queue** — `docs/` app is a PWA (`manifest.json`,
  `sw.js`) with an offline queue (`docs/offline-queue.js`) that buffers mutating
  calls in localStorage and replays them on reconnect.
- **Cloudflare split-routing Worker** — `worker.js` serves `docs/` statics from
  GitHub Pages (raw CDN) and `/app.html` from the GAS exec URL (banner-stripped),
  with `/macros/*` and `/static/*` forwarded to Google.
- **Review-calendar `.ics` export, WhatsApp review reminders, AI provider**
  enterprise endpoints (`EnterpriseService.gs`), gated by
  `ENTERPRISE_SETTINGS` in `EnterpriseSettings.js` (off by default).
- **Deployment pipeline** — `deploy-all.ps1` runs git commit+push (→ GitHub
  Pages + Worker via `.github/workflows/pages.yml`), `clasp push`, a pinned-GAS
  deployment redeploy, and the Worker deploy in one step.

### Phase 9 — Optimistic tasks, cached counts & security hardening
- **Partial optimistic task updates (Point 5)** — new `updateTaskField` server
  endpoint (field whitelist: status/priority/assignee/dueDate/title/description,
  stable-ID lookup, RowVersion conflict detection returning the latest task,
  status-transition validation, LockService + idempotency-key dedupe, single-row
  writes). Client `completeTaskOptimistic` applies the status instantly,
  disables the row's buttons, rolls back to a DOM snapshot on failure/conflict,
  and refreshes only that row (or a safe full re-render) — never a whole-list
  reload for one update.
- **Cached count endpoints (Point 6)** — new `Counts.js` with
  `dashboard.getCounts` / `tasks.getCounts` / `notifications.getUnreadCount`,
  per-user versioned cache keys (embedding data/task/notif generation counters
  so one bump orphans stale counts), 45 s TTL for fast-moving counts, and
  generation bumps on every task/submission/notification/record mutation. KPI
  tiles + notification badge render from counts and refresh in the background
  (fallback `—` on failure).
- **Security hardening (Point 7)** — PBKDF2-HMAC-SHA256 password hashing (v2,
  10 k iterations, iteration count stored in the hash) with transparent
  upgrade of legacy salted-SHA-256 hashes on login; per-user session epochs
  (password/role/email changes invalidate existing sessions); CacheService
  rate limiting for password reset/change, task updates, submissions,
  admin user ops; rich-text `sanitizeHtml_` allow-lists tags/styles/URL schemes,
  strips `script`/`iframe`/`svg`, event handlers (incl. no-space variants),
  `javascript:`/`data:` links, adds `rel="noopener noreferrer"`; bootstrap
  admin password read from `ADMIN_BOOTSTRAP_PASSWORD` Script Property.
- **Stable IDs & row versioning (Point 8)** — `newEntityId_` generates
  `TASK-YYYYMMDD-XXXXXXXX` style IDs; Tasks/Submissions gained `RowVersion` +
  `UpdatedBy`, Users gained an `Id` column (auto-ensured non-destructively);
  admin-only `adminMigrateStableIds` dry-run/run backfills IDs/RowVersions with
  collision-safe generation (records sheet intentionally untouched).
- **Idempotent offline sync (Point 9)** — `docs/offline-queue.js` rewritten to
  v2 schema: every queued mutation carries a one-time idempotency key,
  PENDING→SYNCING→SUCCESS/CONFLICT/FAILED lifecycle, exponential backoff with
  max retries, sync-status banner (pending/syncing/conflict/failed), legacy v1
  queue migration, and queue clearing on logout. Worker `/api/*` routes gained
  per-IP rate limiting.
- **Follow-ups** — `adminMigrateStableIds` now runs directly from the Apps
  Script editor (falls back to the active user's identity when no token is
  passed); the `Admin@123` literal was removed from `Auth.js` — the bootstrap
  admin password now comes exclusively from the `ADMIN_BOOTSTRAP_PASSWORD`
  Script Property (settable via the admin-gated `setAdminBootstrapPassword`;
  first-run auto-generates, persists, and emails a random one); new
  `tests/sanitizer-idempotency.test.js` (11 tests) covers `sanitizeHtml_` XSS
  cases and `withIdempotency_` replay semantics.
- **Ops runbook** — new `runbooks/bootstrap-password-rotation.md` documents the
  full bootstrap-admin password rotation (self-change vs admin reset, session
  epoch invalidation, optional `ADMIN_BOOTSTRAP_PASSWORD` refresh, and login
  verification); linked from the Admin Guide's First login section.
- **Kill-all-sessions endpoint** — new admin-only `adminKillUserSessions(email,
  token)` bumps a user's session epoch to invalidate every active session
  without changing their password (rate-limited, audited, notifies the target,
  returns `reAuth` when the acting admin targets themselves); wrapped as
  `ApiService.adminKillUserSessions(email)` in both clients and covered by new
  `tests/admin-session-kill.test.js` (6 tests).
- **Sign out everywhere button** — Settings → Users table rows now include a
  "Sign out everywhere" action (confirmed via the shared confirm dialog,
  success toast, `reAuth` re-login flow when self-targeted) wired through the
  table's event delegation in both clients; `tests/admin-session-kill.test.js`
  extended to 10 tests (button presence + colspan in both copies, delegation
  routing, and a behavioral handler test that executes the real handler from
  both clients).

---

## 1.0.0 (early release) — 2026-08-02

### Auth, roles & users
- Optimized login and app-load performance.
- Editors get full edit/delete access (previously admin-only).
- Bootstrap admin (`vcharyanaco@gmail.com`, initial password supplied at
  setup) with forced change on first login.
- Admin user management: add/delete users, reset passwords, assign `VIEWER` /
  `EDITOR` / `ADMIN` roles.
- Password reset by email (30-minute expiry), 5-attempt login lockout (15 minutes),
  6-hour session tokens, salted SHA-256 password hashing (500 iterations).

### Records & review workflow
- "Review due" / "Review done" badges derived from review-date cell backgrounds;
  admins can mark a review as done.
- Added record dedupe of the ID field on dashboard cards.
- Fixes to Excel/PDF export conversion.
- Sidebar backdrop/grid overflow fix in the redesigned shell.

### Submissions
- Viewers can submit updates against records; count shown on each card button.
- 24-hour "new" flash on the submission badge counter; badge uses the blue accent
  with a theme-adaptive flash ring.
- Admin lock/unlock/delete for submissions; admin locks block editor edits.
- Admin "display" toggle shows selected submissions directly on the cards.
- Removed the redundant "My submissions" card button.

### Audit log
- Admin can select and delete audit rows (or all) and clear the entire log.
- Sortable columns; export to CSV; copy to clipboard.
- Dedicated print layout for the audit log (A4 portrait).

### Reports & printing
- Reliable Excel export with an in-memory `.xlsx` fallback that needs no Drive scope.
- Full report preview plus CSV/XLSX/PDF export.
- Dedicated print layout for the report (A4 landscape).

### UI & branding
- Enterprise redesign: new UI shell, design system, and rewritten client
  (`index.html`, `styles.html`, `script.html`).
- Homepage stat cards in a single row with refined typography.
- Official Dak Sewa Jan Sewa logo (PNG with transparency) in the sidebar, splash
  screen, About dialog, and favicon.
- Version 1.0.0 chip and footer branding ("Dashboard Haryana Circle";
  "Designed, developed and maintained by Circle Office, Haryana").
- Removed the obsolete "Application settings" card; settings tab now covers
  password change and user management only.

### Security patch — Password reset hardening
- **Reset tokens hashed:** `requestPasswordReset` now stores a SHA-256 hash of
  the token in the `Users` sheet instead of plaintext. `resetPasswordWithToken`
  hashes the submitted token before comparison.
- **Base URL reliability:** reset links are built server-side using
  `ScriptApp.getService().getUrl()` instead of the client-provided
  `window.location.href`, eliminating broken links from test/old/preview
  deployments.
- **Mail diagnostics:** `MailApp.sendEmail` failures are now logged to the audit
  trail with the full error message.
- **Token cleanup on password change:** `changePassword` and `adminResetPassword`
  now clear any pending `resetToken` / `resetExpires`.

> Duplicate of the section in the phase list above — retained here only in the
> original release notes.

---

## 3.1 — Legacy refresh (previous release)

- Added India Post branding and responsive mobile UI.
- Added dark mode toggle.
- Admin-only editing for `vcharyanaco@gmail.com`.
- Viewer mode for read-only access.
- Added analytics and audit log tabs.
- Added report export to Google Sheets and PDF.
- Added settings page and update persistence.
- Preserved existing dashboard data access and sheet integration.
