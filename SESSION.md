# India Post Dashboard — Session State

Last updated: 2026-08-06 17:45:00

## Current Task (split-routing Worker: / → GitHub Pages, /app.html → GAS — DONE, deployed)
Worker (`dashv1-proxy`) rewritten to split traffic on `dashboardharyana.site`:
- `/app.html` → fetches from GAS exec URL, strips disclaimer banner via `processHtml`
- `/*` (everything else) → fetches from `raw.githubusercontent.com/vcharyanaco-tech/dashv1/main/docs/` (GitHub Pages static bundle); correct Content-Type set per extension; 404 fallback serves `index.html`
- `/static/*`, `/macros/*` → forwarded to `script.google.com` (GAS sandbox sub-resources)

Why raw CDN instead of github.io: `vcharyanaco-tech.github.io/dashv1/*` 301-redirects to the custom domain → Cloudflare → Worker → infinite loop. Raw CDN has no redirect.

Previous conflicting routes (`dashboard-redirect` Worker owning `dashboardharyana.site/*` and `www.dashboardharyana.site/app*`) were deleted via Cloudflare API before deploying.

### Verified live
- `dashboardharyana.site/` → 200, `<!DOCTYPE html>` GitHub Pages landing (no GAS wrapper)
- `dashboardharyana.site/assets/styles.css` → 200, `text/css`, 55KB
- `dashboardharyana.site/app.html` → 200, GAS sandbox with `gas-disclaimer-killer` injected, no "created by" banner text
- Worker version: `5d0ad545-8c4a-4af8-9946-45e8413bfd1a`

## Current Task (fix broken redirect — serve UI directly from GAS — DONE, deployed @138)
Root cause: `dashboardharyana.site` apex is still routed by Cloudflare to GAS (DNS change was never made). The `doGet` redirect to `https://dashboardharyana.site/app.html` looped back to GAS, which returned 404 on `/app.html`. Similarly `vcharyanaco-tech.github.io/dashv1/app.html` returned 404 because GitHub Pages redirects all paths to the CNAME, which Cloudflare forwards back to GAS.

Fix: abandoned the redirect approach entirely. Restored GAS template directives in `index.html` and updated `doGet` to serve the template directly via `createTemplateFromFile('index').evaluate()`. CSS/JS are inlined server-side via `include()` so no external asset requests are needed. The GAS outer sandbox wrapper (`chromevox` meta) is unavoidable for all HtmlService responses, but the "created by Google Apps Script user" disclaimer banner text is not present in the response. Deployed @138, redeployed the anonymous-access deployment to @138.

### What changed (this session)
- `index.html`: restored `<?!= include('styles'); ?>` and `<?!= include('script'); ?>` directives (replacing the broken `assets/styles.css?v=...` / `app.js?v=...` external references). Now GAS-template-renderable again.
- `code.js`:
  - Removed `FRONTEND_URL` constant and JS-redirect approach.
  - `doGet(e)` now uses `HtmlService.createTemplateFromFile('index').evaluate().setXFrameOptionsMode(ALLOWALL).setTitle(APP.NAME)` — serves the full app HTML with inlined CSS+JS, no external requests.

### Deploy
- `clasp push --force` → 22 files pushed.
- `clasp deploy -d "fix: serve UI directly from GAS template..."` → **@138**.
- `clasp redeploy AKfycbykqb0... -V 138` → anonymous-access deployment now @138.

### Verification
- Live GAS exec URL returns 200 with full dashboard HTML (including `wireEmbeddedLinkPreview`, `initApp`, all CSS/JS inlined in the iframe src).
- No "created by a Google Apps Script user" banner text in the response.
- `warning-bar` div is present but empty (no disclaimer injected).

### DNS note (still required for dashboardharyana.site to serve from GitHub Pages)
Cloudflare still routes apex → GAS. The app now works via the GAS direct URL and the Worker proxy. To make `dashboardharyana.site/` serve GitHub Pages static bundle instead, you must: point apex A records to GitHub Pages IPs (185.199.108-111.153) and remove the Cloudflare redirect rule to GAS. Until then, the Worker proxy and direct GAS URL remain the live entry points.

