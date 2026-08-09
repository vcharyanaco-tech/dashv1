# India Post Dashboard

A live operations dashboard for the **Circle Office, Haryana**, India Post. It
turns a Google Spreadsheet into a secure, role-based web app for record
management, submissions, tasks, notifications, analytics, and report exports —
served both as a Google Apps Script web app and as a static PWA on
**dashboardharyana.site** behind a Cloudflare Worker.

**Current version:** 1.0.0 — see [Change Log](Change%20Log.md).

## What it does

- Serves a responsive single-page dashboard (cards or sortable enterprise table)
  with sector filter, sort, search, pagination, KPI cards, and live
  auto-refresh.
- Runs on **two surfaces that stay in sync**:
  - **Google Apps Script web app** (`index.html` + `script.html`, pushed with
    `clasp`) at `https://dashboardharyana.site/macros/s/<deploymentId>/exec`.
  - **Static PWA** (`docs/app.html` + `docs/app.js`) on GitHub Pages /
    Cloudflare at `https://dashboardharyana.site/app.html`.
- Uses your own token-based auth (see [Architecture](Architecture.md)); no Google
  account is needed at runtime — the web app is deployed as `ANYONE_ANONYMOUS`
  and issues its own session tokens.
- Tracks every action in an `Audit Log` sheet and exposes the last 80 entries
  with admin tools to delete selected rows or clear the log.
- Lets users post text updates ("submissions") against records; editors can edit,
  lock, unlock, and admins can display submissions on the cards.
- Exports the report as CSV, XLSX, and PDF, plus print layouts for both the report
  and the audit log.
- Runs in the `Asia/Kolkata` time zone (Google Apps Script V8 runtime).

## Features

- **Role-based access**
  - `VIEWER` — read the dashboard, filter/search/sort, and submit updates against records.
  - `EDITOR` — everything a viewer can do, plus add, edit, and delete records,
    and edit/lock/unlock submissions (admin locks are admin-only).
  - `ADMIN` — everything above, plus user management, marking reviews as done,
    displaying/locking/deleting submissions, and audit log maintenance.
- **India Post branding** — official Dak Sewa Jan Sewa logo in the sidebar, splash
  screen, About dialog, and favicon; India Post red/blue palette; dark mode.
- **Review workflow** — "Review due" / "Review done" badges derived from the
  review-date cell background colour in the sheet.
- **Sorting** — sort the dashboard by sector, entry date, review date, or
  responsibility, with an ascending/descending toggle; active sort shows as a
  removable filter chip and stays applied across page changes.
- **Submissions** — per-record update threads with a 24-hour "new" flash badge,
  a lock system (admin locks block editor edits), and an admin "display" toggle
  that shows selected submissions directly on the cards.
- **Audit log** — last 80 entries with timestamp, user, action, record ID, and
  details; sortable; admin can delete selected rows or clear everything; export
  to CSV, copy to clipboard, and print.
- **Notifications** — in-app bell with unread badge, dropdown panel, mark-all-read,
  and event hooks for record changes, submissions, and account events.
- **Tasks** — assignable, due-dated tasks linked to records with status tracking
  (OPEN, IN_PROGRESS, DONE, CANCELLED) and priorities.
- **Dashboard Studio** — customizable column visibility in table view, default
  view mode (cards/table), persisted per-user preferences.
- **Analytics** — sector and office breakdowns, monthly trends, flagged item
  lists, and trend indicators comparing current vs previous month.
- **Reports** — template-based reports (Summary, Detailed, Flagged only),
  preview, CSV/XLSX/PDF export, and email scheduling.
- **AI insights** — one-click, per-card and dashboard-wide AI summaries with a
  choice of provider (Groq free tier by default, plus OpenRouter/Hugging Face/
  Gemini fallbacks); results cached in Cloudflare KV.
- **AI meeting notes** — upload a meeting recording and get a transcript + AI
  minutes (summary, action items) with one-click task creation; optional live
  browser recording via tab/screen share.
- **Command Palette** — Ctrl+K quick search across records and commands, keyboard
  shortcuts for navigation and actions.
- **Documents** — Drive-backed document attachments linked to records, upload
  and delete from the record detail dialog.
- **Enterprise add-ons** — PWA with offline action queue, review-calendar `.ics`
  export, WhatsApp review reminders, and worker-side PWA header upgrades (feature
  flags in `EnterpriseSettings.js`, off by default).
- **Security** — salted password hashes (500 SHA-256 iterations), 6-hour session
  tokens, 5-attempt login lockout for 15 minutes, 30-minute reset links, forced
  password change on first login, input validation, and rate limiting.
- **Accessibility** — skip-to-content link, keyboard-navigable tables, ARIA
  labeling, and screen-reader-friendly dynamic regions.
- **Performance** — 60 s auto-refresh, optimistic UI updates, batch sheet writes
  (`Sheets.Values.batchUpdate`), script-cache responses, lazy audit loading, and
  virtualized (infinite-scroll) card rendering.

## Project layout

Backend (Google Apps Script):

