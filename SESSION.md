# India Post Dashboard — Session State

Last updated: 2026-08-04 15:33:57

## Current Task (auto-commit + session-save automation — IN PROGRESS)
Set up automatic git commit + push to GitHub and SESSION.md save after every task.

## Previous Task (CSP fix — DONE, deployed 2026-08-04)
Fixed Cloudflare Worker CSP violation: `base-uri 'self'` blocked the `<base>` tag.

### What changed
- `worker.js`: removed `<base>` tag injection; now rewrites all relative `/static/…` URLs
  to absolute `https://script.google.com/…`; extracts page nonce and applies it to injected
  `<style>` and `<script>` so they pass Google's strict-dynamic nonce-based CSP.
- `wrangler.toml`: no change (still pointing at @106).
- Deployed as Worker version `f5f62d85`. Committed as `285f73e`.

## Previous Task (login logo + deploy — DONE, deployed @106)

### What was found
- `index.html` had 5 PNG data-URIs: favicon (line ~10, 96x62), splash (line ~23, 192x125), sidebar banner (line ~38, 512x332 — the "dashboard homepage" logo), login (line ~540, 192x125), about (line ~679, 192x125).
- The login screen was using the small 192x125 mark instead of the 512x332 homepage banner.
- **Pre-existing corruption on line 541:** a botched earlier edit left `</div>nQU1BAAC...` (a partial base64 tail + a literal backtick-n + a stray closing `</div>` and a split `bg=\x22f`) inside the login `auth-brand` div. Removed; the login block now closes cleanly.

### What changed
- `index.html`: login `<img>` now uses the SAME 512x332 data URI as the sidebar banner (line ~38); removed the corrupted leftover on line 541. Div balance verified (remaining "errors" are SVG-only false positives). `git diff` shows only the one img line + the garbage line changed.
- `wrangler.toml`: `GAS_URL` / `GAS_SCRIPT_URL` repointed to new deployment **@106**.

### Deploy steps performed
1. `clasp push --force` → 23 files pushed to Apps Script @HEAD.
2. `clasp deploy -d "login logo fix + clean corrupted login markup"` → created **@106** (`AKfycbzTQEL6w2CbVdQyLMc6JJ7YjgV8M-nml28VY_5374cCDsGFq42MUaGwdUVoGq94krqT`).
3. Updated `wrangler.toml` vars to @106; `wrangler deploy` → Worker `dashv1-proxy` live (`https://dashv1-proxy.dashv1-proxy.workers.dev/`, version `ff44cc92-5393-4930-ac79-56d768b434fa`).
4. Verified live: both @106 direct and the Worker proxy serve 2× the 512x332 banner (sidebar + login) and the small marks only where expected (splash/about). Note: GAS escapes base64 in the served HTML (`\/` for `/`, `&#43;` for `+`), so verify by unescaping + comparing base64 prefixes rather than a plain regex.

### Status: COMPLETE — deployed @106 + Worker, commit + push pending in this session.

## Verifications (tasks 2–3 already complete in committed + deployed code)
- **Username feature (email OR username login):** already implemented + deployed. `Auth.js` (`USER_SHEET_HEADERS` += `Username` col 15, `USER_COL.USERNAME:15`, `findUserByUsername_`, `resolveUserByIdentifier_`, `setUserField_` username), `code.js` `getAppData` returns `username`, client `renderProfile()` (script.html:445) renders it. Commit `bc05693`. No code change needed.
- **Password reset → admin notification:** already implemented + deployed. `requestPasswordReset` (Auth.js:668) sets `resetRequested = now` + calls `notifyStaff_(NOTIFICATION_TYPES.USER, 'Password reset requested', …, '')` inside `runWithLock_` (WAIT_TIME 30s, no lock-timeout risk). Notifications.js `appendNotification_`/`getMyNotifications`/`markNotificationsRead(ids, token)` correct; client `handleForgotPassword` (script.html:706) → `ApiService.requestPasswordReset`; admin badge "Reset request received" renders (script.html:1699-1701, 1967). Commit `c8d7056` + `fe6fad6`. No code change needed.
- **Client/server API layer:** `apiCall_` (script.html:48) dispatches `google.script.run[fn](args)` — fn-name + arg-order verified against server signatures for all notification/username calls.
- Conclusion: the user's runtime reports for username + notification almost certainly came from testing a stale/old deployment URL. The old "@102 is the URL to use" deployment returns **404** (deleted). Live anonymous URLs now: **@106** (below) and the Worker proxy.

