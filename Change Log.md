# Change Log

## 1.0.0 — 2026-08-02 (current)

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
  (`CONFIG.CACHE.TTL`, 300 s), so page loads, refreshes, and report/summary
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

Major refresh and stabilization of the India Post Dashboard for Circle Office, Haryana.

### Auth, roles & users
- Optimized login and app-load performance.
- Editors get full edit/delete access (previously admin-only).
- Bootstrap admin (`vcharyanaco@gmail.com`, initial password `Admin@123`) with forced
  change on first login.
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