## Current Task (remove "created by Google Apps Script" banner — DONE, pending DNS)
Goal: eliminate the Google-injected "This application was created by a Google Apps Script user" banner on `dashboardharyana.site`. The banner is injected by GAS **only when it serves the web-app HTML**; JSON API responses are clean. Solution: serve the frontend from **GitHub Pages** and use GAS purely as the JSON backend (`doPost`); the GAS web-app URL now redirects to the Pages frontend.

### What changed
- `index.html`: removed GAS template directives `<?!= include('styles'); ?>` / `<?!= include('script'); ?>`; now a standalone static page linking `assets/styles.css?v=<APP_BUILD>` and `app.js?v=<APP_BUILD>`. No longer GAS-renderable (served by Pages).
- `docs/app.html`: regenerated from `index.html` — the GitHub Pages entry, served at `https://dashboardharyana.site/app.html`.
- `script.html` / `docs/app.js`: client API layer calls GAS via `fetch()` to `ApiService.API_URL` (the `doPost` endpoint) instead of `google.script.run` (added earlier). No UI change.
- `code.js`:
  - `doPost(e)` accepts `{function, args}` JSON, resolves the named global fn, returns JSON — this is the backend API.
  - `doGet(e)` now **redirects** to `FRONTEND_URL` (`https://dashboardharyana.site/app.html`) via `window.location.replace`; the `?inspect=1` debug endpoint is preserved. GAS no longer renders the UI, so the banner never appears.
  - `FRONTEND_URL` constant added.
- `docs/CNAME`: changed `www.dashboardharyana.site` → `dashboardharyana.site` (apex is the canonical live host).
- `code.js` email link updated to `https://dashboardharyana.site/app.html`.

### Why redirect to the custom domain (not github.io)
GitHub Pages 301-redirects `https://vcharyanaco-tech.github.io/dashv1/app.html` → the custom domain. If `doGet` pointed at the github.io URL while Cloudflare still forwarded the domain to GAS it formed an infinite loop (GAS→github.io→custom domain→Cloudflare→GAS). Pointing `doGet` directly at `dashboardharyana.site/app.html` removes that hop, so once Cloudflare serves GitHub Pages there is no loop.

### Deploy steps
1. `git` commit + push (GitHub Pages rebuilds from `docs/`). Commits `ac31c4c` (standalone index.html + doGet redirect) and `febda31` (apex CNAME + FRONTEND_URL → dashboardharyana.site/app.html).
2. `clasp push --force` (deploys `doGet`/`doPost` to @HEAD).
3. **User action (Cloudflare/DNS — outside repo):** point `dashboardharyana.site` (apex) at GitHub Pages (A/AAAA to GitHub Pages IPs, or CNAME-flatten `vcharyanaco-tech.github.io`), and **remove the old redirect rule that sent the domain to the GAS web app**. Until this is done the apex still resolves to GAS; after it, `dashboardharyana.site/app.html` serves the banner-free Pages frontend.

### Verification
- `https://vcharyanaco-tech.github.io/dashv1/app.html` serves the full app with NO banner (static HTML).
- Backend `doPost` returns `200 {"result":<ts>}` — app works end-to-end.
- `dashboardharyana.site/app.html` goes live once DNS/Cloudflare points the apex at GitHub Pages.

## Current Task (date picker + live clock + cache-busting - DONE, deployed @118)
Date fields across the dashboard now open a mini month calendar instead of manual typing (uniform `dd.mm.yyyy`), and the topbar shows a live 12-hour clock with seconds + AM/PM beside the search panel, synced to server time. **Cache-busting added**: `docs/app.html` references `app.js`/`assets/styles.css` with `?v=<APP_BUILD>` so Cloudflare's 4h asset cache (`max-age=14400`) can never serve stale JS/CSS on `dashboardharyana.site`/`www`; a `no-cache, no-store` meta was added to the page head. `app.html` itself is `cf-cache-status: DYNAMIC` (never CF-cached).

