# India Post Dashboard — Session State

Last updated: 2026-08-04 15:43:59

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
