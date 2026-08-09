/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Tasks.gs
 * Task management: assignable, due-dated tasks linked to records/users.
 * ============================================================
 */

const TASK_SHEET_HEADERS = ['Id', 'RecordRow', 'RecordId', 'Title', 'Description', 'Assignee', 'Status', 'Priority', 'DueDate', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'CompletedAt', 'RowVersion', 'UpdatedBy'];

const TASK_COL = Object.freeze({
  ID: 1,
  RECORD_ROW: 2,
  RECORD_ID: 3,
  TITLE: 4,
  DESCRIPTION: 5,
  ASSIGNEE: 6,
  STATUS: 7,
  PRIORITY: 8,
  DUE_DATE: 9,
  CREATED_BY: 10,
  CREATED_AT: 11,
  UPDATED_AT: 12,
  COMPLETED_AT: 13,
  ROW_VERSION: 14,
  UPDATED_BY: 15
});

const TASK_STATUS = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED'
});

const TASK_PRIORITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
});

function tasksSheet_() {
  const ss = getSpreadsheet_();
  if (!ss) return null;
  let sh = ss.getSheetByName(CONFIG.TASKS.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.TASKS.SHEET_NAME);
    sh.getRange(1, 1, 1, TASK_SHEET_HEADERS.length).setValues([TASK_SHEET_HEADERS]);
    try { sh.setFrozenRows(1); } catch (err) {}
  }
  ensureTaskSchema_(sh);
  try { sh.hideSheet(); } catch (err) {}
  return sh;
}

/** Non-destructive schema migration: appends any missing columns (RowVersion,
 * UpdatedBy) to an existing Tasks sheet so the header row always matches
 * TASK_SHEET_HEADERS. Existing columns/rows/data are never touched. */
function ensureTaskSchema_(sh) {
  if (!sh) return;
  try {
    const existing = sh.getRange(1, 1, 1, TASK_SHEET_HEADERS.length).getValues()[0] || [];
    const present = {};
    for (let i = 0; i < existing.length; i++) present[String(existing[i] || '').trim().toLowerCase()] = i + 1;
    TASK_SHEET_HEADERS.forEach(function (h, idx) {
      if (!present[String(h).toLowerCase()]) sh.getRange(1, idx + 1).setValue(h);
    });
  } catch (err) {}
}

function taskRecordFromRow_(row) {
  return {
    id: String(row[0] || ''),
    recordRow: Number(row[1]) || 0,
    recordId: String(row[2] || ''),
    title: String(row[3] || ''),
    description: String(row[4] || ''),
    assignee: String(row[5] || '').toLowerCase(),
    status: String(row[6] || TASK_STATUS.OPEN),
    priority: String(row[7] || TASK_PRIORITY.MEDIUM),
    dueDate: row[8] ? new Date(row[8]).getTime() : 0,
    createdBy: String(row[9] || '').toLowerCase(),
    createdAt: row[10] ? new Date(row[10]).getTime() : 0,
    updatedAt: row[11] ? new Date(row[11]).getTime() : 0,
    completedAt: row[12] ? new Date(row[12]).getTime() : 0,
    updatedBy: String(row[14] || '').toLowerCase(),
    rowVersion: Number(row[13]) || 1
  };
}

/**
 * Creates a new task. Editor+ required.
 * @param {Object} params { recordRow, recordId, title, description, assignee, priority, dueDate }
 * @param {string} token Session token.
 * @returns {Object} Created task.
 */
