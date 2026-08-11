# Admin Guide

This guide covers everything an **admin** can do in the India Post Dashboard.
Roles and capabilities:

| Capability                                        | Viewer | Editor | Admin |
| ------------------------------------------------- | :----: | :----: | :---: |
| View dashboard, filter, search, sort             |  Yes   |  Yes   |  Yes  |
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
   setup. The bootstrap password is stored in **Script Properties** under
   `ADMIN_BOOTSTRAP_PASSWORD` (set it with `setAdminBootstrapPassword` or in the
   Apps Script editor). If it was never set, a random password is generated on
   first run, persisted to Script Properties, and emailed to the admin.
3. You will be forced to choose a new password before the dashboard loads.
   Change it again any time under **Settings → Change password**.

To rotate the admin password later (including invalidating all active
sessions), follow the [bootstrap password rotation runbook](runbooks/bootstrap-password-rotation.md).

## Managing users (Settings → Users)

- **Add a user** — enter an email address, choose a role
  (`Viewer`, `Editor`, or `Admin`), and set an initial password (min. 8
  characters). The user is created immediately.
- **Reset a password** — click **Reset password** next to a user and provide a new
  one; the user can then sign in with it.
- **Sign a user out everywhere** — `ApiService.adminKillUserSessions(email)`
  (admin only, e.g. from the browser console) invalidates all of that user's
  sessions without changing their password; they must sign in again on every
  device.
- **Delete a user** — click **Delete** and confirm. You cannot delete your own
  account or the primary admin account.
- Users can always reset their own password from the sign-in screen via
  **Forgot password** (a link is emailed to them, valid 30 minutes).

## Working with records (Dashboard)

- **Filter** — use the sector filter dropdown and the search box to narrow the
  cards. Applying a filter resets you to page 1.
- **Sort** — use the **Sort by** dropdown (Entry Date, Review Date, ID) and the
  up/down direction toggle to reorder the cards. Changing the sort also resets to
  page 1.
- **Add** — click **Add record** to open the form; save to append a new row.
- **Edit** — open a record and click **Edit**, change fields, then **Save**. The
  edited card is brought into view automatically.
- **Delete** — click **Delete** and confirm. IDs are renumbered automatically.
- **Mark review done** — open a record, use the review-due arrow, and choose
  **Mark as done**. This turns the review badge green and logs the action.
- Records whose review date is due are shown with a red **Review due** badge;
  the flag colour comes from the review-date cell background in the sheet.
- **Pagination** — the dashboard loads a page at a time with infinite scroll;
  your current page is preserved across refresh and search results.

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

## Measuring speed before/after a deploy

When a deploy includes performance work, record the numbers **before** the
deploy and again **after** so the gains are visible instead of guessed at.
Use the same browser, network, and data volume both times, and take the
median of 2–3 runs (the first GAS call of a session includes a cold start).

**Login time**

1. Sign out, then open DevTools → **Network** (F12) and keep it open.
2. Sign in and note the total time of the `login` request (the dashboard
   becomes usable once the following `getAppData` request also returns —
   include both if you want the full sign-in path).
3. **Run it twice**: the first login after a deploy still verifies the
   stored password hash with the *old* PBKDF2 iteration count and re-hashes
   it to the new setting, so it is slower than steady state. The **second**
   login is the number to compare — it should be roughly 3× faster than
   before for the re-hash alone.
4. A session lasts 6 hours; after that, login runs again at this cost.

**Bulk import (Settings → Users → import CSV)**

1. In DevTools → **Network**, find the `adminImportUsers` request that the
   import button fires, or time it from the browser console:

   ```js
   const t0 = performance.now();
   await ApiService.adminImportUsers(csvText);
   console.log('import took', (performance.now() - t0).toFixed(0), 'ms');
   ```

2. Import the **same CSV** before and after the deploy so the comparison is
   fair (same sheet size, same browser).
3. What to expect: imports used to re-read the Users sheet and bump the
   cache generation several times **per row**; they now read the sheet once
   and co-write every change into the cached payload under the same
   generation key, so rows in the middle of a large CSV hit the cache
   instead of the spreadsheet. Larger CSVs show the biggest difference.

**General notes**

- Compare like-for-like: same browser, same network, same data volume, and
  a median of 2–3 runs — GAS cold starts make the first call noisy.
- Server-side gains (login, imports, cached Tasks/Submissions reads) are
  visible on the first load after deploy. If the client bundle was rebuilt,
  do a hard refresh (**Ctrl+Shift+R**) so the cache-busted assets load.

## Troubleshooting

- **"Login required"** — your session expired (after 6 hours); sign in again.
- **"Too many failed attempts"** — the account is temporarily locked for 15
  minutes after 5 failed logins.
- **"This submission was locked by an admin…"** — only an admin can change it.
- **Deleted a user by mistake?** — re-add them from **Settings → Users**.
