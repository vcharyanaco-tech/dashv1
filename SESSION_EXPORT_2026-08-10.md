# Session Export — 2026-08-10

## Goal
Resume point for the India Post Dashboard session of 2026-08-10. Three work
streams, all committed to `origin/main`:

1. **Production outage fix** — every API call crashed with
   `ReferenceError: require is not defined (line 9, file "bump-cache-bust")`.
2. **Refactor** — move dashboard/analytics/audit rendering into the synced
   frontend core (`src/frontend-logic.js`) and reconcile GAS vs PWA drift.
3. **5 UX bugs** — slow submission edit, slow display-on-card toggle,
   Analyze-link/AI panels auto-closing on auto-refresh, new entry shown late,
   and action-field text auto-linkified.

## 1. Production outage: bump-cache-bust.js pushed to GAS (FIXED, live)

### Root cause
The last `deploy-all.ps1` run pushed `bump-cache-bust.js` (a Node-only script
using `require('fs')`) into the **Google Apps Script project** because it was
missing from `.claspignore`. GAS has no `require`, so every API call crashed:

```
ReferenceError: require is not defined (line 9, file "bump-cache-bust")
```

The app received an HTML error page instead of JSON →
`Unexpected token '<', "<!DOCTYPE"... is not valid JSON`.

### Fix applied
- Added to `.claspignore`: `bump-cache-bust.js` and `tests/**`.
- Removed the poisoned file from the GAS project: temporarily moved it out of
  the repo, `clasp push --force` (deletes remote files absent locally), restored
  the file.
- Redeployed the live pinned deployment
  `AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian` →
  **@208**. Commit `7e16e7b`.
- **Deploy rule for the future:** `bump-cache-bust.js` may run locally but must
  NEVER be pushed to GAS — the `.claspignore` entry now prevents this.

### Verified live
- `POST getServerTime` via proxy → `{"result":...}` HTTP 200.
- `POST login` (wrong creds) → clean JSON error (not HTML).
- `dashboardharyana.site/app.html` → HTTP 200, browser test loads the login
  screen with 0 console errors (fresh/cache-busted).
- GAS project files confirmed clean: 26 files, no `bump-cache-bust`.
- Deployments list (3): `AKfycbw_jyy…` @HEAD (legacy, sign-in wall),
  `AKfycbzG5…` @207, `AKfycbxPwIN…` @208 (live, in `wrangler.toml`).

## 2. Refactor: dashboard/analytics/audit rendering into synced frontend core

Moved **34 functions + `dashScroll`** from the after-marker regions of
`script.html` + `docs/app.js` into `src/frontend-logic.js` (the synced core
between the `SYNCED-FRONTEND:BEGIN/END` markers). Both clients are generated
from the core by `node sync-frontend.js`.

- **Dashboard (filters/sort/KPI/cards/pagination):** `applyFilters`,
  `handleSectorFilterChange`, `updateSortControls`, `sortLabel`,
  `handleSortChange`, `toggleSortDir`, `resetFilters`, `updateFilterChips`,
  `removeChip`, `monthlyTrendArray`, `trendPill`, `renderKpiCards`,
  `buildCardHtml`, `emptyStateHtml`, `renderDashboardCards`,
  `ensureDashSentinel_`, `teardownDashScroller_`, `htmlToNode_`,
  `toggleDashboardView`, `setDashSort`, `renderPagination`, `setPage`.
- **Analytics + Audit:** `renderAnalytics`, `auditValue`, `renderAudit`,
  `renderAuditPager`, `setAuditPage`, `auditSelectedRows`,
  `updateAuditSelection`, `toggleAuditSelectAll`, `deleteAuditRows`,
  `clearAuditLog`, `setAuditSort`, `markReviewNotDone`.
- **Drift reconciliation (bonus fixes):**
  - KPI sparkline (only in GAS client) removed — matches the PWA's newer design.
  - "Mark as not done" review dropdown (only in PWA) now synced → GAS gains it.
  - Dead `sparklineSvg` removed from `script.html`.
  - `dashScroll` (declared identically in both clients) moved into the core.
- Commit `de9a527`.

### Validation
- `sync-frontend.js --check` passes (both clients byte-identical to canonical).
- `node --check` passes on both clients (canonical intentionally ends mid-
  `loadApp()` across the END marker — pre-existing by design).
- **43/43 tests pass.**
- No duplicate function definitions; no orphaned section comments; canonical
  EOLs normalized to CRLF.

## 3. Five UX bugs (commit `e8ac196`)