function createTask(params, token) {
  const user = requireEditor_(token);
  params = params || {};
  const title = String(params.title || '').trim();
  if (!title) throw new Error('Task title required.');
  const recordRow = Number(params.recordRow) || 0;
  const assignee = String(params.assignee || '').toLowerCase().trim();
  const priority = String(params.priority || TASK_PRIORITY.MEDIUM).toUpperCase();
  const dueDate = params.dueDate ? new Date(params.dueDate) : null;
  if (![TASK_PRIORITY.LOW, TASK_PRIORITY.MEDIUM, TASK_PRIORITY.HIGH, TASK_PRIORITY.URGENT].includes(priority)) {
    throw new Error('Invalid priority.');
  }

  return runWithLock_(function () {
    const sh = tasksSheet_();
    if (!sh) throw new Error('Tasks sheet unavailable.');
    const id = Utilities.getUuid().replace(/-/g, '');
    const now = now_();
    sh.appendRow([
      id,
      recordRow,
      String(params.recordId || ''),
      title,
      String(params.description || ''),
      assignee,
      TASK_STATUS.OPEN,
      priority,
      dueDate ? dueDate : null,
      user.email,
      now,
      now,
      null,
      1,
      user.email
    ]);
    const recipientEmail = assignee || user.email;
    const dueDateStr = dueDate ? ' (due ' + Utilities.formatDate(dueDate, Session.getScriptTimeZone(), 'dd.MM.yyyy') + ')' : '';

    // In-panel notification
    try {
      notify_(recipientEmail, NOTIFICATION_TYPES.USER, 'Task assigned', 'You were assigned: ' + title + dueDateStr, '');
    } catch (err) {}

    // Email notification
    try {
      if (recipientEmail) {
        const subject = '[India Post Dashboard] New task assigned: ' + title;
        const body = 'Hello,\n\n' +
          'A new task has been assigned to you on the India Post Dashboard.\n\n' +
          'Task: ' + title + '\n' +
          (String(params.description || '').trim() ? 'Description: ' + String(params.description || '').trim() + '\n' : '') +
          'Priority: ' + priority + '\n' +
          (dueDate ? 'Due date: ' + Utilities.formatDate(dueDate, Session.getScriptTimeZone(), 'dd.MM.yyyy') + '\n' : '') +
          'Assigned by: ' + user.email + '\n\n' +
          'Please log in to the dashboard to view and update this task.\n\n' +
          '— India Post Dashboard, Circle Office Haryana';
        GmailApp.sendEmail(recipientEmail, subject, body);
      }
    } catch (emailErr) {
      // Email failure is non-critical; log but don't block task creation
      console.error('Task assignment email failed: ' + emailErr.message);
    }
    invalidateCounts_('tasks');
    return taskRecordFromRow_([id, recordRow, String(params.recordId || ''), title, String(params.description || ''), assignee, TASK_STATUS.OPEN, priority, dueDate ? dueDate.getTime() : 0, user.email, now, now, 0, 1, user.email]);
  });
}

/**
 * Updates a task (title, description, assignee, status, priority, dueDate).
 * Editor+ or assignee can update.
 * @param {string} id Task id.
 * @param {Object} fields Fields to update.
 * @param {string} token Session token.
 * @returns {Object} Updated task.
 */
