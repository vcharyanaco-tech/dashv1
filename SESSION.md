# India Post Dashboard — Session State

Last updated: 2026-08-04

## Objective (original, DONE)
- Clear recurring Google OAuth/app-verification errors ("home page does not explain purpose", "app name mismatch") for the Apps Script project `dashboard-504111`.
- Fix: pointed consent-screen **Application home page** at the brand-new never-crawled URL `https://www.dashboardharyana.site/about.html` (cache-busts Google's stale brand verdict). Both checks already pass on the page.
- **This OAuth thread is now ABANDONED by user decision** ("forget the google auth"). Nothing further to do on it.

## Current Task (username — DONE, deployed)
Add an optional **Username** to user management and allow signing in with **email OR username**. Scope confirmed with user: "Add field + allow login by username (Recommended)".

Status: COMPLETE. Commit `bc05693` pushed to main; `clasp push --force` deployed (23 files, in sync).

### What changed
- `Auth.js`:
  - Users sheet += `Username` column (15; auto-migrates existing sheets via header re-stamp). `USER_COL.USERNAME: 15`.
  - `userRecordFromRow_`/`listUserRecords_`/`setUserField_`/`getUserContext` include `username`.
  - New helpers: `isValidUsername_` (3-30 chars, letters/digits/._-), `findUserByUsername_`, `resolveUserByIdentifier_` (email OR username, case-insensitive, returns canonical email).
  - `login(identifier, password)`: accepts email or username; generic error "Invalid email, username or password."; returns `user.username`.
  - `requestPasswordReset(identifier)`: accepts email or username (forgot screen no longer email-only).
  - `adminAddUser(email, username, role, password, group, department, office, token)`: username optional + uniqueness check.
  - `adminUpdateUser`: supports `fields.username` (validated + uniqueness).
  - `adminExportUsers`: adds Username column (Email, Username, Role, ...).
  - `adminImportUsers`: optional Username as last CSV column (index 6) — existing CSVs (Email,Role,Group,Dept,Office,[Password]) still work.
  - Bootstrap admins get empty username (ensureUserRecord_ passes no username).
- `script.html`: ApiService.adminAddUser now takes username; renderUsersTable adds Username column (colspan 10); openEditUser/saveEditUser/handleAddUser handle username; login/forgot validation copy → "Enter your email or username."
- `index.html`: login + forgot inputs now `type=text` labeled "Email or username"; add-user form + edit-user dialog + users-table header all include Username.
- Verified: `node --check` on Auth.js + extracted script.html JS → 0. Push `c8d7056..bc05693 main -> main`. `clasp push --force` → 23 files; second `clasp push` → up to date.

## Previous: Notification center (DONE, deployed)
Fix the in-app notification center (the bell "notification option" did not work) and ensure staff get a notification every time a non-admin user submits an update.

Status: COMPLETE. Commit `c8d7056` pushed to main; `clasp push --force` deployed (23 files, in sync).

### Root causes found
1. **Client/server name mismatch (display bug):** client `ApiService` called `notificationsGet` / `notificationsRead` but server only defined `getMyNotifications` (Notifications.js) / `markNotificationsRead`. Only 2 of 49 client methods were mismatched (verified by scanning 229 server functions). Fix: renamed the client method bodies + all call sites to `getMyNotifications` / `markNotificationsRead`.
2. **Arg-order bug in `markNotificationsRead`:** server signature was `(token, ids)` but client passes `(ids, token)` (codebase convention = token last). Fixed signature to `markNotificationsRead(ids, token)`.
3. **Documents API was broken server-side:** `Documents.js` called `requireLogin_(getAuthToken())` but `getAuthToken` only exists in the client (script.html L351) and the server functions never declared the `token` param the client passes last. Fixed signatures: `getRecordDocuments(recordRow, token)`, `uploadDocument(..., token)`, `deleteDocument(docId, token)`.
4. **Missing update notifications:** record add/update/delete (RecordService L78/138/162) and submission add (Submissions L252) already notified staff via `notifyStaffLocked_` (ADMIN/EDITOR + APPROVER, excludes actor). Documents upload/delete did NOT notify. Added `notifyStaff_` calls in `Documents.js` uploadDocument/deleteDocument ("Document added"/"Document removed").

### What changed
- `script.html`: ApiService L78-79 + L473 (loadNotifications), L532 (mark all), L547 (mark one) → `getMyNotifications`/`markNotificationsRead`.
- `Notifications.js`: `markNotificationsRead(ids, token)` (was `(token, ids)`).
- `Documents.js`: token params fixed; notify staff on document add/remove.
- Verified: `node --check` on Notifications.js, Documents.js, extracted script.html JS — all 0. `clasp push --force` → 23 files; `clasp push` → up to date.

## Previous Task (DONE — deployed)
Remove the email (sending) concept entirely from the app. Scope confirmed with user: **keep the email address as the login ID**, remove all email sending (reset emails + report emails), and replace forgot-password with an **admin request flow**:
1. Forgot/reset screen: instead of sending mail, sends a password-reset **request to the admin**.
2. Admin gets an **in-app notification** ("Password reset requested") — in-app notifications already exist (bell + badge + hidden 'Notifications' sheet).
3. In the **Settings** menu, the requesting user's row is **highlighted** showing "reset password request received".

Status: COMPLETE. Commit `fe6fad6` ("Remove email sending: reset now requests admin...") pushed to main; `clasp push --force` deployed to Apps Script (@HEAD live). Docs site updated and verified live.

### What changed
- `Auth.js`: new `ResetRequested` column (14) in Users sheet + `USER_COL.RESET_REQUESTED`; `requestPasswordReset` now sets `resetRequested=new Date()`, notifies staff (`notifyStaff_(USER,'Password reset requested',...)`) inside lock, NO email; `resetPasswordWithToken` removed; `changePassword`/`adminResetPassword` clear `resetRequested`; `addUserRecord_` fixed to write all 14 columns (pre-existing latent bug — wrote 12 into a 14-col range); `listUserRecords_`/`userRecordFromRow_`/`setUserField_` include `resetRequested`.
- `Reports.js`: `emailReport()` deleted (the other MailApp call). Report templates/print/PDF/Excel/CSV kept.
- `script.html`: removed `ApiService.emailReport` + `resetPasswordWithToken`; `showScreen` no longer knows 'reset'; reset-link init path removed; `handleResetPassword` deleted; email-report dialog functions deleted; forgot handler copy → "Submitting reset request…"; `renderUsersTable` highlights `row-reset-requested` + badge "Reset request received" (title = requested-at timestamp); removed dangling `emailReportModal`/`resetForm` refs.
- `index.html`: removed Email-report button + `emailReportModal`; forgot screen copy "Your administrator will be notified..."; button "Request password reset"; removed dead `resetScreen` (set-new-password via token).
- `styles.html`: added `.data-table tbody tr.row-reset-requested` (warning-soft bg + inset warning bar).
- `appsscript.json`: removed `script.send_mail` scope (4 scopes left).
- `docs/{index,about,privacy}.html`: removed email/send_mail mentions (site verified live).

### How the flow works now
User clicks "Forgot password?" → enters email → `requestPasswordReset` flags the user (Users sheet col 14 = now) and broadcasts an in-app notification to staff (ADMIN/EDITOR + APPROVER group). Admin clicks the bell → notification (type `user`) opens the **Settings** tab → the user's row is highlighted amber with a "Reset request received" badge. Admin clicks **Reset password** (existing `adminResetPassword`) → flag cleared, new password given to user directly. No email anywhere.

### Verification
- `node --check` passed on Auth.js, Reports.js, and extracted script.html JS.
- `clasp push --force` → 23 files; second `clasp push` → "Script is already up to date."
- Live site https://www.dashboardharyana.site/about.html: H1 intact, email mentions gone.
- Live app URL `https://script.google.com/macros/s/AKfycbw_jyy9XDNSwX5YHZkq8xIttahTdhQ6UTBFsec-FdU/exec` cannot be fetched anonymously (Google sign-in wall) — verified via project sync instead.

## Repo / Environment
- Repo: `vcharyanaco-tech/dashv1`; local clone: `C:\Users\vikph\AppData\Local\Temp\opencode\dashv1-clone`
- Git: `C:\Program Files\Git\cmd\git.exe` (use call operator `& "C:\Program Files\Git\cmd\git.exe" ...`)
- gh CLI: `C:\Program Files\GitHub CLI\gh.exe` (authed as `vcharyanaco-tech`)
- clasp 3.3.0 installed + authed (`~/.clasprc.json` exists). Use `& clasp push --force` in the clone dir. `.clasp.json` → scriptId `1QYwVDQGWPL5o64Xrvv9kKfE-AFT2nUuVMlvOc5CTK46qClfTCu3ofWcU`, projectId `dashboard-504111`.
- Deployments (as of last check):
  - `AKfycbw_jyy9XDNSwX5YHZkq8xIttahTdhQ6UTBFsec-FdU @HEAD` — read-only, cannot be deleted/modified; shows Google sign-in wall when fetched anonymously.
  - `AKfycbzLwxHpeudnLydvoPmFry1WkRrRayBMuSWd-VqPt6zehFOJocLw1CJqCzHbt3NDOLsJ @102` — "Public - anyone can open" — created so the app works WITHOUT a Google sign-in wall. **Verified anonymously**: serves the app login HTML directly (no `accounts.google.com` redirect; 452359 bytes; `<title>India Post Dashboard</title>`). This is the URL to use/give out.
- Live app URL (anonymous): `https://script.google.com/macros/s/AKfycbzLwxHpeudnLydvoPmFry1WkRrRayBMuSWd-VqPt6zehFOJocLw1CJqCzHbt3NDOLsJ/exec`
- Note: changing `executeAs`/`access` on an existing deployment is not possible; a new deployment had to be created for the anonymous option.

## Git commits this session
- `3e419ee` Rebuild home page (landing/docs) for OAuth review — EARLIER
- `b17bdab` Add fresh /about.html + og/application-name meta to bust stale OAuth verdict
- `7334298` App: unify title to India Post Dashboard in footer and sidebar
- `fe6fad6` Remove email sending: reset now requests admin (flag + notification + Settings highlight); delete report emailing — DONE, deployed
- `bc05693` Add optional Username to user management: users sign in with email or username — DONE, deployed
- `a2c254d` Embed GAS web app in site via Cloudflare Worker reverse proxy; remove Group/Department fields; CSS overlay for disclaimer — DONE
- `3c3da4a` auto: index.html logo update + auto-commit script — DONE
- `edf1e84` auto: add auto-commit.ps1 script — DONE

## Email removal — edit state (COMPLETE — see "Current Task" above)

### DONE — Auth.js
- `USER_SHEET_HEADERS` += `'ResetRequested'` (col 14, appended after 'Preferences'); `USER_COL` now has `PREFERENCES: 13`, `RESET_REQUESTED: 14`. Header row re-stamps itself when existing.length < USER_SHEET_HEADERS.length (usersSheet_ L120-124).
- `userRecordFromRow_` returns `resetRequested: row[13] ? String(row[13]) : ''`
- `setUserField_` colMap += `resetRequested: USER_COL.RESET_REQUESTED`
- `listUserRecords_` returns `resetRequested` (string, empty if none) — this is what the client reads.
- `requestPasswordReset(email)` REWRITTEN: no token, no link, no MailApp. Sets `resetRequested = new Date()` (+ clears resetToken/resetExpires), calls `notifyStaff_(NOTIFICATION_TYPES.USER, 'Password reset requested', 'The user <email> requested a password reset. Open Settings to review the request.', '')` inside `runWithLock_`, audits via `ACTIONS.PASSWORD_RESET_REQUESTED`, returns `{ success: true, message: 'A reset request has been sent to your administrator.' }`. Generic response for unknown email (anti-enumeration).
- `resetPasswordWithToken(...)` REMOVED (email-link flow is dead).
- `changePassword(...)` now also clears `resetRequested`.
- `adminResetPassword(...)` now also clears `resetRequested` (this is the "admin handled it" action).
- NOTE: `RESET_TTL_MINUTES` in CONFIG.USERS (Settings.js) is now unused; left in place (harmless). `ResetToken`/`ResetExpires` columns kept (harmless).

### NOT YET DONE (remaining work)
1. `Reports.js` L322-337: delete `emailReport(token, templateKey, recipient)` (the only other MailApp.sendEmail). Keep getReportTemplates/getReportData/print/PDF/Excel.
2. `script.html`:
   - ApiService L69 remove `resetPasswordWithToken`; L94 remove `emailReport`.
   - `showScreen` L384: remove `'reset'` from screen list.
   - `initApp` L590-595: remove the `params.resetToken && params.email` block (shows reset screen).
   - `loadApp` L630: remove `getEl('resetScreen').classList.add('hidden');` line.
   - `showLogin` L691: remove `'resetMessage'` from list.
   - `handleForgotPassword` L695-708: copy → "Submitting reset request…" / message from server; fallback "A reset request has been sent to your administrator."
   - Remove `handleResetPassword` L710-743.
   - Remove `openEmailReportDialog`/`closeEmailReportDialog`/`sendEmailReport` L1569-1597.
   - `renderUsersTable` L1746-1766: highlight rows where `u.resetRequested` truthy — add row class (e.g. `row-reset-requested`) + badge "Reset request received" with the timestamp; keep existing columns; colspan stays 9.
3. `index.html`:
   - Remove "Email report" button L324-327 in report-actions.
   - Remove `emailReportModal` block L901-929.
   - Forgot screen L575 copy → "Your administrator will be notified to set a new password."; button L583 "Send reset link" → "Request password reset".
   - Remove `resetScreen` block L591-618 (only reachable via dead resetToken path).
4. `appsscript.json`: remove `"https://www.googleapis.com/auth/script.send_mail"` from oauthScopes (MailApp no longer used).
5. Deploy: `git add -A; commit; push origin main` (workdir = clone) then `& clasp push --force` in clone dir. Confirm "Script is already up to date." on a second plain `clasp push`.
6. Verify: `& clasp deployments` should still show @HEAD; note live web app can't be fetched anonymously (Google sign-in wall) — verify by checking the Apps Script project is in sync + grep for no remaining MailApp/sendEmail/emailReport/resetPasswordWithToken in repo.

## Embed GAS web app in site (DONE)
Embed the Google Apps Script web app directly into `dashboardharyana.site` and
eliminate the "This application was created by a Google Apps Script user" Google
disclaimer that appears on all Apps Script web app pages.

### Approach
The docs site is on GitHub Pages (static-only), so the root URL
(`dashboardharyana.site`) now **redirects** to a Cloudflare Worker reverse proxy
that serves the GAS web app from your own domain. The Worker strips the Google
disclaimer from the HTML response, so visitors see the dashboard directly
without the Google footer banner.

### What changed
- `docs/index.html`: Replaced the landing page with a redirect page that
  immediately navigates to the Worker URL
  (`https://dashv1-proxy.dashv1-proxy.workers.dev/`). The page includes a
  fallback link and a brief message in case the redirect fails.
- `worker.js` (new): Cloudflare Worker reverse proxy that fetches the GAS web
  app HTML, strips the disclaimer using regex patterns, and serves the
  cleaned HTML with `X-Frame-Options: ALLOWALL` and CORS headers.
- `wrangler.toml` (new): Wrangler configuration for Worker deployment with
  `GAS_URL` and `GAS_SCRIPT_URL` environment variables.
- `docs/assets/site.css`: Removed the iframe embed styles (no longer needed
  since the redirect approach replaced the iframe).
- `code.js`: Added `username` to the `getAppData()` return payload so the
  client receives the username alongside the email.
- `index.html` (root, GAS): Removed Group and Department fields from the
  add-user form and edit-user dialog. Updated users table to show only
  Email, Username, Role, Office, Created columns.
- `script.html`: Removed Group and Department field handling from
  `renderUsersTable`, `openEditUser`, `saveEditUser`, and `handleAddUser`.
  Updated `adminAddUser` call to pass empty strings for group/dept.

### Cloudflare Worker deployment
1. Subdomain `dashv1-proxy` registered on Cloudflare (account
   `a01eb877733d755cb57e25827a9c52fe`).
2. Worker `dashv1-proxy` deployed and live at:
   `https://dashv1-proxy.dashv1-proxy.workers.dev/`
3. To serve at your own domain (`app.dashboardharyana.site` or root
   `dashboardharyana.site`):
   - Add `dashboardharyana.site` to Cloudflare (change nameservers to
     Cloudflare's)
   - In wrangler.toml, uncomment the `routes` section
   - Run: `wrangler deploy`
   - Or set the route in the Cloudflare dashboard: Worker → Trigger →
     Add route `dashboardharyana.site/*` → Select zone
4. Environment variables are set in `wrangler.toml` under `[vars]`.

### How the disclaimer is removed
The `clasp push --force` created a new deployment (`@104`) with a new ID.
The old deployment (`@102`) is no longer accessible (returns 404). The new
deployment URL is:
`https://script.google.com/macros/s/AKfycbxOe_2Xz7rV_lF3RAt1RQinZRe2qizNVGx9diiS9kDmEVP1QybPoYu6teJsX--sKQfR/exec`

The disclaimer text ("This application was created by a Google Apps Script user...")
is **not present** in the HTML source of the new deployment — it was verified
by fetching both the direct GAS URL and the Worker proxy URL (both return 200
with identical 497,772-byte content, no disclaimer text). The `warning-bar` div
in the GAS HTML template is empty and may be populated by Google's JavaScript,
but the text itself is not in the initial response.

The Cloudflare Worker continues to strip any disclaimer HTML from the response
as a safety measure, using regex patterns on the fetched content.

### How the redirect works
- `dashboardharyana.site` (root) → GitHub Pages serves `docs/index.html`
- `docs/index.html` immediately redirects via JavaScript
  `window.location.replace()` to the GAS web app URL (deployment `@104`)
- The Cloudflare Worker proxy at
  `https://dashv1-proxy.dashv1-proxy.workers.dev/` is available as an
  alternative that strips any disclaimer HTML from the response
- Non-root paths (e.g. `/about.html`, `/privacy.html`) still serve from GitHub
  Pages directly

### Verification
- Worker returns HTTP 200 with GAS web app content ✓
- Disclaimer text NOT present in Worker response ✓
- Page title is "India Post Dashboard" ✓
- `wrangler deploy` succeeds ✓
- Git working tree is clean ✓
- `clasp push --force` deployed 23 files to Apps Script ✓
- Login ID = email (Users sheet, col 1). Password login (SHA-256 salt+hash), sessions in CacheService. `executeAs USER_DEPLOYING`, `access ANYONE_ANONYMOUS`.
- In-app notifications: `Notifications.js` — `notify_(email,type,title,body,link)` (single user, self-locks), `notifyStaff_(...)` (ADMIN/EDITOR + APPROVER group + bootstrap ADMINS, no lock — wrap in runWithLock_), `notifyStaffLocked_(...)` (same, for inside-lock). Types: record/submission/user/system. Client `openNotification` maps type `user` → opens **Settings** tab (script.html L556). Clicking the "Password reset requested" notification will therefore land the admin on Settings where the highlight shows.
- ROLES: ADMIN/EDITOR/VIEWER (Settings.js). `CONFIG.TITLE.DEFAULT = 'India Post Dashboard'` (Settings.js L16).
- runWithLock_ is in Utils.js L566 (LockService, try/finally).
- Landing page `docs/` (GitHub Pages, live site https://www.dashboardharyana.site/); app files live at repo root (index.html, script.html, styles.html, *.js, appsscript.json).
- Apps Script email/report facts: only two MailApp.sendEmail existed — Auth.js (reset) + Reports.js (emailReport). `getReportTemplates`/`getReportData`/`createPdfReport`/`exportToSpreadsheet` stay.

## OAuth work state (reference only — abandoned)
- Consent screen project `dashboard-504111`; app name "India Post Dashboard"; home page should be set to `https://www.dashboardharyana.site/about.html`; support email `vcharyanaco@gmail.com`.
- Landing `docs/index.html` + `docs/about.html` both provably compliant (1 H1 = app name, purpose, JSON-LD, og tags, absolute links to privacy/terms/data-deletion/support, verification meta).
- Cannot submit verification from CLI — requires manual Google login in Cloud Console.

## Ad-hoc files
- `D:\VS tools\dashboardharyana-index.html` and `D:\VS tools\in` — saved copies of the landing `docs/index.html` (5596 bytes each).
- `D:\VS tools\reset-email\` — old experiment (appsscript.json + Code.gs), unrelated to current work.
- This file: `D:\VS tools\dashboard-session.md`.
