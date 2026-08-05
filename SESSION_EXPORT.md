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

## Blocked — root cause found, fix in progress
- Apps Script project still contained a stale `app.js` (server file) that was the original client-side build artifact
- That file crashes at load time with `ReferenceError: document is not defined (line 152, file "app")`
- Deleting `app.js` locally did NOT sync to remote via `clasp push` (clasp ignores deletions)
- Workaround attempted: wrote an empty stub `app.js` via the Apps Script REST API (`projects.updateContent`)
- Stub write returned 200 and is confirmed stored remotely (2 lines, empty)
- **BUT** POST to @109 still returns `ReferenceError: <base64 of stub> is not defined (line 1, file "app")`
- `@109` is versioned (`@HEAD`) — it is read-only and cannot be repointed to serve HEAD

## Next steps (resume here)
1. Create a **new deployment** with `clasp deploy` so it serves HEAD (which now has the empty stub). Deployment @110 was started but not verified.
2. Test: `POST https://script.google.com/macros/s/<NEW_DEPLOYMENT_ID>/exec` with `{"function":"getData","args":[]}` — should return JSON, not an error page.
3. Once API is clean, verify `https://www.dashboardharyana.site/app.html` loads without the Google banner.
4. Clean up: delete `app.js` from the Apps Script project properly (it is no longer needed there). `clasp` does not delete remote files; use the Apps Script REST API `projects.updateContent` with the full file list minus `app`, or delete in the Apps Script IDE UI.
5. Update `docs/app.js`, `docs/app.html`, `docs/assets/styles.css` if the dashboard JS has any other stale references to `google.script.run` or `<base target="_top">`.

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