| # | Symptom | Fix |
|---|---------|-----|
| 1 | Update submission slow | **Optimistic edit** — patch text locally + re-render list instantly, then reconcile with the server response. Dropped the redundant `refreshCounts()` second API round trip (edit does not change counts). On failure: `loadSubmissions()` + status message. |
| 2 | Display on card slow | **Optimistic toggle** — flip `displayed` locally, rebuild `appState.displayedSubmissions` for that card from the authoritative response, repaint only the affected card via `paintItem_` (`paintSubmissionCard_`) instead of a full `renderDashboard()`. |
| 3 | Analyze-link / AI panels auto-closing (auto-refresh) | **Panel content cache** — `appState.rowPanelCache` stores loaded panel HTML per row. `restoreExpandedRows_` (table) and new `restoreCardPanels_` (cards, incl. lazy scroll batches via `ensureDashSentinel_`) restore cached content without re-fetching. Cache pruned for deleted rows in `applyAppData`, cleared on toggle-close/collapse/save/delete, and card collapse state is preserved. |
| 4 | New entry shown very late | **Optimistic render** — `optimisticNewItem_` builds a temp item (`row: 'temp-<ts>'`), appends to `appState.items`, jumps to the page containing it, renders immediately, then reconciles with the authoritative `addItem` response; temp removed on failure. |
| 5 | Action-field text shown as a link (blue/underlined) | **No auto-linkify of prose.** Client `renderLinkableText` now only links explicit schemes / `www.` / bare domains without whitespace (the loose `(?:\.[a-z]{2,})(?:\/|$)` clause is gone). Action cells render `${item.actionHtml || escapeHtml(item.action)}` (real rich-text links still work). Server `looksLikeUrl_` (code.js) tightened identically, and `DashboardService.js` skips the heuristic linkify for the action column. |

### Files touched (commit `e8ac196`)
- `src/frontend-logic.js` (synced core; pushed to both clients by
  `node sync-frontend.js`)
- `script.html`, `docs/app.js` (client-only after-marker regions edited in both)
- `code.js`, `DashboardService.js` (server)

### Validation (all green)
- `node sync-frontend.js` + `--check` → both clients in sync.
- `node --check` on both clients' extracted JS.
- **43/43 tests pass** (admin-session-kill 10, crud-api-contract 6,
  optimistic-rollback 8, sanitizer-idempotency 11, worker-cors 8).

## Deployment state (as of export)
- **GAS:** deployments @HEAD (legacy), @207, @208 (live). Worker
  `wrangler.toml` → `AKfycbxPwIN…` (@208).
- **Not yet deployed to GAS/live:** the 5-bug-fix commit `e8ac196` is pushed to
  GitHub only. To go live:
  1. `clasp push --force` (server: `code.js`, `DashboardService.js`).
  2. `clasp deploy -d "<desc>"` and repoint the live deployment, or bump the
     pinned @208 to the new version.
  3. Static bundle: GitHub Pages auto-deploys from `docs/` (bump `?v=` cache
     bust in `docs/app.html`/`docs/sw.js`).
  4. Verify `dashboardharyana.site/app.html` + a `POST getServerTime` smoke test.

## Key facts (unchanged from previous sessions)
- GitHub repo: `https://github.com/vcharyanaco-tech/dashv1.git` (branch `main`).
- Local clone: `C:\Users\admin\dashv1`. Background automation auto-commits +
  pushes the working tree with descriptive messages; expect concurrent commits.
- Apps Script project ID:
  `1QYwVDQGWPL5o64Xrvv9kKfE-AFT2nUuVMlvOc5CTK46qClfTCu3ofWcU`.
- Live site: GitHub Pages `docs/` via `dashboardharyana.site` (Cloudflare Worker
  proxy `dashv1-proxy`).
- Frontend sync: `node sync-frontend.js` (writes the canonical
  `src/frontend-logic.js` between `SYNCED-FRONTEND:BEGIN/END` markers into
  `script.html` and `docs/app.js`); `--check` verifies.
- `.claspignore` now excludes `bump-cache-bust.js` and `tests/**`.
- Tests: `node --test tests/*.test.js` (43 tests).

## Next steps / open items
- **Deploy `e8ac196` live** (GAS push + redeploy pinned deployment, cache-bust
  bump for the static bundle) and verify in the browser.
- Browser regression test for the 5 fixes (optimistic renders, panel
  persistence across a simulated auto-refresh, action text not a link).
- Remaining drift candidates in the after-marker regions: task rendering,
  submissions, settings, reports; `renderReviewReminders` /
  `generateReviewNotifications` (GAS vs PWA notification handling).