## Live URLs (current)
- **@106 (live, anonymous, no sign-in wall):** `https://script.google.com/macros/s/AKfycbzTQEL6w2CbVdQyLMc6JJ7YjgV8M-nml28VY_5374cCDsGFq42MUaGwdUVoGq94krqT/exec`
- **Worker proxy:** `https://dashv1-proxy.dashv1-proxy.workers.dev/` (proxy for @106; strips Google disclaimer; this is what app.dashboardharyana.site redirects to)
- Still exist: `@105` (`AKfycbynyU2lSl9gPdOPbak8p7roB9VN-NhVyi1TWxc2isfzAyvS2cgQkW67YeY8xP9TLYyq`, hyperlink fix), `@104` (`AKfycbxOe_2Xz7rV_lF3RAt1RQinZRe2qizNVGx9diiS9kDmEVP1QybPoYu6teJsX--sKQfR`), `@HEAD` (`AKfycbw_jyy9XDNSwX5YHZkq8xIttahTdhQ6UTBFsec-FdU`, shows Google sign-in wall when fetched anonymously).
- Deleted: `@102` (old anonymous URL → 404).

## Repo / Environment
- Repo: `vcharyanaco-tech/dashv1`; local clone: `C:\Users\admin\dashv1` (this machine). Branch `main`.
- Git: use `& "C:\Program Files\Git\cmd\git.exe" ...` if needed.
- gh CLI: `C:\Program Files\GitHub CLI\gh.exe` (authed as `vcharyanaco-tech`).
- clasp 3.3.0 authed (`~/.clasprc.json`). `.clasp.json` → scriptId `1QYwVDQGWPL5o64Xrvv9kKfE-AFT2nUuVMlvOc5CTK46qClfTCu3ofWcU`, projectId `dashboard-504111`, 23 files.
- Cloudflare Worker `dashv1-proxy`: account `a01eb877733d755cb57e25827a9c52fe`, vars in `wrangler.toml` `[vars]` (`GAS_URL`, `GAS_SCRIPT_URL`).

## Deploy procedure (for next time)
1. Edit code → `clasp push --force` (updates @HEAD only).
2. `clasp deploy -d "<desc>"` → creates a new pinned deployment (GAS_URL pinned to a deployment ID, NOT @HEAD).
3. Update `wrangler.toml` `GAS_URL`/`GAS_SCRIPT_URL` to the new ID.
4. `wrangler deploy` (Worker startup ~12s; pushes new vars).
5. Verify: `Invoke-WebRequest` the GAS exec URL + Worker URL; check for features; compare base64 prefixes (unescape `\/`, `&#43;`) to confirm the right images.
6. `git add -A && git commit && git push`.

## Key architecture facts (unchanged)
- Login ID = email (Users sheet col 1) OR username (col 15); SHA-256 salt+hash; sessions in CacheService; `executeAs USER_DEPLOYING`, `access ANYONE_ANONYMOUS` (anonymous web app, own login form).
- ROLES: ADMIN/EDITOR/VIEWER. `CONFIG.TITLE.DEFAULT = 'India Post Dashboard'`. `runWithLock_` in Utils.js:566 (LockService, try/finally, WAIT_TIME 30000).
- Notifications: `Notifications.js` `notifyStaff_(type,title,body,link[,excludeEmail])` (no self-lock — wrap in runWithLock_), `notifyStaffLocked_` (inside-lock), `appendNotification_`, hidden Notifications sheet, MAX_PER_USER 50. Client `openNotification` maps type `user` → opens **Settings** tab (script.html:556). Badge loads via `loadNotifications(true)` at app start (script.html:644); **no polling** — badge updates on app load or bell open.
- Docs site on GitHub Pages (`docs/`, live https://www.dashboardharyana.site/) redirects root → Worker proxy. OAuth/app-verification thread ABANDONED by user decision.
- appsscript.json: 4 scopes (send_mail removed).

## Recent commits (git log)
- `285f73e` fix: remove base tag injection; rewrite relative URLs to absolute + use page nonce on injected script/style to pass Google CSP — DONE, deployed
- `14b2da8` fix: match login screen logo to dashboard homepage banner; repoint worker to deployment @106
- `a5c03c5` fix: preserve hyperlinks when editing records (RichTextValue plain-text compare) — DONE, deployed @105
- `a2c254d` Embed GAS web app via Cloudflare Worker proxy; remove Group/Department fields — DONE
- `bc05693` Add optional Username: email-or-username sign-in — DONE, deployed
- `fe6fad6` Remove email sending; reset → admin request (flag + notification + Settings highlight) — DONE, deployed
- `c8d7056` Notification center fix (name/arg-order/Documents token bugs) — DONE, deployed

## Ad-hoc files
- `D:\VS tools\dashboardharyana-index.html` / `D:\VS tools\in` — saved copies of landing `docs/index.html`.
- `D:\VS tools\reset-email\` — old experiment, unrelated.
- Scratch copy of live @106 HTML: `%TEMP%\opencode\gas106.html`.
