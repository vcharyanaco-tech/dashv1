# India Post Dashboard

A modern Google Apps Script dashboard for Circle Office Haryana, built with responsive UI, view-only and admin modes, audit logging, reporting, and Google Sheets integration.

## Features

- 🇮🇳 India Post branding
- 📱 Responsive mobile layout
- 🌙 Dark mode toggle
- 🔐 Admin-only editing for `vcharyanaco@gmail.com`
- 👀 Read-only viewer mode for other users
- 📊 Analytics dashboard summary
- 📄 Export reports to Google Sheets or PDF, plus print support
- 📜 Audit log with history of operations
- ⚙️ Settings panel to update app metadata
- 🔗 Hyperlink-aware action field rendering
- ⚡ Optimized data fetch and rendering
- 🎨 Modern card-based UI while preserving existing app structure

## Files

Backend
- `Code.gs` / `code.js`
- `Auth.js`
- `Data.js`
- `Audit.js`
- `Reports.js`
- `Settings.js`
- `Utils.js`

Frontend
- `index.html`
- `styles.html`
- `script.html`
- `ReportPdf.html`

Documentation
- `README.md`
- `Deployment Guide.md`
- `Admin Guide.md`
- `Change Log.md`

## Deployment

After editing, open the Apps Script project and deploy the web app. The deployment is configured for `ANYONE_ANONYMOUS` access with `USER_DEPLOYING` execution.
