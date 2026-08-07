/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Tasks.gs
 * Task management: assignable, due-dated tasks linked to records/users.
 * ============================================================
 */

const TASK_SHEET_HEADERS = ['Id', 'RecordRow', 'RecordId', 'Title', 'Description', 'Assignee', 'Status', 'Priority', 'DueDate', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'CompletedAt'];

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
  COMPLETED_AT: 13
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
  try { sh.hideSheet(); } catch (err) {}
  return sh;
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
    completedAt: row[12] ? new Date(row[12]).getTime() : 0
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
      null
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
    return taskRecordFromRow_([id, recordRow, String(params.recordId || ''), title, String(params.description || ''), assignee, TASK_STATUS.OPEN, priority, dueDate ? dueDate.getTime() : 0, user.email, now, now, 0]);
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
    range.setValues([row]);

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
  }
  out.sort(function (a, b) {
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
        return true;
      }
    }
    return false;
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
