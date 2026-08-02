# Admin Guide

This guide covers everything an **admin** can do in the India Post Dashboard.
Roles and capabilities:

| Capability                                        | Viewer | Editor | Admin |
| ------------------------------------------------- | :----: | :----: | :---: |
| View dashboard, filter, search                    |  Yes   |  Yes   |  Yes  |
| Submit updates against records                    |  Yes   |  Yes   |  Yes  |
| Edit / lock / unlock submissions                 |   –    |  Yes*  |  Yes  |
| Add, edit, delete records                        |   –    |  Yes   |  Yes  |
| Mark a review as done                            |   –    |   –    |  Yes  |
| Display submissions on cards                     |   –    |   –    |  Yes  |
| Delete submissions                               |   –    |   –    |  Yes  |
| Manage users (add / delete / reset passwords)    |   –    |   –    |  Yes  |
| Delete / clear audit log entries                 |   –    |   –    |  Yes  |

\* Editors cannot edit a submission locked by an admin.

## First login

1. Open the dashboard URL (see the [Deployment Guide](Deployment%20Guide.md)).
2. Sign in with `vcharyanaco@gmail.com` and the initial password supplied during
   setup (`Admin@123` by default).
3. You will be forced to choose a new password before the dashboard loads.
   Change it again any time under **Settings → Change password**.

## Managing users (Settings → Users)

- **Add a user** — enter an email address, choose a role
  (`Viewer`, `Editor`, or `Admin`), and set an initial password (min. 8
  characters). The user is created immediately.
- **Reset a password** — click **Reset password** next to a user and provide a new
  one; the user can then sign in with it.
- **Delete a user** — click **Delete** and confirm. You cannot delete your own
  account or the primary admin account.
- Users can always reset their own password from the sign-in screen via
  **Forgot password** (a link is emailed to them, valid 30 minutes).

## Working with records (Dashboard)

- **Add** — click **Add record** to open the form; save to append a new row.
- **Edit** — open a record and click **Edit**, change fields, then **Save**.
- **Delete** — click **Delete** and confirm. IDs are renumbered automatically.
- **Mark review done** — open a record, use the review-due arrow, and choose
  **Mark as done**. This turns the review badge green and logs the action.
- Records whose review date is due are shown with a red **Review due** badge;
  the flag colour comes from the review-date cell background in the sheet.

## Submissions

Each record can have an update thread. The button on a card shows the number of
submissions, with a blue **NEW** flash for anything added in the last 24 hours.

- Open a record and click the submissions count button.
- As an admin you can:
  - **Lock / Unlock** — a locked submission can only be changed by an admin.
  - **Delete** — permanently removes the submission.
  - **Display** — toggle the eye icon to show the submission text directly on the
    card for all viewers.
- Editors can edit/lock/unlock unlocked submissions; viewers can only edit their
  own submissions.

## Audit log (Audit tab)

Shows the newest 80 events (timestamp, user, action, record ID, details).

- **Sort** by clicking any column header.
- **Export** — copy to clipboard or download as CSV.
- **Print** — opens a dedicated print layout for the audit log.
- **Delete entries** — tick individual rows or **Select all**, then click
  **Delete selected**.
- **Clear log** — click **Clear log** to delete every entry.
- Deleting or clearing is itself logged (so the log records its own maintenance).

## Reports (Reports tab)

- Preview the full report, then **Download CSV**, **Download Excel (XLSX)**, or
  **Download PDF**.
- **Print report** opens a dedicated A4 landscape print layout.
- The XLSX export is generated server-side and requires no Drive permissions for
  the end user.

## Troubleshooting

- **"Login required"** — your session expired (after 6 hours); sign in again.
- **"Too many failed attempts"** — the account is temporarily locked for 15
  minutes after 5 failed logins.
- **"This submission was locked by an admin…"** — only an admin can change it.
- **Deleted a user by mistake?** — re-add them from **Settings → Users**.
