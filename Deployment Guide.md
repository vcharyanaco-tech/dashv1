# Deployment Guide

This project is a Google Apps Script web app managed with `clasp`, plus a static
PWA (`docs/`) published to GitHub Pages and served behind a Cloudflare Worker at
**dashboardharyana.site**.

## Prerequisites

- Node.js (>= 18) and `@google/clasp`:
  ```powershell
  npm i -g @google/clasp
  ```
- A Google account with access to the bound spreadsheet and the Apps Script
  project.
- Git (`git` is not on PATH by default on some Windows shells; prepend
  `C:\Program Files\Git\cmd` if needed).
- A Cloudflare API token with **Workers Scripts: Edit** permission
  (`CLOUDFLARE_API_TOKEN`, set at User level on this machine).

## Project files you need to know

| File            | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `.clasp.json`   | `scriptId` of the Apps Script project (rootDir `""`) |
| `appsscript.json` | Manifest: timezone, runtime, scopes, web app access |
| `*.js`          | Apps Script backend (uploaded as-is)                |
| `*.html`        | Served HTML templates (uploaded as-is)              |
| `docs/app.html` + `docs/app.js` | Static PWA copy of the frontend (GitHub Pages) |
| `worker.js`     | Cloudflare Worker split-routing proxy               |
| `deploy-all.ps1`| One-command full deployment pipeline                |
| `.github/workflows/pages.yml` | GitHub Actions: Pages + Worker on push       |

## appsscript.json (manifest)

```json
{
  "timeZone": "Asia/Kolkata",
  "dependencies": {
    "enabledAdvancedServices": [{ "userSymbol": "Sheets", "serviceId": "sheets", "version": "v4" }]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.external_request"
  ],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" },
  "executionApi": { "access": "ANYONE" }
}
```

The web app runs as **the deploying user** and is reachable by **anyone** (no
Google sign-in); access control is enforced in the app itself. The advanced
`Sheets` service is used for batched writes; `script.external_request` backs the
AI/WhatsApp/ics enterprise endpoints.

## First-time setup

1. Clone the repo.
2. `clasp login` (opens the browser; authorize).
3. From the repo root, pull the existing project to confirm the binding:
   ```powershell
   clasp pull
   ```
   (This fetches `code.js`, `index.html`, etc. into the folder. Do not overwrite
   your local files — the repo is the source of truth.)
4. Run `setupProject()` once in the Apps Script editor:
   - installs the daily `dailyDateUpdate` trigger,
   - stamps the title in cell A1 of `Sheet1`,
   - creates the bootstrap admin user.
   The editor is reached via the spreadsheet's **Extensions → Apps Script**, or
   the script ID in `.clasp.json`.

## Pushing changes

All files in the repo are plain text; `clasp push` uploads them:

```powershell
clasp push --force
```

`--force` forces the push and does not ask for confirmation. `docs/` and the
Node/PowerShell files are excluded via `.claspignore` so they never enter the
Apps Script project.

## Deploying — the fast way (recommended)

`deploy-all.ps1` runs the whole pipeline in one command:

```powershell
.\deploy-all.ps1 "feat: describe your change"
```

It performs, in order:

1. **Git commit + push** — triggers `.github/workflows/pages.yml`, which deploys
   `docs/` to GitHub Pages (**www.dashboardharyana.site**) and redeploys the
   Cloudflare Worker (`deploy-worker-api.js`).
2. **`clasp push --force`** — uploads the Apps Script project.
3. **Redeploy the pinned GAS deployment** — `clasp deploy --deploymentId
   AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian`
   (deployment IDs are discovered from `clasp deployments`, so this stays
   current).
4. **Deploy the Cloudflare Worker** — `node deploy-worker-api.js` with
   `CLOUDFLARE_API_TOKEN`.

Verify afterwards: a second `clasp push` should report "Script is already up to
date."

## Deploying — manually

### GitHub Pages + Worker

```powershell
git add -A
git commit -m "feat: my change"
git push
```

GitHub Actions then deploys `docs/` to Pages and redeploys the Worker. You can
also run `node deploy-worker-api.js` locally to redeploy just the Worker.

### Apps Script web app

```powershell
clasp push --force
clasp deploy --deploymentId AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian --description "v1.0.0 update"
```

Live URLs:

- GAS exec: `https://script.google.com/macros/s/AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian/exec`
- PWA (via Worker): `https://dashboardharyana.site/app.html`
- Compliance site: `https://www.dashboardharyana.site`

> Apps Script is eventually consistent after a deploy: an old version may still be
> served for a few seconds/minutes. Hard-refresh to verify.

## Verifying a deployment

1. Open `https://dashboardharyana.site/app.html` — the app should load and let
   you sign in.
2. `https://script.google.com/macros/s/<deploymentId>/exec?inspect=1` returns a
   JSON dump of the bound spreadsheet (sheets, last row/column, preview).
3. Check the browser console for runtime errors.
4. Sanity-check the client bundle locally before pushing:
   ```powershell
   node --check <extracted script file>
   ```
   (Extract the inline `<script>` block from `script.html` and run `node --check`
   on it; also confirm every `getEl(...)` ID exists in `index.html` and every
   inline `onclick` handler is defined. Keep `docs/app.js` in sync with
   `script.html`.)

## Keeping the two frontends in sync

`script.html` (GAS) and `docs/app.js` (PWA) must stay identical in behaviour. When
you change one, mirror the change in the other. A quick comparison helper:

```powershell
node C:\Users\vikph\AppData\Local\Temp\opencode\cmp-fns.js script.html docs/app.js
```

## Managing the daily trigger

- `installTriggers()` — create the daily trigger.
- `removeTriggers()` — remove it.
- `listTriggers()` — list project triggers in the log.
- `reinstallTriggers()` — remove and recreate.

Run these from the Apps Script editor.

## Rollback

`clasp deploy` keeps version history. To roll back, find a prior version and
redeploy the same deployment ID with that version:

```powershell
clasp versions
clasp deploy --deploymentId <id> --version <n> --description "rollback"
```

## Common issues

- **`clasp` not recognized** — install it globally (`npm i -g @google/clasp`) and
  restart the terminal.
- **Push overwrites a file** — ensure `rootDir` in `.clasp.json` is `""` and run
  `clasp push` from the repo root.
- **Web app shows an old version** — wait a few minutes, then hard-refresh.
- **OAuth / scope errors** — run `preauthorize()` once in the editor as the
  deploying user, then redeploy.
- **Worker deploy fails (auth)** — confirm `CLOUDFLARE_API_TOKEN` is set at User
  level and the token has Workers Scripts: Edit + Account settings read.
- **GAS old version still served** — the deployment is pinned; `deploy-all.ps1`
  redeploys it every run, so a stale version usually just means cache.
