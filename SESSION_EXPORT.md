# Session Export — 2026-08-05

## Goal
Serve the frontend from GitHub Pages and use Apps Script only as a backend API, so the "This application was created by a Google Apps Script user" banner disappears from `dashboardharyana.site`.

## Completed
- Added `doPost()` API handler to `code.js` with JSON-routed `eval(fn)` dispatch
- Rewrote `script.html` to use `fetch()` (text/plain) instead of `google.script.run`
- Rewrote `index.html` as a standalone static page (relative paths to `assets/styles.css` and `app.js`)
- Changed `code.js` `doGet()` to return a JS redirect to GitHub Pages `https://www.dashboardharyana.site/app.html`
- Created static bundle under `docs/`: `app.html`, `app.js`, `assets/styles.css`
- Updated `docs/index.html` landing page with "Open Dashboard" CTA
- Committed and pushed to origin/main (`e42e3dc`)
- Pushed to Apps Script via `clasp push --force`
- Created deployment **@109** (`AKfycbwNiYcg4uSCLhNSO3xx0o-YdbR7S-ZBK1t5I8lhJFpNuJS5E29253V-gNZDAgti-TY1`) with public access

## Blocked — ROOT CAUSE FOUND & FIXED (2026-08-05)
- Apps Script project still contained a stale `app.js` (server file) that was the original client-side build artifact.
- That file crashes at load time with `ReferenceError: document is not defined (line 152, file "app")` — and later with `ReferenceError: <base64 stub> is not defined` after an empty-stub workaround.
- `clasp push` does NOT delete remote files, so the stale `app` kept loading on every deployment.
- **Fix:** removed the `app` file from the Apps Script project via the REST API (`projects.updateContent`, full file list minus `app`), added `app.js` + `docs/**` + `SESSION_EXPORT.md` to `.claspignore`, then `clasp push --force` + new version **112** + redeployed **@110** to v112.

## Resumed — completed
- @110 (`AKfycbykqb0AE0a6bwHGk4Q_e5LTXhefKtjao9_r7G0zR1cODl5JP5lH_ooqrgFt2hu3oDo2`) now serves HEAD with **no** `app` file.
- Verified: `POST .../exec {"function":"getData","args":[]}` → JSON with **19 live items** (no ReferenceError).
- Verified: `@108`/`@109` return HTML (no working `doPost`), so they are NOT usable as the API. `@110` is the only working API deployment.
- The frontend's `API_URL` (`script.html:49`, `docs/app.js:47`, `app.js:47`) was pointing at a **deleted** deployment (404). Repointed all three to **@110**.
- `wrangler.toml` `GAS_URL`/`GAS_SCRIPT_URL` pointed at @108 (no `doPost`). Repointed both to **@110**.
- `.claspignore` now excludes `app.js`, `docs/**`, `SESSION_EXPORT.md` (so the client bundle is never pushed to Apps Script again).

## Remaining (all done)
1. `git commit` + `git push` the fixes (`.claspignore`, `script.html`, `docs/app.js`, `app.js`, `wrangler.toml`) — committed as `e7f69bb`.
2. `wrangler deploy` so the Worker proxy uses @110 (strips the Google banner on the proxied path) — deployed.
3. Verify `https://www.dashboardharyana.site/app.html` loads and the API returns data with no banner.

## BANNER STILL SHOWING — ROOT CAUSE FOUND & FIXED (Cloudflare, not code)
The Google "created by a Google Apps Script user" banner persisted because **Cloudflare Worker routes**
intercepted the whole domain and 302-redirected it to the Apps Script web app @108:
- `dashboardharyana.site/*`        -> worker `dashboard-redirect`
- `www.dashboardharyana.site/*`    -> worker `dashboard-redirect`
The `dashboard-redirect` worker issued the 302 to `script.google.com/macros/s/AKfycbwc…hkK/exec` (Apps Script HTML UI = banner).
DNS was already correct (apex `A` -> GitHub Pages IPs; `www` CNAME -> `vcharyanaco-tech.github.io`, both proxied).
**Fix:** deleted the two `dashboard-redirect` worker routes via Cloudflare API. The domain now serves the
GitHub Pages frontend directly. Verified: `www.dashboardharyana.site/app.html`, `dashboardharyana.site`,
and `www.dashboardharyana.site` all return 200 with the frontend and **no banner**.

## Notes / cleanup
- The `dashboard-redirect` worker script itself was left in place (only its routes were removed). Delete it if no longer needed.
- `@108`/`@109` are dead API deployments (no working `doPost`); `@110` (v112) is the live API.
- Temp diagnostic scripts: `C:\Users\admin\AppData\Local\Temp\kilo\cf-*.ps1`.

## Key facts
- GitHub repo: `https://github.com/vcharyanaco-tech/dashv1.git`
- Apps Script project ID: `1QYwVDQGWPL5o64Xrvv9kKfE-AFT2nUuVMlvOc5CTK46qClfTCu3ofWcU`
- GitHub Pages site: `https://www.dashboardharyana.site`
- `.clasp.json` `skipSubdirectories: true`; `.claspignore` excludes `node_modules/**`, `worker.js`, `wrangler.toml`, `auto-commit.ps1`, `.gitignore`, `.git/**`, `SESSION.md`, `.claspignore`
- doPost uses `text/plain` content type to avoid CORS preflight (Apps Script does not handle OPTIONS)
- `eval(fn)` is used in doPost because Apps Script V8 global functions are not reliably accessible via `this[fn]`

## Temporary scripts (C:\Users\vikph\AppData\Local\Temp\)
- `delete_app_js.js` — list + delete a single file (list returned 404)
- `update_app_js.js` — overwrite one file via PUT (400: needs full manifest)
- `list_project_files.js` — list files via GET /v1/projects/{id}/content (200, works)
- `fix_app_js.js` — GET full content, replace `app`, PUT back (200, works)
- `update_deploy.js` — tried repointing @109 to HEAD (400: read-only)
- `empty_app.js` — set `app` to empty string via full-content PUT (200)
- `inspect_app.js` — decode and print the remote `app` file (works)