function updateTask(id, fields, token) {
  const user = requireLogin_(token);
  id = String(id || '').trim();
  if (!id) throw new Error('Task id required.');

  return runWithLock_(function () {
    const sh = tasksSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error('Task not found.');
    const values = sh.getRange(2, 1, lastRow - 1, TASK_SHEET_HEADERS.length).getValues();
    let rowIdx = -1;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === id) { rowIdx = i + 2; break; }
    }
    if (rowIdx === -1) throw new Error('Task not found.');

    const existing = taskRecordFromRow_(values[rowIdx - 2]);
    const isAssignee = existing.assignee === user.email;
    const isEditorRole = isEditor(user.email);

    if (!isEditorRole && !isAssignee) throw new Error('Permission denied.');

    const updates = {};
    if ('title' in fields) updates.title = String(fields.title || '').trim();
    if ('description' in fields) updates.description = String(fields.description || '');
    if ('assignee' in fields) {
      if (!isEditorRole) throw new Error('Only editors can reassign tasks.');
      updates.assignee = String(fields.assignee || '').toLowerCase().trim();
    }
    if ('status' in fields) {
      const status = String(fields.status).toUpperCase();
      if (!Object.values(TASK_STATUS).includes(status)) throw new Error('Invalid status.');
      updates.status = status;
    }
    if ('priority' in fields) {
      const priority = String(fields.priority).toUpperCase();
      if (!Object.values(TASK_PRIORITY).includes(priority)) throw new Error('Invalid priority.');
      updates.priority = priority;
    }
    if ('dueDate' in fields) {
      updates.dueDate = fields.dueDate ? new Date(fields.dueDate) : null;
    }

    const now = now_();
    const range = sh.getRange(rowIdx, 1, 1, TASK_SHEET_HEADERS.length);
    const row = range.getValues()[0];
    if (updates.title !== undefined) row[TASK_COL.TITLE - 1] = updates.title;
    if (updates.description !== undefined) row[TASK_COL.DESCRIPTION - 1] = updates.description;
    if (updates.assignee !== undefined) row[TASK_COL.ASSIGNEE - 1] = updates.assignee;
    if (updates.status !== undefined) row[TASK_COL.STATUS - 1] = updates.status;
    if (updates.priority !== undefined) row[TASK_COL.PRIORITY - 1] = updates.priority;
    if (updates.dueDate !== undefined) row[TASK_COL.DUE_DATE - 1] = updates.dueDate;
    row[TASK_COL.UPDATED_AT - 1] = now;
    if (updates.status === TASK_STATUS.DONE && existing.status !== TASK_STATUS.DONE) {
      row[TASK_COL.COMPLETED_AT - 1] = now;
    }
    row[TASK_COL.UPDATED_BY - 1] = user.email;
    row[TASK_COL.ROW_VERSION - 1] = (existing.rowVersion || 1) + 1;
    range.setValues([row]);
    invalidateCounts_('tasks');

    if (updates.assignee && updates.assignee !== existing.assignee) {
      const taskTitle = updates.title || existing.title;
      // In-panel notification
      try { notify_(updates.assignee, NOTIFICATION_TYPES.USER, 'Task reassigned', 'Task "' + taskTitle + '" was reassigned to you.', ''); } catch (err) {}
      // Email notification
      try {
        GmailApp.sendEmail(
          updates.assignee,
          '[India Post Dashboard] Task reassigned to you: ' + taskTitle,
          'Hello,\n\nThe task "' + taskTitle + '" has been reassigned to you by ' + user.email + '.\n\nPlease log in to the dashboard to view and update this task.\n\n— India Post Dashboard, Circle Office Haryana'
        );
      } catch (emailErr) { console.error('Reassign email failed: ' + emailErr.message); }
    }
    if (updates.status && updates.status !== existing.status) {
      // In-panel notification
      try { notify_(existing.assignee, NOTIFICATION_TYPES.USER, 'Task status changed', 'Task "' + existing.title + '" is now ' + updates.status + '.', ''); } catch (err) {}
      // Email notification for completion
      if (updates.status === TASK_STATUS.DONE && existing.assignee) {
        try {
          GmailApp.sendEmail(
            existing.createdBy || existing.assignee,
            '[India Post Dashboard] Task completed: ' + existing.title,
            'Hello,\n\nThe task "' + existing.title + '" assigned to ' + existing.assignee + ' has been marked as completed.\n\n— India Post Dashboard, Circle Office Haryana'
          );
        } catch (emailErr) { console.error('Completion email failed: ' + emailErr.message); }
      }
    }

    return taskRecordFromRow_(row);
  });
}

/**
 * Lists tasks with optional filters.
 * @param {Object} filters { assignee?, status?, recordRow?, recordId? }
 * @param {string} token Session token (login required).
 * @returns {Object[]} Tasks newest-first.
 */
function getTasks(filters, token) {
  requireLogin_(token);
  return readTasksUnchecked_(filters);
}

/** Internal task reader (no auth) used by count endpoints and the public
 * getTasks. Buckets tasks by status/due date for Point 6 counts. */
function readTasksUnchecked_(filters) {
  filters = filters || {};
  const sh = tasksSheet_();
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const out = [];
  if (lastRow < 2) return out;
  const values = sh.getRange(2, 1, lastRow - 1, TASK_SHEET_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const rec = taskRecordFromRow_(values[i]);
    if (filters.assignee && rec.assignee !== String(filters.assignee).toLowerCase()) continue;
    if (filters.status && rec.status !== String(filters.status).toUpperCase()) continue;
    if (filters.recordRow && rec.recordRow !== Number(filters.recordRow)) continue;
    if (filters.recordId && rec.recordId !== String(filters.recordId)) continue;
    out.push(rec);
  }    out.sort(function (a, b) {
    // pending first, then by due date, then newest
    const statusOrder = { OPEN: 0, IN_PROGRESS: 1, DONE: 2, CANCELLED: 3 };
    const sa = statusOrder[a.status] || 99;
    const sb = statusOrder[b.status] || 99;
    if (sa !== sb) return sa - sb;
    if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt - a.createdAt;
  });
  return out;
}

/** Point 6: task counts for the KPI tiles. Reads only the Tasks sheet
 * (server-cached by Counts.js), never full record data. */
function computeTaskCounts_() {
  const tasks = readTasksUnchecked_();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let open = 0;
  let dueToday = 0;
  let overdue = 0;
  let completed = 0;
  tasks.forEach(function (t) {
    if (t.status === TASK_STATUS.DONE) { completed++; return; }
    if (t.status === TASK_STATUS.OPEN || t.status === TASK_STATUS.IN_PROGRESS) open++;
    if (!t.dueDate || t.status === TASK_STATUS.CANCELLED) return;
    const due = new Date(t.dueDate);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diff = Math.round((dueDay - todayStart) / 86400000);
    if (diff === 0) dueToday++;
    else if (diff < 0) overdue++;
  });
  return { open: open, dueToday: dueToday, overdue: overdue, completed: completed, total: tasks.length };
}

