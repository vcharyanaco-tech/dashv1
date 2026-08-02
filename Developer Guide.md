# Developer Guide

Everything a developer needs to work on the India Post Dashboard: local setup,
the file layout, the data model, and how key features are implemented.

## Setup

```powershell
npm i -g @google/clasp
clasp login
```

Then, from the repo root (see `.clasp.json` for the script ID):

```powershell
clasp pull   # sanity-check the binding (do NOT commit pulled files over yours)
clasp push -f
clasp deploy --deploymentId AKfycbzWFefNu0Hw0z_eMzrzQZxRnCaM1FVS5_Uj8lgYpr1eUNyHpuwdrFZrcdpO1RfOi8Ki --description "desc"
```

Live URL:
`https://script.google.com/macros/s/AKfycbzWFefNu0Hw0z_eMzrzQZxRnCaM1FVS5_Uj8lgYpr1eUNyHpuwdrFZrcdpO1RfOi8Ki/exec`

Details in the [Deployment Guide](Deployment%20Guide.md).

## File layout

```
code.js          doGet, getData/getAppData, record CRUD, title stamping, HTML rendering helpers
Auth.js          users, hashing, sessions, throttling, login/logout/reset, admin user mgmt
Data.js          low-level sheet read/write/insert/delete/renumber
Utils.js         sheet/header detection, field mapping, locks, cache, properties, binding, preauthorize
Audit.js         Audit Log sheet + logAudit_ + read/delete/clear
Reports.js       analytics builders, XLSX + PDF export
Submissions.js   Submissions sheet, submission CRUD + locks + display toggle
Settings.js      CONFIG constants, COL map, PROP keys
Triggers.js      daily trigger management + setupProject
index.html       page shell + all screens + base64 logos
styles.html      design system (CSS variables, dark mode)
script.html      client logic (auth → dashboard → analytics → audit → reports → settings → submissions)
ReportPdf.html   PDF report template
Scripts.html     legacy standalone client (not used by index.html)
appsscript.json  manifest
.clasp.json      script binding
```

## Data model

- **`Sheet1`** — data rows, 7 columns:
  `ID, Sector, Description, Entry Date, Action, Responsibility, Review Date`.
  Data starts at row 4 (`CONFIG.SHEET.START_ROW`); rows 1–3 hold the title
  and header.
- **`Users`** (hidden, auto-created) — `Email, Role, Salt, PasswordHash,
  MustChange, CreatedBy, CreatedAt, ResetToken, ResetExpires`.
- **`Submissions`** (hidden, auto-created) — `Id, CardRow, CardId, Email, Text,
  CreatedAt, UpdatedAt, LockedBy, LockedAt, Displayed`.
- **`Audit Log`** — `Timestamp, User, Action, Record ID, Details`.

### Review status (how it works)

The dashboard does not store a status column. Status is derived from the
**background colour of the review-date cell**:

- non-white (e.g. `#ffab00`) → `due`
- "green-ish" (`g >= 150 && g > r + 20 && g > b + 20`, e.g. `#c8e6c9`) → `done`
- `#ffffff` → normal

`isFlagged_` / `isReviewDoneColor_` in `code.js` compute it; `markReviewDone`
sets the green background. This is why editing a row should preserve the action
cell's rich text (see the conditional rewrite in `updateItem`).

## How the client talks to the server

`script.html` calls `google.script.run.<fn>(...args, token)`. Protected functions
throw on a bad token; the client catches `isAuthError` messages and redirects to
login. The bootstrap payload comes from `getAppData(token)` which returns:

```
user, items, summary, analytics { sectors, flaggedItems, trend },
audit (80), settings, submissionCounts, submissionFlash, displayedSubmissions
```

## Key implementation notes

- **XLSX export** (`Reports.js`) tries three fast paths (Drive v3 export,
  `DriveApp.getAs`, spreadsheet blob) and falls back to building the `.xlsx`
  package in memory with `Utilities.zip` — this always works and needs no extra
  scopes.
- **PDF export** renders `ReportPdf.html` with `HtmlService` and converts the HTML
  blob to PDF.
- **Print layouts** — `printReport()` / `printAudit()` in `script.html` open a new
  window, write a self-contained styled document, and call `print()`.
- **Submissions visibility** — server-side `canEditSubmission_` enforces rules;
  admins override locks, editors are blocked only by admin locks, viewers edit
  only their own.
- **Sessions** — tokens stored in `CacheService` (`session_<token>`, 6 h TTL);
  `login` also records failed attempts with a 5-strike/15-min lockout.
- **Data sheet header detection** (`Utils.js`) — `getPreferredHeaderRow_` prefers
  row 3, then scans for a header row; `buildFieldMap_` matches column labels
  flexibly so field order in the sheet is not required to be fixed.

## Debugging

- `?inspect=1` on the web app URL dumps the bound spreadsheet as JSON.
- `preauthorize()` (run once in the editor) forces the OAuth consent flow.
- `listTriggers()` shows installed triggers; `setupProject()` installs the daily
  trigger, stamps the title, and seeds the bootstrap admin.
- Server errors surface as `ERROR` audit entries and in the Apps Script editor's
  logs (STACKDRIVER).

## Verification checklist

1. `node --check` on the extracted inline script of `script.html`.
2. Every `getEl(...)` ID in `script.html` exists in `index.html`.
3. Every inline `onclick` handler is defined.
4. `clasp push -f` succeeds (catches server-side syntax errors).
5. Redeploy the stable deployment ID, hard-refresh the live URL, sign in, and
   exercise the affected feature.

## Logo assets

Logo data URIs live in `index.html` (sidebar, splash, About, favicon) as base64
PNGs (512/192/96 px variants of the Dak Sewa Jan Sewa logo with transparency).
To replace them, downscale the source PNG to those three sizes, base64-encode,
and swap the `data:image/png;base64,...` values. The splash tile uses a white
background so the logo stays legible.