### What changed
- `index.html` / `docs/app.html`:
  - Topbar: `<div class="live-clock" id="liveClock">` added beside the search panel (hidden on mobile ≤760px).
  - `editEntryDate` / `editReviewDate` and `taskDueDate` now have `data-datepicker`; their `.field` wrappers got `date-field` (position:relative anchor). `taskDueDate` switched `type=date` → `type=text` + `placeholder="dd.mm.yyyy"`.
  - `docs/app.html` asset URLs are versioned (`assets/styles.css?v=<APP_BUILD>`, `app.js?v=<APP_BUILD>`) — generated by the sync script; `index.html` keeps the GAS `include()` directives (GAS pages are never cached).
- `script.html` / `app.js` / `docs/app.js`:
  - Date picker: `parseDateFieldValue` (validates, rejects rollover like 31.02), `formatDmy`, `dmyToIso`, `ensureDatePickerPopup`, `renderDatePicker`, `openDatePicker` (opens above when near card bottom), `closeDatePicker`, `initDatePicker`. Monday-start month grid, Today/Clear footer buttons.
  - Live clock: `startLiveClock` (1s tick, server-offset via `ApiService.getServerTime`), `renderClock` (12h + AM/PM).
  - `saveTask` sends `dueDate` via `dmyToIso` (server does `new Date()` — dd.mm.yyyy would be Invalid Date).
  - `APP_BUILD` bumped to `2026.08.05` (used as the cache-bust token).
- `styles.html` / `docs/assets/styles.css`: `.live-clock`, `.datepicker-popup`, `.dp-*` styles; `.live-clock` hidden in the 760px media query.
- `code.js`: added `getServerTime()` returning `Date.now()`.