/**
 * Deletes a task. Editor+ required.
 * @param {string} id Task id.
 * @param {string} token Session token.
 * @returns {boolean} Success.
 */
function deleteTask(id, token) {
  requireEditor_(token);
  id = String(id || '').trim();
  if (!id) throw new Error('Task id required.');

  return runWithLock_(function () {
    const sh = tasksSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return false;
    const values = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === id) {
        sh.deleteRow(i + 2);
        invalidateCounts_('tasks');
        return true;
      }
    }
    return false;
  });
}

/**
 * Finds a task by ID and returns its row index and record.
 * @param {string} id Task ID.
 * @returns {{rowIdx: number, task: Object}|null} Row index (1-based for sheet) and task record, or null if not found.
 */
function findTaskById_(id) {
  const sh = tasksSheet_();
  if (!sh) return null;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  const values = sh.getRange(2, 1, lastRow - 1, TASK_SHEET_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      return { rowIdx: i + 2, task: taskRecordFromRow_(values[i]) };
    }
  }
  return null;
}

/**
 * Validates a status transition.
 * Allowed: OPEN -> IN_PROGRESS, OPEN -> CANCELLED, IN_PROGRESS -> DONE, IN_PROGRESS -> OPEN, IN_PROGRESS -> CANCELLED, DONE -> OPEN (reopen), CANCELLED -> OPEN
 * Not allowed: DONE -> IN_PROGRESS directly, etc.
 * @param {string} fromStatus Current status.
 * @param {string} toStatus New status.
 * @returns {boolean} Whether transition is allowed.
 */
function isValidTaskStatusTransition_(fromStatus, toStatus) {
  const allowed = {
    OPEN: ['IN_PROGRESS', 'CANCELLED', 'OPEN'],
    IN_PROGRESS: ['DONE', 'OPEN', 'CANCELLED'],
    DONE: ['OPEN'],
    CANCELLED: ['OPEN']
  };
  return allowed[fromStatus] && allowed[fromStatus].indexOf(toStatus) !== -1;
}

/**
 * Partial update of a single task field with optimistic locking.
 * @param {string} id Task ID.
 * @param {string} field Field name to update (status, priority, assignee, dueDate, title, description).
 * @param {any} value New value for the field.
 * @param {number} rowVersion Expected row version for conflict detection.
 * @param {string} idempotencyKey Client-generated idempotency key.
 * @param {string} token Session token.
 * @returns {Object} { success: boolean, task?: Object, conflict?: Object, error?: string }
 */
