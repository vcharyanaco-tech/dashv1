/*
 * OfflineQueue - PWA offline action queue for the India Post Dashboard.
 * Loaded AFTER app.js so the original global apiCall_ can be captured and
 * wrapped. Mutating calls made while offline are queued in localStorage and
 * replayed FIFO when the connection returns. Read-only calls pass through
 * unchanged. Also registers the service worker (sw.js).
 */
(function () {
  'use strict';

  var QUEUE_KEY = 'ipd_offline_queue_v1';
  var MAX_QUEUE = 200;

  var MUTATIONS = {
    addItem: true, updateItem: true, deleteItem: true, markReviewDone: true,
    changePassword: true,
    adminAddUser: true, adminUpdateUser: true, adminDeleteUser: true,
    adminResetPassword: true, adminImportUsers: true, adminEmailAllUsers: true,
    markNotificationsRead: true, clearMyNotifications: true,
    createTask: true, updateTask: true, deleteTask: true,
    saveDashboardPreferences: true,
    addSubmission: true, updateSubmission: true, deleteSubmission: true,
    lockSubmission: true, unlockSubmission: true, toggleSubmissionDisplay: true,
    uploadDocument: true, deleteDocument: true,
    adminDeleteAuditRows: true, adminClearAudit: true,
    exportToSpreadsheet: true
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function save(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  }

  function pending() { return load().length; }

  function emit(name, detail) {
    try {
      if (window.EventBus) window.EventBus.emit(name, detail);
    } catch (e) {}
  }

  function renderQueueStatus() {
    var label = document.getElementById('offlineLabel');
    if (!label) return;
    var n = pending();
    label.textContent = n
      ? 'You are offline. ' + n + ' queued action(s) will sync when you reconnect.'
      : 'You appear to be offline. Some actions may not work until your connection returns.';
  }

  function enqueue(fn, args) {
    var q = load();
    q.push({ fn: fn, args: args, ts: Date.now() });
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    save(q);
    renderQueueStatus();
    emit('OfflineQueueChange', { pending: q.length });
    return Promise.resolve({ queued: true, pending: q.length });
  }

  function remove(item) {
    var q = load();
    var i = q.indexOf(item);
    if (i !== -1) { q.splice(i, 1); save(q); }
    return q.length;
  }

  function flush() {
    var q = load();
    if (!q.length) return Promise.resolve({ flushed: 0, failed: 0, pending: 0 });
    var flushed = 0;
    var failed = 0;
    var chain = Promise.resolve();
    q.forEach(function (item) {
      chain = chain.then(function () {
        return realApiCall(item.fn).apply(null, item.args).then(function () {
          flushed++;
          renderQueueStatus();
          emit('OfflineQueueChange', { pending: remove(item) });
        }, function () {
          failed++;
          renderQueueStatus();
          emit('OfflineQueueChange', { pending: remove(item) });
        });
      });
    });
    return chain.then(function () {
      renderQueueStatus();
      emit('OfflineQueueFlushed', { flushed: flushed, failed: failed, pending: pending() });
      return { flushed: flushed, failed: failed, pending: pending() };
    });
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
      return enqueue(fn, args);
    }
    return realApiCall.apply(null, arguments);
  };

  window.OfflineQueue = {
    enqueue: enqueue,
    flush: flush,
    pending: pending,
    isMutation: function (fn) { return !!MUTATIONS[fn]; }
  };

  registerServiceWorker();

  window.addEventListener('online', function () {
    if (pending()) {
      flush().then(function (res) {
        if (res.flushed && window.refreshData) window.refreshData();
        if (window.loadNotifications) window.loadNotifications(true);
      });
    }
  });

  renderQueueStatus();
})();