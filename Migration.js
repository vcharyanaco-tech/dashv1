/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Migration.gs
 * Admin-only, non-destructive schema migration for stable IDs and row
 * versioning (Point 8). DRY-RUN BY DEFAULT:
 *   adminMigrateStableIds('dry', token) — reports what WOULD change
 *   adminMigrateStableIds('run', token) — applies the changes
 * Existing columns/rows/data are never deleted or reordered; only missing
 * header cells are appended and empty ID / RowVersion cells are backfilled.
 *
 * The records sheet (Sheet1) is intentionally untouched: its auto-increment
 * IDs are referenced by Task.RecordRow, Submission.CardRow and
 * Document.RecordRow and are re-sequenced on delete by the existing design.
 * ============================================================
 */

/**
 * Backfills missing stable-ID / RowVersion columns for Tasks, Submissions,
 * Notifications, Documents and Users.
 * @param {string} mode 'run' applies changes; anything else dry-runs.
 * @param {string=} token Session token (admin required). When omitted (e.g.
 *   invoked directly from the Apps Script editor), the active user's identity
 *   is used instead — same admin gate, no token plumbing needed.
 * @returns {Object} Migration report.
 */
function adminMigrateStableIds(mode, token) {
  const admin = resolveAdminIdentity_(token);
  const dryRun = String(mode || '').toLowerCase() !== 'run';
  const report = {
    dryRun: dryRun,
    triggeredBy: admin.email,
    startedAt: new Date(),
    entities: [],
    summary: {}
  };

  runWithLock_(function () {
    report.entities.push(migrateTasks_(dryRun));
    report.entities.push(migrateSubmissions_(dryRun));
    report.entities.push(migrateNotifications_(dryRun));
    report.entities.push(migrateDocuments_(dryRun));
    report.entities.push(migrateUsers_(dryRun));
  });

  const totals = { columnsAdded: 0, rowsBackfilled: 0, idsGenerated: 0 };
  report.entities.forEach(function (e) {
    totals.columnsAdded += e.columnsAdded || 0;
    totals.rowsBackfilled += e.rowsBackfilled || 0;
    totals.idsGenerated += e.idsGenerated || 0;
  });
  report.summary = totals;
  report.finishedAt = new Date();
  return report;
}

/** Admin gate that works with a session token OR the active user when run
 *  directly from the Apps Script editor (no token available).
 *
 *  SECURITY: only Session.getActiveUser() is trusted here. The web app is
 *  deployed ANYONE_ANONYMOUS + USER_DEPLOYING, so Session.getEffectiveUser()
 *  always returns the deploying user (the bootstrap admin) even for anonymous
 *  callers — using it would let anyone POST this route with an empty token and
 *  escalate to admin. getActiveUser() returns "" for anonymous web-app calls
 *  and the real editor account when run from the editor, so the admin gate
 *  holds in both contexts. */
function resolveAdminIdentity_(token) {
  if (token) return requireAdmin_(token);
  const email = String(getCurrentUser() || '').toLowerCase().trim();
  if (!email || !isAdmin(email)) throw clientError_('Admin permission required.');
  return { email: email };
}

/** Backfills RowVersion for the Tasks sheet (headers ensured by
 * ensureTaskSchema_ via tasksSheet_()). */