function updateTaskField(id, field, value, rowVersion, idempotencyKey, token) {
  const user = requireLogin_(token);
  id = String(id || '').trim();
  field = String(field || '').trim();
  if (!id) throw new Error('Task id required.');
  if (!field) throw new Error('Field name required.');
  if (!idempotencyKey) throw new Error('Idempotency key required for partial task updates.');

  // Whitelist of allowed fields
  const allowedFields = ['status', 'priority', 'assignee', 'dueDate', 'title', 'description'];
  if (allowedFields.indexOf(field) === -1) {
    throw new Error('Field not allowed for partial update: ' + field);
  }

  // Validate status value if updating status
  if (field === 'status') {
    const status = String(value || '').toUpperCase();
    if (!Object.values(TASK_STATUS).includes(status)) {
      throw new Error('Invalid status value.');
    }
  }
  if (field === 'priority') {
    const priority = String(value || '').toUpperCase();
    if (!Object.values(TASK_PRIORITY).includes(priority)) {
      throw new Error('Invalid priority value.');
    }
  }
  if (field === 'assignee') {
    // Only editors can reassign
    if (!isEditor(user.email)) {
      throw new Error('Only editors can reassign tasks.');
    }
  }

  return runWithLock_(function () {
    // Idempotency: dedupe identical keys within a 5-min window, replaying the
    // stored result. Conflict responses are NOT cached (they are transient).
    const res = withIdempotency_('task:' + idempotencyKey, 300, function () {
      const sh = tasksSheet_();
      if (!sh) throw new Error('Tasks sheet unavailable.');

      // Find task by stable ID (never by row number)
      const found = findTaskById_(id);
      if (!found) throw new Error('Task not found.');

      const rowIdx = found.rowIdx;
      const existing = found.task;

      // Row version conflict check
      if (rowVersion !== undefined && rowVersion !== null && Number(rowVersion) !== existing.rowVersion) {
        // Conflict - return latest task data for client to reconcile
        return {
          success: false,
          conflict: {
            expectedVersion: Number(rowVersion),
            actualVersion: existing.rowVersion,
            latestTask: existing
          }
        };
      }

      // Permission: editors may update any task; other users only the tasks
      // assigned to them (matches updateTask semantics).
      const isAssignee = existing.assignee === user.email;
      if (!isEditor(user.email) && !isAssignee) throw new Error('Permission denied.');

      // Validate status transition
      if (field === 'status') {
        const newStatus = String(value || '').toUpperCase();
        if (!isValidTaskStatusTransition_(existing.status, newStatus)) {
          throw new Error('Invalid status transition from ' + existing.status + ' to ' + newStatus);
        }
      }

      const now = now_();
      const range = sh.getRange(rowIdx, 1, 1, TASK_SHEET_HEADERS.length);
      const row = range.getValues()[0];
      const newRowVersion = (existing.rowVersion || 1) + 1;

      // Apply the field update (only the changed column is written)
      switch (field) {
        case 'status':
          row[TASK_COL.STATUS - 1] = String(value || '').toUpperCase();
          if (String(value || '').toUpperCase() === TASK_STATUS.DONE && existing.status !== TASK_STATUS.DONE) {
            row[TASK_COL.COMPLETED_AT - 1] = now;
          }
          break;
        case 'priority':
          row[TASK_COL.PRIORITY - 1] = String(value || '').toUpperCase();
          break;
        case 'assignee':
          row[TASK_COL.ASSIGNEE - 1] = String(value || '').toLowerCase().trim();
          break;
        case 'dueDate':
          row[TASK_COL.DUE_DATE - 1] = value ? new Date(value) : null;
          break;
        case 'title':
          row[TASK_COL.TITLE - 1] = String(value || '').trim();
          break;
        case 'description':
          row[TASK_COL.DESCRIPTION - 1] = String(value || '');
          break;
      }

      row[TASK_COL.UPDATED_AT - 1] = now;
      row[TASK_COL.UPDATED_BY - 1] = user.email;
      row[TASK_COL.ROW_VERSION - 1] = newRowVersion;

      range.setValues([row]);

      // Build updated task object
      const updatedTask = taskRecordFromRow_(row);
      updatedTask.rowVersion = newRowVersion;

      // Audit log
      try {
        logAudit_(ACTIONS.UPDATE, '', 'Task field ' + field + ' updated: ' + id, user.email);
      } catch (err) {}

      // Notifications for status change
      if (field === 'status' && updatedTask.status !== existing.status) {
        const recipient = updatedTask.assignee || user.email;
        try {
          notify_(recipient, NOTIFICATION_TYPES.USER, 'Task status changed', 'Task "' + updatedTask.title + '" is now ' + updatedTask.status + '.', '');
        } catch (err) {}
        if (updatedTask.status === TASK_STATUS.DONE && updatedTask.assignee) {
          try {
            GmailApp.sendEmail(
              updatedTask.createdBy || updatedTask.assignee,
              '[India Post Dashboard] Task completed: ' + updatedTask.title,
              'Hello,\n\nThe task "' + updatedTask.title + '" assigned to ' + updatedTask.assignee + ' has been marked as completed.\n\n— India Post Dashboard, Circle Office Haryana'
            );
          } catch (emailErr) { console.error('Completion email failed: ' + emailErr.message); }
        }
      }

      // Notification for reassignment
      if (field === 'assignee' && updatedTask.assignee !== existing.assignee) {
        try {
          notify_(updatedTask.assignee, NOTIFICATION_TYPES.USER, 'Task reassigned', 'Task "' + updatedTask.title + '" was reassigned to you.', '');
        } catch (err) {}
      }

      invalidateCounts_('tasks');
      return { success: true, task: updatedTask };
    }, function (result) {
      // Cache only successful mutations — conflicts are transient.
      return !!result && result.success === true;
    });

    if (res.idempotent) {
      return { success: true, idempotent: true, task: res.result.task };
    }
    return res.result;
  });
}

/**
 * Gets tasks assigned to the current user (my tasks).
 * @param {string} token Session token.
 * @returns {Object[]} Tasks.
 */
function getMyTasks(token) {
  const user = requireLogin_(token);
  return getTasks({ assignee: user.email }, token);
}
