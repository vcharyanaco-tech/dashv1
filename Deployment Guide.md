# Deployment Guide

This project is a Google Apps Script web app managed with `clasp` and pushed from
this repository.

## Prerequisites

- Node.js (>= 18) and `@google/clasp`:
  ```powershell
  npm i -g @google/clasp
  ```
- A Google account with access to the bound spreadsheet and the Apps Script
  project.
- Git (`git` is not on PATH by default on some Windows shells; prepend
  `C:\Program Files\Git\cmd` if needed).

## Project files you need to know

| File            | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `.clasp.json`   | `scriptId` of the Apps Script project (rootDir `""`) |
| `appsscript.json` | Manifest: timezone, runtime, scopes, web app access |
| `*.js`          | Apps Script backend (uploaded as-is)                |
| `*.html`        | Served HTML templates (uploaded as-is)              |

## appsscript.json (manifest)

```json
{
  "timeZone": "Asia/Kolkata",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/script.send_mail"
  ],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" },
  "executionApi": { "access": "ANYONE" }
}
```

The web app runs as **the deploying user** and is reachable by **anyone** (no
Google sign-in); access control is enforced in the app itself.

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
clasp push -f
```

`-f` forces the push and does not ask for confirmation. Check the uploaded project
in the Apps Script editor after a push.

## Deploying / updating the web app

The deployment ID is stable; you reuse it instead of creating a new deployment:

```powershell
clasp deploy --deploymentId AKfycbzWFefNu0Hw0z_eMzrzQZxRnCaM1FVS5_Uj8lgYpr1eUNyHpuwdrFZrcdpO1RfOi8Ki --description "v1.0.0 update"
```

Live URL:

```
https://script.google.com/macros/s/AKfycbzWFefNu0Hw0z_eMzrzQZxRnCaM1FVS5_Uj8lgYpr1eUNyHpuwdrFZrcdpO1RfOi8Ki/exec
```

> Apps Script is eventually consistent after a deploy: an old version may still be
> served for a few seconds/minutes. Hard-refresh to verify.

## Verifying a deployment

1. Open the live URL — the app should load and let you sign in.
2. `https://script.google.com/macros/s/<deploymentId>/exec?inspect=1` returns a
   JSON dump of the bound spreadsheet (sheets, last row/column, preview).
3. Check the browser console for runtime errors (the client is served as HTML with
   escaped characters like `&#43;` for `+`; this is normal).
4. Sanity-check the client bundle locally before pushing:
   ```powershell
   node --check <extracted script file>
   ```
   (Extract the inline `<script>` block from `script.html` and run `node --check`
   on it; also confirm every `getEl(...)` ID exists in `index.html` and every
   inline `onclick` handler is defined.)

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
