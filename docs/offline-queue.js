/*
 * OfflineQueue - PWA offline action queue for the India Post Dashboard.
 * Loaded AFTER app.js so the original global apiCall_ can be captured and
 * wrapped. Mutating calls made while offline are queued in localStorage and
 * replayed FIFO when the connection returns. Read-only calls pass through
 * unchanged. Also registers the service worker (sw.js).
 *
 * Point 9 — every queued mutation carries a one-time idempotency key
 * (generated when the action is first queued and persisted with the item),
 * a retry budget with exponential backoff, and a status lifecycle:
 *   PENDING -> SYNCING -> (removed on success | CONFLICT | FAILED)
 * Optimistic-lock conflicts returned by the server are marked CONFLICT and
 * surfaced to the user instead of being dropped, blindly overwritten, or
 * retried forever.
 */
(function () {
  'use strict';

  var QUEUE_KEY = 'ipd_offline_queue_v2';
  var LEGACY_KEY = 'ipd_offline_queue_v1';
  var MAX_QUEUE = 200;
  var MAX_RETRIES = 5;
  // Automatic-retry backoff (ms), indexed by retryCount.
  var RETRY_DELAYS = [0, 2000, 5000, 15000, 60000];

  var MUTATIONS = {
    addItem: true, updateItem: true, deleteItem: true, markReviewDone: true,
    markReviewNotDone: true,
    changePassword: true,
    adminAddUser: true, adminUpdateUser: true, adminDeleteUser: true,
    adminResetPassword: true, adminImportUsers: true, adminEmailAllUsers: true,
    markNotificationsRead: true, clearMyNotifications: true,
    createTask: true, updateTask: true, updateTaskField: true, deleteTask: true,
    saveDashboardPreferences: true,
    addSubmission: true, updateSubmission: true, deleteSubmission: true,
    lockSubmission: true, unlockSubmission: true, toggleSubmissionDisplay: true,
    uploadDocument: true, deleteDocument: true,
    adminDeleteAuditRows: true, adminClearAudit: true,
    exportToSpreadsheet: true
  };

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function inferEntityId_(fn, args) {
    if (fn === 'updateTaskField' || fn === 'updateTask' || fn === 'deleteTask') {
      return args && args[0] != null ? String(args[0]) : null;
    }
    if (fn === 'addSubmission' || fn === 'updateSubmission' || fn === 'deleteSubmission') {
      return args && args[0] != null ? String(args[0]) : null;
    }
    if (fn === 'deleteDocument') return args && args[0] != null ? String(args[0]) : null;
    return null;
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null');
      if (raw && raw.length !== undefined) return raw;
    } catch (e) {}
    // First run on the new schema: migrate legacy v1 items ({fn,args,ts}) and
    // give each a freshly generated idempotency key.
    var legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch (e2) {}
    if (legacy.length) {
      var migrated = legacy.map(function (it) {
        return {
          queueItemId: uuid(),
          fn: it.fn,
          args: it.args || [],
          entityType: null,
          entityId: inferEntityId_(it.fn, it.args),
          rowVersion: null,
          idempotencyKey: uuid(),
          createdAt: it.ts || Date.now(),
          retryCount: 0,
          status: 'PENDING',
          lastError: null
        };
      });
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(migrated)); } catch (e3) {}
      try { localStorage.removeItem(LEGACY_KEY); } catch (e4) {}
      return migrated;
    }
    return [];
  }

  function save(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  }

  function pending() {
    return load().filter(function (i) { return i.status === 'PENDING' || i.status === 'SYNCING'; }).length;
  }

  function emit(name, detail) {
    try {
      if (window.EventBus) window.EventBus.emit(name, detail);
    } catch (e) {}
  }

  /* Sync-status UI: reflects offline/pending/syncing/conflict/failed in the
   * offline banner label. app.js's updateOfflineBanner shows the banner while
   * needsAttention() is true, so pending changes stay visible when online. */
  function renderQueueStatus() {
    var label = document.getElementById('offlineLabel');
    if (!label) return;
    var q = load();
    var nPending = 0, nConflict = 0, nFailed = 0;
    q.forEach(function (i) {
      if (i.status === 'PENDING' || i.status === 'SYNCING') nPending++;
      else if (i.status === 'CONFLICT') nConflict++;
      else if (i.status === 'FAILED') nFailed++;
    });
    var text;
    if (navigator.onLine === false) {
      text = nPending
        ? 'You are offline. ' + nPending + ' queued action(s) will sync when you reconnect.'
        : 'You appear to be offline. Some actions may not work until your connection returns.';
    } else if (nPending) {
      text = nPending + ' change(s) waiting to sync…';
    } else if (nConflict || nFailed) {
      text = (nConflict ? nConflict + ' sync conflict(s)' : '') +
        (nConflict && nFailed ? ', ' : '') +
        (nFailed ? nFailed + ' failed item(s)' : '') +
        ' need attention.';
    } else {
      text = 'All changes synced.';
    }
    label.textContent = text;
  }

  /**
   * Queues a mutation. Supports two call shapes:
   *   enqueue('updateTask', [id, fields, token])
   *   enqueue('updateTaskField', { args, entityType, entityId, rowVersion })
   * The idempotencyKey is generated ONCE here (or taken from opts) and
   * persisted with the item, so replays/retries can never double-apply.
   */
  function enqueue(fn, argsOrOpts) {
    var opts = Array.isArray(argsOrOpts) ? { args: argsOrOpts } : (argsOrOpts || {});
    var q = load();
    var item = {
      queueItemId: opts.queueItemId || uuid(),
      fn: fn,
      args: opts.args || [],
      entityType: opts.entityType || null,
      entityId: opts.entityId || inferEntityId_(fn, opts.args),
      rowVersion: opts.rowVersion != null ? opts.rowVersion : null,
      idempotencyKey: opts.idempotencyKey || uuid(),
      createdAt: Date.now(),
      retryCount: 0,
      status: 'PENDING',
      lastError: null
    };
    // Dedupe: an identical idempotency key already queued — don't enqueue twice.
    var dup = q.some(function (i) { return i.idempotencyKey === item.idempotencyKey; });
    if (!dup) {
      q.push(item);
      if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
      save(q);
    }
    renderQueueStatus();
    emit('OfflineQueueChange', { pending: pending(), status: 'PENDING' });
    return Promise.resolve({ queued: !dup, pending: pending() });
  }

  function remove(item) {
    var q = load();
    var i = q.indexOf(item);
    if (i !== -1) { q.splice(i, 1); save(q); }
    return q.length;
  }

  /* Replays one item. Success removes it; a server conflict marks it CONFLICT;
   * network/server errors increment retryCount (FAILED past MAX_RETRIES). */
  function replayOne(item) {
    var q = load();
    var live = null;
    for (var k = 0; k < q.length; k++) {
      if (q[k].queueItemId === item.queueItemId) { live = q[k]; break; }
    }
    if (!live) return Promise.resolve({ kind: 'removed' });
    live.status = 'SYNCING';
    save(q);
    return realApiCall.apply(null, [live.fn].concat(live.args || [])).then(function (res) {
      if (res && res.conflict) {
        // Optimistic-lock conflict: do NOT overwrite newer data.
        live.status = 'CONFLICT';
        live.lastError = 'Conflict with newer data on the server.';
        live.retryCount++;
        save(load());
        renderQueueStatus();
        emit('OfflineQueueChange', { pending: pending(), status: 'CONFLICT', entityId: live.entityId });
        return { kind: 'conflict' };
      }
      remove(live);
      renderQueueStatus();
      return { kind: 'flushed' };
    }, function (err) {
      live.retryCount++;
      live.lastError = (err && err.message) ? err.message : String(err);
      live.status = live.retryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING';
      save(load());
      renderQueueStatus();
      return { kind: 'failed' };
    });
  }

  /** Replays every retryable item in order. Items are never silently
   *  dropped: successes are removed; conflicts/terminal failures remain
   *  visible in the sync-status banner. */
  function flush() {
    var q = load();
    var targets = q.filter(function (i) {
      return i.status === 'PENDING' || i.status === 'SYNCING';
    });
    if (!targets.length) {
      renderQueueStatus();
      return Promise.resolve({ flushed: 0, failed: 0, conflict: 0, pending: pending() });
    }
    var results = { flushed: 0, failed: 0, conflict: 0, pending: pending() };
    var chain = Promise.resolve();
    targets.forEach(function (item) {
      chain = chain.then(function () {
        return replayOne(item);
      }).then(function (out) {
        if (!out) return;
        if (out.kind === 'flushed') results.flushed++;
        else if (out.kind === 'conflict') results.conflict++;
        else if (out.kind === 'failed') results.failed++;
        emit('OfflineQueueChange', { pending: pending(), status: out.kind });
      }, function () {});
    });
    return chain.then(function () {
      results.pending = pending();
      renderQueueStatus();
      emit('OfflineQueueFlushed', results);
      scheduleBackoffRetry();
      return results;
    });
  }

  var backoffTimer = null;
  /* Re-syncs remaining PENDING items after a delay that grows with retries. */
  function scheduleBackoffRetry() {
    if (backoffTimer) { clearTimeout(backoffTimer); backoffTimer = null; }
    if (navigator.onLine === false) return;
    var q = load();
    var retryable = q.filter(function (i) { return i.status === 'PENDING'; });
    if (!retryable.length) return;
    var minRetry = MAX_RETRIES;
    retryable.forEach(function (i) { if (i.retryCount < minRetry) minRetry = i.retryCount; });
    var delay = RETRY_DELAYS[Math.min(minRetry, RETRY_DELAYS.length - 1)];
    if (delay <= 0) delay = 2000;
    backoffTimer = setTimeout(function () {
      backoffTimer = null;
      if (navigator.onLine === false) return;
      flush();
    }, delay);
  }

  /* True when the user should see the sync banner (pending or problem items). */
  function needsAttention() {
    var q = load();
    return q.some(function (i) {
      return i.status === 'PENDING' || i.status === 'SYNCING' ||
        i.status === 'CONFLICT' || i.status === 'FAILED';
    });
  }

  /* Clears the queue (used on logout — queued mutations belong to a session
   * and must never be replayed under a different identity). */
  function clear() {
    try { localStorage.removeItem(QUEUE_KEY); } catch (e) {}
    try { localStorage.removeItem(LEGACY_KEY); } catch (e) {}
    renderQueueStatus();
    emit('OfflineQueueChange', { pending: 0, status: 'CLEARED' });
  }

  function status() {
    var q = load();
    var out = { pending: 0, syncing: 0, conflict: 0, failed: 0, total: q.length };
    q.forEach(function (i) {
      if (i.status === 'PENDING') out.pending++;
      else if (i.status === 'SYNCING') out.syncing++;
      else if (i.status === 'CONFLICT') out.conflict++;
      else if (i.status === 'FAILED') out.failed++;
    });
    return out;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var realApiCall = window.apiCall_ || function () {
    throw new Error('apiCall_ not available');
  };

  window.apiCall_ = function (fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (MUTATIONS[fn] && navigator.onLine === false) {
      return enqueue(fn, { args: args, entityId: inferEntityId_(fn, args) });
    }
    return realApiCall.apply(null, arguments);
  };

  window.OfflineQueue = {
    enqueue: enqueue,
    flush: flush,
    pending: pending,
    clear: clear,
    status: status,
    needsAttention: needsAttention,
    isMutation: function (fn) { return !!MUTATIONS[fn]; }
  };

  registerServiceWorker();

  window.addEventListener('online', function () {
    if (pending()) {
      flush().then(function (res) {
        if (res.flushed && window.refreshData) window.refreshData();
        if (window.refreshCounts) window.refreshCounts();
        if (res.conflict && window.showToast) {
          window.showToast('Some offline changes need your attention.', 'warning');
        }
      });
    }
  });

  renderQueueStatus();
})();
