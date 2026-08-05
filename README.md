# India Post Dashboard

A Google Apps Script web application for the **Circle Office, Haryana**. It turns a
Google Spreadsheet into a live operations dashboard with role-based login, record
management, user submissions, an audit trail, analytics, and report exports.

**Current version:** 1.0.0 — see [Change Log](Change%20Log.md).

## What it does

- Serves a responsive single-page dashboard from Google Apps Script (`doGet`).
- Reads records from the bound spreadsheet (`Sheet1`) and renders them as cards
  with sector filter, search, pagination, and KPI cards.
- Requires a login with your own token-based auth (see [Architecture](Architecture.md)).
  No Google account is needed at runtime — the web app is deployed as
  `ANYONE_ANONYMOUS` and issues its own session tokens.
- Tracks every action in an `Audit Log` sheet and exposes the last 80 entries
  with admin tools to delete selected rows or clear the log.
- Lets users post text updates ("submissions") against records; editors can edit,
  lock, unlock, and admins can display submissions on the cards.
- Exports the report as CSV, XLSX, and PDF, plus print layouts for both the report
  and the audit log.
- Runs in the `Asia/Kolkata` time zone (Google Apps Script V8 runtime).

## Features

- **Role-based access**
  - `VIEWER` — read the dashboard, filter/search, and submit updates against records.
  - `EDITOR` — everything a viewer can do, plus add, edit, and delete records,
    and edit/lock/unlock submissions (admin locks are admin-only).
  - `ADMIN` — everything above, plus user management, marking reviews as done,
    displaying/locking/deleting submissions, and audit log maintenance.
- **India Post branding** — official Dak Sewa Jan Sewa logo in the sidebar, splash
  screen, About dialog, and favicon; India Post red/blue palette; dark mode.
- **Review workflow** — "Review due" / "Review done" badges derived from the
  review-date cell background colour in the sheet; formal approval workflow with
  submit-for-review and approver actions.
- **Submissions** — per-record update threads with a 24-hour "new" flash badge,
  a lock system (admin locks block editor edits), and an admin "display" toggle
  that shows selected submissions directly on the cards.
- **Audit log** — last 80 entries with timestamp, user, action, record ID, and
  details; sortable; admin can delete selected rows or clear everything; export
  to CSV, copy to clipboard, and print.
- **Notifications** — in-app bell with unread badge, dropdown panel, mark-all-read,
  and event hooks for record changes, submissions, and account events.
- **Approvals** — workflow engine with pending approval requests, approve/reject
  with comments, and automatic review-done on approval.
- **Tasks** — assignable, due-dated tasks linked to records with status tracking
  (OPEN, IN_PROGRESS, DONE, CANCELLED) and priorities.
- **Dashboard Studio** — customizable column visibility in table view, default
  view mode (cards/table), persisted per-user preferences.
- **Analytics** — sector and office breakdowns, monthly trends, flagged item
  lists, and trend indicators comparing current vs previous month.
- **Reports** — template-based reports (Summary, Detailed, Flagged only),
  preview, CSV/XLSX/PDF export, and email scheduling.
- **Command Palette** — Ctrl+K quick search across records and commands, keyboard
  shortcuts for navigation and actions.
- **Documents** — Drive-backed document attachments linked to records, upload
  and delete from the record detail dialog.
- **Security** — salted password hashes (500 SHA-256 iterations), 6-hour session
  tokens, 5-attempt login lockout for 15 minutes, 30-minute reset links, forced
  password change on first login, input validation, and rate limiting.
- **Accessibility** — skip-to-content link, keyboard-navigable tables, ARIA
  labeling, and screen-reader-friendly dynamic regions.
- **Performance** — script-cache responses (300 s TTL) and per-request memoization.

## Project layout

Backend (Google Apps Script):

| File                | Responsibility                                             |
| ------------------- | ---------------------------------------------------------- |
| `code.js`           | `doGet` entry point, data read/update/add/delete, `getAppData`, title stamping, link/rich-text rendering |
| `Auth.js`           | Users store, hashing, sessions, throttling, login/logout/reset, admin user management |
| `Data.js`           | Low-level sheet read/write/insert/delete/renumber          |
| `Utils.js`          | Sheet/header detection, field mapping, locks, cache, properties, spreadsheet binding, `preauthorize`/`inspectBoundSheet_` |
| `Audit.js`          | `Audit Log` sheet, `logAudit_`, read last 80, admin delete/clear |
| `Reports.js`        | Summary/analytics builders, XLSX + PDF export, templates, email |
| `Submissions.js`    | `Submissions` sheet store, submission CRUD, locks, display toggle, overview counts/flash |
| `Settings.js`       | Central `CONFIG` constants, column map, property keys      |
| `Triggers.js`       | Daily `dailyDateUpdate` time trigger (`setupProject`)      |
| `Notifications.js`  | `Notifications` sheet store, per-user notification CRUD, event hooks |
| `Workflow.js`       | `Approvals` sheet store, approval workflow engine          |
| `Tasks.js`          | `Tasks` sheet store, task CRUD, status/priority tracking   |
| `Analytics.js`      | Analytics builder: trends, sector/office breakdowns        |
| `DashboardStudio.js`| User dashboard preferences (view mode, column visibility)  |
| `Documents.js`      | `Documents` sheet store, Drive upload/delete, record links |

Frontend (served HTML):

| File             | Responsibility                                              |
| ---------------- | ----------------------------------------------------------- |
| `index.html`     | Page shell, sidebar, all screens/markup, base64 logo assets |
| `styles.html`    | Full design system (CSS custom properties, dark mode)       |
| `script.html`    | All client logic (auth, dashboard, analytics, audit, reports, settings, submissions, notifications, approvals, tasks, command palette, documents) |
| `ReportPdf.html` | PDF report template                                         |

Configuration: `appsscript.json` (manifest/scopes/timezone), `.clasp.json` (script
ID), `Scripts.html` (legacy standalone client, superseded by `script.html`).

Documentation: `README.md`, `Architecture.md`, `Admin Guide.md`,
`Deployment Guide.md`, `Change Log.md`, `Contributing.md`, `Developer Guide.md`.

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
4. Edit the backend `.js` files and frontend HTML files.
5. `clasp push -f` to upload, then redeploy the existing deployment
   (see [Deployment Guide](Deployment%20Guide.md)).
6. Run `setupProject()` once from the Apps Script editor to install the daily
   trigger, stamp the title, and create the bootstrap admin user.

## Live deployment

```
https://script.google.com/macros/s/AKfycbzWFefNu0Hw0z_eMzrzQZxRnCaM1FVS5_Uj8lgYpr1eUNyHpuwdrFZrcdpO1RfOi8Ki/exec
```

See [Deployment Guide](Deployment%20Guide.md) for redeploying.