### Deploy steps
1. `auto-commit.ps1 "feat: date picker for date fields + live clock in topbar"` → `ed429f4`; then `f7a6364` (cache-busting).
2. `clasp push --force`; `clasp version` → **@117**, then **@118** (cache-bust + APP_BUILD bump).
3. `clasp redeploy <@110-id> -V <n>` AND `clasp redeploy <@108-id> -V <n>` (both deployment URLs now serve current version).
4. Verified live on `dashboardharyana.site/app.html` (user's test URL): versioned URLs present, `app.js?v=2026.08.05` + `styles.css?v=2026.08.05` served fresh (`cf-cache-status: MISS`), GAS @118 has all markers.

### Important: keeping dashboardharyana.site "always live"
Cloudflare caches `app.js`/`assets/styles.css` for **4h** (`max-age=14400`) — plain-URL deploys can look dead for hours (this caused the "clock/calendar not showing" report). Fixes already in place: versioned asset URLs (new `?v=` each deploy) + no-cache meta. Rule for future deploys: **after every edit, run the sync script, commit/push (Pages auto-deploys), and verify `dashboardharyana.site/app.html` shows the new `?v=` token with `cf-cache-status: MISS` on the assets.** GAS pages are never cached; keep them redeployed to the same version.

### Note on routing
`www.dashboardharyana.site` resolves to Cloudflare IPs (104.21.x/172.67.x) and has a redirect rule → GAS @108 (NOT GitHub Pages). The OAuth token only has `zone:read` (no rules write). Keeping it working = redeploy @108 to current version (done). GitHub Pages `docs/` is still the canonical static bundle for the `vcharyanaco-tech.github.io/dashv1/app.html` CDN path. `docs/app.html` was STALE at HEAD (missing the notifications "Clear all" button); it is regenerated from `index.html` on sync.

## NEXT PHASE (user request)
Audit the whole project and minimize: remove dead code, trim unused CSS/JS, speed up loading and task execution.

## Current Task (edit user: email + role — DONE, deployed @108)
The "Edit" option in user management should allow admins to edit the full user details: email, username, role and office.

### What changed
- `index.html` (Edit user dialog): email input is now visible (`type=email`, label "Email (login ID)", with `.field-error`), and a new **Role** dropdown (`#editUserRole`: VIEWER/EDITOR/ADMIN) was added. Form got `id="editUserForm"`. Fields now: Email, Username, Role, Office.
- `script.html`:
  - `openEditUser` fills `editUserRole`.
  - `saveEditUser` sends `{ email, username, role, office }` and handles the new response shape `{ users, reAuth, message }` (was a bare array). On `reAuth` (admin changed their own email) it clears the token, stores `STORAGE_REAUTH_MSG` in sessionStorage, and reloads; `initApp` surfaces the message on the login screen.
  - New constant `STORAGE_REAUTH_MSG = 'indiaPostReauthMsg'`; `editUserForm` added to `wireFieldClearing` list.
- `Auth.js`:
  - `adminUpdateUser(email, fields, token)` now accepts `fields.email` and `fields.role` and returns `{ users, reAuth, message }`.
  - **Email change**: validated (`isValidEmail_`, uniqueness, case-insensitive), blocked for the bootstrap admin (`isBootstrapAdmin_`), propagates via new `renameUserEmail_` to Submissions (submitter + LockedBy), Tasks (Assignee + CreatedBy), Notifications (Email), Approvals (SubmittedBy + ReviewedBy) and Users.createdBy. Audit Log is intentionally left unchanged (history integrity). The user is notified at the new email; if the admin edited their own email, their session is destroyed and `reAuth: true` is returned.
  - **Role change**: validated (VIEWER/EDITOR/ADMIN), blocked for the bootstrap admin, blocked for self-demotion, and the last admin cannot be demoted. Notifies the user of the role change.
  - New helper `renameUserEmail_(oldEmail, newEmail)`.

### Protections (email/role are NOT a free-for-all)
- Bootstrap admin (`vcharyanaco@gmail.com`) email + role are immutable.
- An admin cannot change their own role, and editing their own email forces a re-login.
- Cannot demote the last remaining admin.

### Deploy steps
1. `clasp push --force` → 23 files; `clasp deploy -d "user management edit: email + role changes"` → **@107**, then a second deploy with the email-change notification → **@108**.
2. `wrangler.toml` `GAS_URL`/`GAS_SCRIPT_URL` → @108; `wrangler deploy` (version `c9a38777-1b7d-4534-b1ab-a5e391c7f5e1`).
3. Verified live: @108 direct AND Worker proxy both contain `editUserRole`, visible `editUserEmail`, `STORAGE_REAUTH_MSG` (4×), `saveEditUser`.

## Concurrent change (NOT mine — committed by background automation)
- `worker.js` was modified externally (15:15) into a CSP-safe rewrite: removed `<base>` tag injection (Google's `base-uri 'self'` CSP blocked it), rewrites relative `/static/…` URLs to absolute `https://script.google.com/…`, and applies the page nonce to injected disclaimer-killer `<style>`/`<script>`. Committed as `285f73e` and deployed alongside my worker deploys. Verified live: `gas-disclaimer-killer` present, warden script URL absolute, no leftover relative url attrs.

## Live URLs (current)
- **@108 (live, anonymous, no sign-in wall):** `https://script.google.com/macros/s/AKfycbwcQCOKpHeQIHYC6Hwp1VMQQp9xfVBrQXrK5YVAV-6hzYLZ71n0LwNuGH6c4X_7WqkK/exec`
- **Worker proxy:** `https://dashv1-proxy.dashv1-proxy.workers.dev/` (proxies @108; strips Google disclaimer; app.dashboardharyana.site redirects here)
- Still exist: `@107` (`AKfycbyjnKstQvolXS9EWLThOId7XyNL6svkk365wXkyXBL2eGNal8NuifbL7fpxf8IsH5ZI`), `@106` (`AKfycbzTQEL6w2CbVdQyLMc6JJ7YjgV8M-nml28VY_5374cCDsGFq42MUaGwdUVoGq94krqT`), `@105` (hyperlink fix), `@104`, `@HEAD` (sign-in wall when fetched anonymously).
- Deleted: `@102` (old anonymous URL → 404).

## Repo / Environment
- Repo: `vcharyanaco-tech/dashv1`; local clone: `C:\Users\admin\dashv1` (this machine). Branch `main`.
- **Background automation**: a separate process auto-commits + pushes the working tree with descriptive messages (also updated `auto-commit.ps1` and SESSION.md). Working tree is kept clean; expect concurrent commits.
- clasp 3.3.0 authed. `.clasp.json` → scriptId `1QYwVDQGWPL5o64Xrvv9kKfE-AFT2nUuVMlvOc5CTK46qClfTCu3ofWcU`, projectId `dashboard-504111`, 23 files.
- Cloudflare Worker `dashv1-proxy`: account `a01eb877733d755cb57e25827a9c52fe`, vars in `wrangler.toml` `[vars]`.

## Deploy procedure (for next time)
1. Edit code → `clasp push --force` (updates @HEAD only).
2. `clasp deploy -d "<desc>"` → creates a new pinned deployment (GAS_URL pinned to an ID, NOT @HEAD).
3. Update `wrangler.toml` `GAS_URL`/`GAS_SCRIPT_URL` to the new ID.
4. `wrangler deploy` (Worker startup ~12s; pushes new vars + current worker.js).
5. Verify: `Invoke-WebRequest` the GAS exec URL + Worker URL; check for feature markers; note GAS escapes base64 (`\/`, `&#43;`) and that new worker deploys may take a few seconds to propagate (first fetch can still show the old deployment).
6. Commit + push (background automation usually does this).

## Key architecture facts (unchanged)
- Login ID = email (Users sheet col 1) OR username (col 15); SHA-256 salt+hash; sessions in CacheService; `executeAs USER_DEPLOYING`, `access ANYONE_ANONYMOUS`.
- ROLES: ADMIN/EDITOR/VIEWER. `runWithLock_` Utils.js:566 (WAIT_TIME 30000). `ADMIN_USERS = ['vcharyanaco@gmail.com']`.
- Users sheet: 15 cols, `USER_COL.USERNAME=15`. Email is the primary key referenced by Submissions(4/8), Tasks(6/10), Notifications(2), Approvals(7/10), Audit(2).
- Notifications: `notifyStaff_(type,title,body,link[,excludeEmail])` / `notifyStaffLocked_` / `appendNotification_`; hidden Notifications sheet; badge via `loadNotifications(true)` at app start — no polling.
- Docs site on GitHub Pages redirects root → Worker proxy. OAuth/app-verification thread ABANDONED by user decision.

## Recent commits (git log)
- `7b605f3` docs: note cache-busting rule for always-live dashboardharyana.site
- `f7a6364` fix: cache-bust assets on docs bundle (versioned URLs) + no-cache meta
- `ed429f4` feat: date picker for date fields + live clock in topbar
- `0f4818f` fix: total records trend showed -NaN this month (analytics.trend is an array, not a map)
- `9bb48dd` fix: unify logo - login mark on docs/app.html, dashboard logo on landing/compliance pages, splash/about downscaled to 96x62
- `726e419` docs: drop references to removed bindSpreadsheet_/getSpreadsheetBindingInfo/success_/failure_ and deleted Security.js
- `8fee71b` refactor: remove dead server code, dedupe logo images, merge client edit-user flow, trim dead CSS
- `97608c7` docs: log print feature deployment @113 + next-phase plan
- `982152e` feat: per-card print and report print with/without submissions
- `6c2b402` test: verify auto-commit works cleanly end-to-end
- `57c94f1` chore: fix auto-commit.ps1 amend noise; update SESSION.md
- `6d2ec82` fix: add page nonce to warden external script tag so it passes strict-dynamic CSP
- `772e031` session: update SESSION.md; commit remaining modified files (Auth.js, index.html, script.html) — includes the edit-user feature
- `285f73e` fix: remove base tag injection; rewrite relative URLs to absolute + page nonce for CSP — DONE, deployed
- `14b2da8` fix: match login screen logo to dashboard homepage banner; repoint worker to @106 — DONE, deployed
- `a5c03c5` fix: preserve hyperlinks when editing records (RichTextValue plain-text compare) — DONE, deployed @105
- `a2c254d` Embed GAS web app via Cloudflare Worker proxy; remove Group/Department fields — DONE
- `bc05693` Add optional Username: email-or-username sign-in — DONE, deployed
- `fe6fad6` Remove email sending; reset → admin request (flag + notification + Settings highlight) — DONE, deployed
- `c8d7056` Notification center fix (name/arg-order/Documents token bugs) — DONE, deployed

## Ad-hoc files
- Scratch copies of live HTML in `%TEMP%\opencode\` (`gas106.html`, `worker_response.html`, `script_extracted.js`).