| File                | Responsibility                                             |
| ------------------- | ---------------------------------------------------------- |
| `code.js`           | `doGet` entry point, `doPost` JSON API, data read/update/add/delete, `getAppData`, title stamping, link/rich-text rendering |
| `Auth.js`           | Users store, hashing, sessions, throttling, login/logout/reset, admin user management |
| `DashboardService.js` | Item building + review-status logic (extracted from `code.js`) |
| `RecordService.js`  | Record CRUD + review-done service layer                     |
| `Data.js`           | Low-level sheet read/write/insert/delete/renumber          |
| `Utils.js`          | Sheet/header detection, field mapping, locks, cache, properties, spreadsheet binding, `preauthorize`/`inspectBoundSheet_` |
| `Audit.js`          | `Audit Log` sheet, `logAudit_`, read last 80, admin delete/clear |
| `Reports.js`        | Summary/analytics builders, XLSX + PDF export, templates, email |
| `Submissions.js`    | `Submissions` sheet store, submission CRUD, locks, display toggle, overview counts/flash |
| `Settings.js`       | Central `CONFIG` constants, column map, property keys      |
| `Triggers.js`       | Daily `dailyDateUpdate` time trigger (`setupProject`)      |
| `Notifications.js`  | `Notifications` sheet store, per-user notification CRUD, event hooks |
| `Tasks.js`          | `Tasks` sheet store, task CRUD, status/priority tracking   |
| `Analytics.js`      | Analytics builder: trends, sector/office breakdowns        |
| `DashboardStudio.js`| User dashboard preferences (view mode, column visibility)  |
| `Documents.js`      | `Documents` sheet store, Drive upload/delete, record links |
| `EnterpriseService.gs` | Enterprise endpoints: review-calendar `.ics`, WhatsApp reminders, AI insights |
| `EnterpriseSettings.js` / `EnterpriseUtils.js` | Enterprise feature flags + shared helpers |

Frontend (served HTML — two in-sync copies):

| File             | Responsibility                                              |
| ---------------- | ----------------------------------------------------------- |
| `index.html`     | Page shell, sidebar, all screens/markup, base64 logo assets (GAS web app) |
| `styles.html`    | Full design system (CSS custom properties, dark mode)       |
| `script.html`    | All client logic (auth, dashboard, analytics, audit, reports, settings, submissions, notifications, tasks, command palette, documents, AI insights, meeting notes) |
| `docs/app.html`  | Same app as a static PWA page (GitHub Pages / Cloudflare)   |
| `docs/app.js`    | PWA client bundle (kept in sync with `script.html`)         |
| `ReportPdf.html` | PDF report template                                         |

Infrastructure:

| File                     | Responsibility                                        |
| ------------------------ | ----------------------------------------------------- |
| `worker.js`              | Cloudflare Worker split-routing proxy (dashboardharyana.site) |
| `deploy-worker-api.js`   | REST deploy of the Worker (used by GitHub Actions)    |
| `deploy-all.ps1`         | Full pipeline: git push + clasp + GAS redeploy + Worker |
| `.github/workflows/pages.yml` | GitHub Actions → GitHub Pages (docs/) + Worker deploy |
| `wrangler.toml`          | Worker config, routes, KV binding, GAS URL var        |

Configuration: `appsscript.json` (manifest/scopes/timezone), `.clasp.json` (script
ID).

Documentation: `README.md`, `Architecture.md`, `Admin Guide.md`,
`Deployment Guide.md`, `Change Log.md`, `Contributing.md`, `Developer Guide.md`,
`README_ENTERPRISE_ADDONS.md`, `GOOGLE_OAUTH_VERIFICATION.md`.

## Public website & Google OAuth verification

The `docs/` folder is the **public compliance website** for Google OAuth/app
verification. Publish it on GitHub Pages (Source: `main` → `/docs` **or** use the
provided workflow `.github/workflows/pages.yml` with Source → **GitHub Actions**):

```
https://<your-org>.github.io/<repo>/          (home)
https://<your-org>.github.io/<repo>/privacy.html
https://<your-org>.github.io/<repo>/terms.html
https://<your-org>.github.io/<repo>/data-deletion.html
https://<your-org>.github.io/<repo>/googledb112fa8b7d5dd0c.html   (Search Console verification file)
```

Follow [`GOOGLE_OAUTH_VERIFICATION.md`](GOOGLE_OAUTH_VERIFICATION.md) for the
complete, first-try submission checklist (GitHub Pages setup, Search Console
domain verification, OAuth consent screen, and the review questionnaire). The
`docs/` folder is excluded from `clasp push` (`.clasp.json` →
`skipSubdirectories: true`), so site files never enter the Apps Script project.

## Quick start

1. Clone the repository.
2. `npm i -g @google/clasp` and `clasp login`.
3. `clasp pull` to fetch the Apps Script project (see `.clasp.json`).
4. Edit the backend `.js` files and the frontend in `index.html`/`script.html`,
   and mirror HTML/JS changes into `docs/app.html`/`docs/app.js` (the PWA copy).
5. Deploy everything: `.\deploy-all.ps1 "feat: description"` — this commits and
   pushes (GitHub Actions publishes `docs/` and the Worker), pushes with `clasp`,
   redeploys the pinned GAS deployment, and redeploys the Cloudflare Worker.
   Alternatively run the steps in [Deployment Guide](Deployment%20Guide.md).
6. Run `setupProject()` once from the Apps Script editor to install the daily
   trigger, stamp the title, and create the bootstrap admin user.

## Live deployment

The app is served at **`https://dashboardharyana.site/app.html`** (primary) and
`https://www.dashboardharyana.site`:

- **Frontend (PWA):** `docs/app.html` + `docs/app.js`, deployed to GitHub Pages
  by `.github/workflows/pages.yml` and proxied by the Cloudflare Worker.
- **Backend (API):** the Google Apps Script deployment behind the Worker:
  `https://script.google.com/macros/s/AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian/exec`
  (also reachable through the Worker at `https://dashboardharyana.site/macros/s/<deploymentId>/exec`).
- **Compliance site:** `docs/index.html` etc. published to
  `https://www.dashboardharyana.site` (Privacy / Terms / Data deletion / Support).

Deploy everything in one command:

```powershell
.\deploy-all.ps1 "feat: my change"   # git push + clasp + GAS redeploy + Worker
```

See [Deployment Guide](Deployment%20Guide.md) for details.