function migrateTasks_(dryRun) {
  const out = { entity: 'Tasks', columnsAdded: 0, rowsBackfilled: 0, idsGenerated: 0, notes: ['Ids already present; RowVersion/UpdatedBy columns ensured'] };
  const sh = tasksSheet_();
  if (!sh) { out.notes = ['sheet unavailable']; return out; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return out;
  const range = sh.getRange(2, TASK_COL.ROW_VERSION, lastRow - 1, 1);
  const vals = range.getValues();
  let need = 0;
  vals.forEach(function (r) { if (r[0] === '' || r[0] === null || r[0] === undefined) need++; });
  if (need && !dryRun) {
    vals.forEach(function (r) { if (r[0] === '' || r[0] === null || r[0] === undefined) r[0] = 1; });
    range.setValues(vals);
  }
  out.rowsBackfilled = need;
  return out;
}

/** Backfills RowVersion for the Submissions sheet. */
function migrateSubmissions_(dryRun) {
  const out = { entity: 'Submissions', columnsAdded: 0, rowsBackfilled: 0, idsGenerated: 0, notes: ['Ids already present; RowVersion/UpdatedBy columns ensured'] };
  const sh = submissionsSheet_();
  if (!sh) { out.notes = ['sheet unavailable']; return out; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return out;
  const range = sh.getRange(2, SUBMISSION_COL.ROW_VERSION, lastRow - 1, 1);
  const vals = range.getValues();
  let need = 0;
  vals.forEach(function (r) { if (r[0] === '' || r[0] === null || r[0] === undefined) need++; });
  if (need && !dryRun) {
    vals.forEach(function (r) { if (r[0] === '' || r[0] === null || r[0] === undefined) r[0] = 1; });
    range.setValues(vals);
  }
  out.rowsBackfilled = need;
  return out;
}

/** Backfills empty Id cells for the Notifications sheet with NOTIF- ids.
 *  Existing IDs are never changed; freshly generated IDs are checked against
 *  every existing + newly generated ID so the sheet stays collision-free. */
function migrateNotifications_(dryRun) {
  const out = { entity: 'Notifications', columnsAdded: 0, rowsBackfilled: 0, idsGenerated: 0, notes: [] };
  const sh = notificationsSheet_();
  if (!sh) { out.notes = ['sheet unavailable']; return out; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return out;
  const range = sh.getRange(2, NOTIFICATION_COL.ID, lastRow - 1, 1);
  const vals = range.getValues();
  const seen = {};
  vals.forEach(function (r) {
    const v = String(r[0] || '').trim();
    if (v) seen[v] = true;
  });
  const ids = [];
  let need = 0;
  vals.forEach(function (r) {
    if (String(r[0] || '').trim() === '') {
      let nid;
      do { nid = newEntityId_('NOTIF'); } while (seen[nid]);
      seen[nid] = true;
      ids.push([nid]);
      need++;
    } else ids.push([r[0]]);
  });
  if (need && !dryRun) range.setValues(ids);
  out.rowsBackfilled = need;
  out.idsGenerated = need;
  out.notes.push(need ? 'Generated NOTIF- ids for ' + need + ' row(s)' : 'All rows already have Ids');
  return out;
}

/** Backfills empty Id cells for the Documents sheet with DOC- ids.
 *  Existing IDs are never changed; freshly generated IDs are checked against
 *  every existing + newly generated ID so the sheet stays collision-free. */
function migrateDocuments_(dryRun) {
  const out = { entity: 'Documents', columnsAdded: 0, rowsBackfilled: 0, idsGenerated: 0, notes: [] };
  const sh = documentsSheet_();
  if (!sh) { out.notes = ['sheet unavailable']; return out; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return out;
  const range = sh.getRange(2, DOC_COL.ID, lastRow - 1, 1);
  const vals = range.getValues();
  const seen = {};
  vals.forEach(function (r) {
    const v = String(r[0] || '').trim();
    if (v) seen[v] = true;
  });
  const ids = [];
  let need = 0;
  vals.forEach(function (r) {
    if (String(r[0] || '').trim() === '') {
      let nid;
      do { nid = newEntityId_('DOC'); } while (seen[nid]);
      seen[nid] = true;
      ids.push([nid]);
      need++;
    } else ids.push([r[0]]);
  });
  if (need && !dryRun) range.setValues(ids);
  out.rowsBackfilled = need;
  out.idsGenerated = need;
  out.notes.push(need ? 'Generated DOC- ids for ' + need + ' row(s)' : 'All rows already have Ids');
  return out;
}

/** Adds the Id column (if missing) and backfills USER- ids for the Users sheet.
 *  Existing IDs are never changed; freshly generated IDs are checked against
 *  every existing + newly generated ID so the sheet stays collision-free. */
function migrateUsers_(dryRun) {
  const out = { entity: 'Users', columnsAdded: 0, rowsBackfilled: 0, idsGenerated: 0, notes: [] };
  const sh = usersSheet_(); // ensures headers incl. new Id column
  if (!sh) { out.notes = ['sheet unavailable']; return out; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return out;
  const range = sh.getRange(2, USER_COL.ID, lastRow - 1, 1);
  const vals = range.getValues();
  const seen = {};
  vals.forEach(function (r) {
    const v = String(r[0] || '').trim();
    if (v) seen[v] = true;
  });
  const ids = [];
  let need = 0;
  vals.forEach(function (r) {
    if (String(r[0] || '').trim() === '') {
      let nid;
      do { nid = newEntityId_('USER'); } while (seen[nid]);
      seen[nid] = true;
      ids.push([nid]);
      need++;
    } else ids.push([r[0]]);
  });
  if (need && !dryRun) range.setValues(ids);
  out.rowsBackfilled = need;
  out.idsGenerated = need;
  out.notes.push(need ? 'Generated USER- ids for ' + need + ' row(s)' : 'All rows already have Ids');
  return out;
}
