# Change Log

## 1.0.0 — 2026-08-02 (current)

Major refresh and stabilization of the India Post Dashboard for Circle Office, Haryana.

### Auth, roles & users
- Optimized login and app-load performance.
- Editors get full edit/delete access (previously admin-only).
- Bootstrap admin (`vcharyanaco@gmail.com`, initial password `Admin@123`) with forced
  change on first login.
- Admin user management: add/delete users, reset passwords, assign `VIEWER` /
  `EDITOR` / `ADMIN` roles.
- Password reset by email (30-minute expiry), 5-attempt login lockout (15 minutes),
  6-hour session tokens, salted SHA-256 password hashing (500 iterations).

### Records & review workflow
- "Review due" / "Review done" badges derived from review-date cell backgrounds;
  admins can mark a review as done.
- Added record dedupe of the ID field on dashboard cards.
- Fixes to Excel/PDF export conversion.
- Sidebar backdrop/grid overflow fix in the redesigned shell.

### Submissions
- Viewers can submit updates against records; count shown on each card button.
- 24-hour "new" flash on the submission badge counter; badge uses the blue accent
  with a theme-adaptive flash ring.
- Admin lock/unlock/delete for submissions; admin locks block editor edits.
- Admin "display" toggle shows selected submissions directly on the cards.
- Removed the redundant "My submissions" card button.

### Audit log
- Admin can select and delete audit rows (or all) and clear the entire log.
- Sortable columns; export to CSV; copy to clipboard.
- Dedicated print layout for the audit log (A4 portrait).

### Reports & printing
- Reliable Excel export with an in-memory `.xlsx` fallback that needs no Drive scope.
- Full report preview plus CSV/XLSX/PDF export.
- Dedicated print layout for the report (A4 landscape).

### UI & branding
- Enterprise redesign: new UI shell, design system, and rewritten client
  (`index.html`, `styles.html`, `script.html`).
- Homepage stat cards in a single row with refined typography.
- Official Dak Sewa Jan Sewa logo (PNG with transparency) in the sidebar, splash
  screen, About dialog, and favicon.
- Version 1.0.0 chip and footer branding ("Dashboard Haryana Circle";
  "Designed, developed and maintained by Circle Office, Haryana").
- Removed the obsolete "Application settings" card; settings tab now covers
  password change and user management only.

---

## 3.1 — Legacy refresh (previous release)

- Added India Post branding and responsive mobile UI.
- Added dark mode toggle.
- Admin-only editing for `vcharyanaco@gmail.com`.
- Viewer mode for read-only access.
- Added analytics and audit log tabs.
- Added report export to Google Sheets and PDF.
- Added settings page and update persistence.
- Preserved existing dashboard data access and sheet integration.
