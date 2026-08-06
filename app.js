'use strict';

/* ==========================================================================
   India Post Dashboard — Client (script.html)
   Renders against the enterprise design system in styles.html. All inline
   onclick handlers referenced by index.html are defined here.
   ========================================================================== */

const APP_VERSION = '1.0.0';
const APP_BUILD = '2026.08.11';
const PAGE_SIZE = 10;
const AUDIT_PAGE_SIZE = 20;
const STORAGE_THEME = 'indiaPostDarkMode';
const STORAGE_SIDEBAR = 'indiaPostSidebarCollapsed';
const STORAGE_TOKEN = 'indiaPostAuthToken';
const STORAGE_REAUTH_MSG = 'indiaPostReauthMsg';

/* ---------------------------------- Event bus (pub/sub) ---------------------------------- */
/* Lightweight publish/subscribe used across the UI. Named events follow the
   convention: UserLoggedIn, DataRefreshed, ReportSaved, SettingsUpdated,
   ThemeChanged. */

const EventBus = {
  listeners: {},
  on: function (event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
    return this;
  },
  off: function (event, fn) {
    const list = this.listeners[event];
    if (!list) return this;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
    return this;
  },
  emit: function (event, payload) {
    (this.listeners[event] || []).slice().forEach(function (fn) { fn(payload); });
    return this;
  }
};

/* ---------------------------------- API service layer ---------------------------------- */
/* Central gateway for every server call: owns fetch, argument
    order and token injection, and turns results into Promises. No UI code
    calls fetch directly. */

var API_URL = 'https://script.google.com/macros/s/AKfycbzVWcFmpyL1WonxJaaunXugpNnLyigb0ZUsegVYrKM-47jLNX2_DCuBsZkGIQOpAq62/exec';

function apiCall_(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  return fetch(API_URL, {
    method: 'POST',
    // text/plain avoids a CORS preflight (application/json would require OPTIONS)
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ function: fn, args: args })
  }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (data) {
    if (data.error) throw new Error(data.error);
    return data.result;
  });
}

const ApiService = {
  getServerTime: function () { return apiCall_('getServerTime'); },
  getAppData: function () { return apiCall_('getAppData', getAuthToken()); },
  getData: function () { return apiCall_('getData'); },
  addItem: function (item) { return apiCall_('addItem', item, getAuthToken()); },
  updateItem: function (item) { return apiCall_('updateItem', item, getAuthToken()); },
  deleteItem: function (row) { return apiCall_('deleteItem', row, getAuthToken()); },
  markReviewDone: function (row) { return apiCall_('markReviewDone', row, getAuthToken()); },
  login: function (email, password) { return apiCall_('login', email, password); },
  logout: function () { return apiCall_('logout', getAuthToken()); },
  validateSession: function () { return apiCall_('validateSession', getAuthToken()); },
  requestPasswordReset: function (email) { return apiCall_('requestPasswordReset', email); },
  changePassword: function (currentPassword, newPassword) { return apiCall_('changePassword', currentPassword, newPassword, getAuthToken()); },
  adminGetUsers: function () { return apiCall_('adminGetUsers', getAuthToken()); },
  adminAddUser: function (email, username, role, password, group, department, office) { return apiCall_('adminAddUser', email, username, role, password, group, department, office, getAuthToken()); },
  adminUpdateUser: function (email, fields) { return apiCall_('adminUpdateUser', email, fields, getAuthToken()); },
  adminExportUsers: function () { return apiCall_('adminExportUsers', getAuthToken()); },
  adminImportUsers: function (csv) { return apiCall_('adminImportUsers', csv, getAuthToken()); },
  adminGetUserActivity: function () { return apiCall_('adminGetUserActivity', getAuthToken()); },
  adminDeleteUser: function (email) { return apiCall_('adminDeleteUser', email, getAuthToken()); },
  adminResetPassword: function (email, newPassword) { return apiCall_('adminResetPassword', email, newPassword, getAuthToken()); },
  adminEmailAllUsers: function (subject, body) { return apiCall_('adminEmailAllUsers', subject, body, getAuthToken()); },
  getMyNotifications: function () { return apiCall_('getMyNotifications', getAuthToken()); },
  markNotificationsRead: function (ids) { return apiCall_('markNotificationsRead', ids, getAuthToken()); },
  submitRecordReview: function (row, summary) { return apiCall_('submitRecordReview', row, summary, getAuthToken()); },
  getPendingApprovals: function () { return apiCall_('getPendingApprovals', getAuthToken()); },
  getMyApprovals: function () { return apiCall_('getMyApprovals', getAuthToken()); },
  reviewApproval: function (id, approve, comment) { return apiCall_('reviewApproval', id, approve, comment, getAuthToken()); },
  createTask: function (params) { return apiCall_('createTask', params, getAuthToken()); },
  getTasks: function (filters) { return apiCall_('getTasks', filters || {}, getAuthToken()); },
  getMyTasks: function () { return apiCall_('getMyTasks', getAuthToken()); },
  updateTask: function (id, fields) { return apiCall_('updateTask', id, fields, getAuthToken()); },
  deleteTask: function (id) { return apiCall_('deleteTask', id, getAuthToken()); },
  getDashboardPreferences: function () { return apiCall_('getDashboardPreferences', getAuthToken()); },
  saveDashboardPreferences: function (prefs) { return apiCall_('saveDashboardPreferences', prefs, getAuthToken()); },
  getReportTemplates: function () { return apiCall_('getReportTemplates'); },
  getReportData: function (templateKey) { return apiCall_('getReportData', templateKey, getAuthToken()); },
  getRecordDocuments: function (row) { return apiCall_('getRecordDocuments', row, getAuthToken()); },
  uploadDocument: function (row, recordId, fileName, fileBytes, mimeType) { return apiCall_('uploadDocument', row, recordId, fileName, fileBytes, mimeType, getAuthToken()); },
  deleteDocument: function (docId) { return apiCall_('deleteDocument', docId, getAuthToken()); },
  getSubmissions: function (cardRow) { return apiCall_('getSubmissions', getAuthToken(), cardRow); },
  addSubmission: function (cardRow, cardId, text) { return apiCall_('addSubmission', cardRow, cardId, text, getAuthToken()); },
  updateSubmission: function (submissionId, text) { return apiCall_('updateSubmission', submissionId, text, getAuthToken()); },
  lockSubmission: function (submissionId) { return apiCall_('lockSubmission', submissionId, getAuthToken()); },
  unlockSubmission: function (submissionId) { return apiCall_('unlockSubmission', submissionId, getAuthToken()); },
  deleteSubmission: function (submissionId) { return apiCall_('deleteSubmission', submissionId, getAuthToken()); },
  toggleSubmissionDisplay: function (submissionId) { return apiCall_('toggleSubmissionDisplay', submissionId, getAuthToken()); },
  getAuditEntries: function (limit) { return apiCall_('getAuditEntries', limit || 80); },
  adminDeleteAuditRows: function (rowNumbers) { return apiCall_('adminDeleteAuditRows', rowNumbers, getAuthToken()); },
  adminClearAudit: function () { return apiCall_('adminClearAudit', getAuthToken()); },
  exportToSpreadsheet: function () { return apiCall_('exportToSpreadsheet', getAuthToken()); },
  createPdfReport: function () { return apiCall_('createPdfReport', getAuthToken()); }
};

const appState = {
  items: [],
  filtered: [],
  summary: {},
  analytics: {},
  audit: [],
  user: {},
  settings: {},
  isAdmin: false,
  isEditor: false,
  mustChange: false,
  editMode: 'edit',
  submissions: [],
  submissionCardRow: '',
  submissionCardId: '',
  submissionEditingId: '',
  submissionCounts: {},
  submissionFlash: {},
  displayedSubmissions: [],
  responsibilities: [],
  reminders: [],
  searchQuery: '',
  sector: '',
  page: 1,
  auditSortKey: 'timestamp',
  auditSortDir: 'desc',
  auditPage: 1,
  selectedAuditRows: [],
  dashboardView: 'cards',
  dashSortKey: 'id',
  dashSortDir: 'asc',
  permissions: {},
  notifications: { unread: 0, recent: [] }
};

/* ---------------------------------- Helpers ---------------------------------- */

function getEl(id) { return document.getElementById(id); }

function can(module, action) {
  const perms = appState.permissions || {};
  return (perms[module] || []).indexOf(action) !== -1;
}

/* Apply a full server payload (getAppData shape) to the client state in one
   place so every refresh path keeps the same fields in sync. */
function applyAppData(data) {
  appState.items = (data && data.items) || [];
  appState.summary = (data && data.summary) || {};
  appState.analytics = (data && data.analytics) || {};
  appState.audit = (data && data.audit) || [];
  appState.selectedAuditRows = [];
  appState.settings = (data && data.settings) || {};
  appState.submissionCounts = (data && data.submissionCounts) || {};
  appState.submissionFlash = (data && data.submissionFlash) || {};
  appState.displayedSubmissions = (data && data.displayedSubmissions) || [];
  appState.permissions = (data && data.user && data.user.permissions) || {};
  appState.responsibilities = (data && data.responsibilities) || [];
  appState.reminders = (data && data.reminders) || [];
  appState.auditPage = 1;
}

let auditLoaded = false;

function ensureAuditLoaded() {
  if (auditLoaded) return Promise.resolve(appState.audit);
  return ApiService.getAuditEntries(80).then(function (entries) {
    appState.audit = entries || [];
    appState.auditPage = 1;
    auditLoaded = true;
    return appState.audit;
  });
}

function renderAuditPanel() {
  ensureAuditLoaded().then(function () {
    renderAudit();
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not load audit log: ' + (err.message || err), 'error');
    renderAudit();
  });
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(value) {
  return escapeHtml(value);
}

function renderLinkableText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  const normalized = text.trim();
  if (!normalized) return '';
  const isUrl = /^(https?:\/\/|mailto:|ftp:\/\/|www\.)/i.test(normalized) || /(?:\.[a-z]{2,})(?:\/|$)/i.test(normalized);
  if (!isUrl) return escapeHtml(text);
  const href = /^www\./i.test(normalized) ? 'https://' + normalized : normalized;
  return `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

function parseQueryParams() {
  const params = {};
  const query = window.location.search || '';
  if (!query) return params;
  query.substring(1).split('&').forEach(pair => {
    const parts = pair.split('=');
    const key = decodeURIComponent(parts[0] || '');
    if (key) params[key] = decodeURIComponent(parts[1] || '');
  });
  return params;
}

function debounce(fn, ms) {
  let timer = null;
  return function () {
    const args = arguments;
    const ctx = this;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(ctx, args); }, ms || 200);
  };
}

function svgIcon(name) {
  const paths = {
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',
    search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
  };
  const body = paths[name] || paths.info;
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* ---------------------------------- Toasts ---------------------------------- */

function showToast(message, type) {
  const container = getEl('toastContainer');
  if (!container) return;
  const kind = type || 'success';
  const icons = {
    success: svgIcon('check'),
    warning: svgIcon('alert'),
    error: svgIcon('alert'),
    info: svgIcon('info')
  };
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + kind;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.innerHTML = icons[kind] + '<span>' + escapeHtml(message) + '</span>';
  container.appendChild(toast);
  setTimeout(function () {
    toast.classList.add('out');
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
  }, 3600);
}

/* ---------------------------------- Overlay ---------------------------------- */

function showOverlay(message) {
  const overlay = getEl('overlay');
  const text = overlay.querySelector('.overlay-text');
  if (text) text.textContent = message || 'Working…';
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  getEl('overlay').classList.add('hidden');
}

/* ---------------------------------- Splash ---------------------------------- */

function hideSplash() {
  const splash = getEl('splashScreen');
  if (splash) splash.classList.add('hide');
}

/* ---------------------------------- Shared dialog system ---------------------------------- */
/* Central open/close for every modal plus a styled confirm that replaces the
   native confirm() boxes. openDialog/closeDialog also manage the body scroll
   lock and aria state so all dialogs behave consistently. */

function openDialog(id) {
  const modal = getEl(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  const focusable = modal.querySelector('input:not([type=hidden]), textarea, select, button, [tabindex]');
  if (focusable) focusable.focus();
}

function closeDialog(id) {
  const modal = getEl(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-backdrop:not(.hidden)')) {
    document.body.classList.remove('modal-open');
  }
}

let confirmDialogState = null;

function showConfirm(options) {
  return new Promise(function (resolve) {
    confirmDialogState = { onConfirm: resolve };
    getEl('confirmMessage').textContent = options.message || 'Are you sure?';
    getEl('confirmModalTitle').textContent = options.title || 'Confirm';
    const okBtn = getEl('confirmOkBtn');
    okBtn.textContent = options.okLabel || 'OK';
    okBtn.classList.toggle('btn-danger', !!options.danger);
    okBtn.classList.toggle('btn-primary', !options.danger);
    openDialog('confirmModal');
  });
}

function runConfirmDialog() {
  const cb = confirmDialogState ? confirmDialogState.onConfirm : null;
  confirmDialogState = null;
  closeDialog('confirmModal');
  if (cb) cb(true);
}

function cancelConfirmDialog() {
  const cb = confirmDialogState ? confirmDialogState.onConfirm : null;
  confirmDialogState = null;
  closeDialog('confirmModal');
  if (cb) cb(false);
}

/* ---------------------------------- Auth token ---------------------------------- */

function getAuthToken() {
  return window.localStorage.getItem(STORAGE_TOKEN) || '';
}

function setAuthToken(token) {
  if (token) window.localStorage.setItem(STORAGE_TOKEN, token);
  else window.localStorage.removeItem(STORAGE_TOKEN);
}

function isAuthError(message) {
  const msg = String(message || '');
  return msg.indexOf('Login required') !== -1 ||
    msg.indexOf('Session expired') !== -1 ||
    msg.indexOf('Please log in') !== -1;
}

function handleServerFailure(err) {
  hideOverlay();
  const msg = err && err.message ? err.message : String(err || 'Unknown error');
  if (isAuthError(msg)) {
    setAuthToken('');
    showScreen('login');
    showToast('Session expired. Please log in again.', 'warning');
    return true;
  }
  return false;
}

/* ---------------------------------- Screens ---------------------------------- */

function showScreen(screen) {
  ['login', 'forgot'].forEach(name => {
    const el = getEl(name + 'Screen');
    if (el) el.classList.add('hidden');
  });
  const target = getEl(screen + 'Screen');
  if (target) target.classList.remove('hidden');
}

function showAuthMessage(elementId, message) {
  const el = getEl(elementId);
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('hidden', !message);
}

/* ---------------------------------- Theme ---------------------------------- */

function applyTheme() {
  appState.darkMode = window.localStorage.getItem(STORAGE_THEME) === 'true';
  document.body.classList.toggle('dark-mode', appState.darkMode);
  const moon = getEl('iconMoon');
  const sun = getEl('iconSun');
  if (moon && sun) {
    moon.classList.toggle('hidden', appState.darkMode);
    sun.classList.toggle('hidden', !appState.darkMode);
  }
}

function toggleDarkMode() {
  appState.darkMode = !appState.darkMode;
  window.localStorage.setItem(STORAGE_THEME, String(appState.darkMode));
  applyTheme();
}

/* ---------------------------------- Sidebar ---------------------------------- */

function applySidebarPref() {
  const collapsed = window.localStorage.getItem(STORAGE_SIDEBAR) === '1';
  document.body.classList.toggle('sidebar-collapsed', collapsed);
}

function toggleSidebar() {
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  if (mobile) {
    const open = document.body.classList.toggle('sidebar-open');
    const backdrop = getEl('sidebarBackdrop');
    if (backdrop) backdrop.classList.toggle('hidden', !open);
  } else {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    window.localStorage.setItem(STORAGE_SIDEBAR, collapsed ? '1' : '0');
  }
}

/* ---------------------------------- Profile menu ---------------------------------- */

function toggleProfileMenu() {
  const dropdown = getEl('profileDropdown');
  const trigger = getEl('profileTrigger');
  const open = dropdown.classList.toggle('open');
  if (trigger) trigger.setAttribute('aria-expanded', String(open));
}

function renderProfile() {
  const user = appState.user || {};
  const email = user.email || '';
  const role = user.role || 'VIEWER';
  const name = email ? email.split('@')[0] : 'Guest';
  const initial = email ? email.charAt(0).toUpperCase() : '?';
  const tone = role === 'ADMIN' ? 'danger' : (role === 'EDITOR' ? 'accent' : 'muted');

  const avatar = getEl('profileAvatar');
  if (avatar) avatar.textContent = initial;
  const nameEl = getEl('profileName');
  if (nameEl) nameEl.textContent = user.loggedIn ? name : 'Not signed in';
  const roleEl = getEl('profileRole');
  if (roleEl) roleEl.textContent = user.loggedIn ? role : '—';
  const emailEl = getEl('profileEmail');
  if (emailEl) emailEl.textContent = user.loggedIn ? email : 'Not signed in';
  const badge = getEl('profileRoleBadge');
  if (badge) {
    badge.textContent = user.loggedIn ? role : 'Guest';
    badge.setAttribute('data-tone', tone);
  }

  const addButton = getEl('addButton');
  if (addButton) addButton.style.display = appState.isEditor ? 'inline-flex' : 'none';
}

/* ---------------------------------- Notifications ---------------------------------- */

function loadNotifications(silent) {
  return ApiService.getMyNotifications().then(function (data) {
    appState.notifications = data || { unread: 0, recent: [] };
    renderNotifications();
  }).catch(function (err) {
    if (!silent && handleServerFailure(err)) return;
  });
}

function renderNotifications() {
  const n = appState.notifications || { unread: 0, recent: [] };
  const badge = getEl('notifBadge');
  if (badge) {
    badge.textContent = n.unread > 99 ? '99+' : String(n.unread || 0);
    badge.classList.toggle('hidden', !n.unread);
    badge.setAttribute('aria-hidden', String(!n.unread));
  }
  const list = getEl('notifList');
  const empty = getEl('notifEmpty');
  const recent = n.recent || [];
  if (list) {
    list.innerHTML = (recent.map(function (item) {
      const unreadClass = item.readAt ? '' : ' notif-item-unread';
      return '<li class="notif-item' + unreadClass + '" data-notif-id="' + escAttr(String(item.id || '')) + '" data-notif-type="' + escAttr(String(item.type || 'system')) + '">' +
        '<div class="notif-item-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="notif-item-body">' + escapeHtml(item.body) + '</div>' +
        '<div class="notif-item-time">' + escapeHtml(formatNotifTime(item.createdAt)) + '</div>' +
        '</li>';
    }).join('')) || '<li class="notif-item-empty">No notifications yet.</li>';
  }
  if (empty) empty.classList.toggle('hidden', !!(recent && recent.length));
}

function formatNotifTime(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - Number(ts)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(Number(ts)).toLocaleDateString();
}

function toggleNotifications() {
  const panel = getEl('notifPanel');
  if (!panel) return;
  const open = panel.classList.toggle('hidden');
  const trigger = getEl('notifTrigger');
  if (trigger) trigger.setAttribute('aria-expanded', String(!open));
  if (!open) loadNotifications(true);
}

function closeNotificationsPanel() {
  const panel = getEl('notifPanel');
  if (panel) panel.classList.add('hidden');
  const trigger = getEl('notifTrigger');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function markAllNotificationsRead() {
  ApiService.markNotificationsRead('all').then(function (data) {
    appState.notifications = data || { unread: 0, recent: [] };
    renderNotifications();
    showToast('All notifications marked as read.', 'success');
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not update notifications: ' + (err.message || err), 'error');
  });
}

function openNotification(id, type) {
  if (!id) {
    closeNotificationsPanel();
    return;
  }
  ApiService.markNotificationsRead([id]).then(function (data) {
    appState.notifications = data || { unread: 0, recent: [] };
    renderNotifications();
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
  });
  closeNotificationsPanel();
  const map = { record: 'dashboard', submission: 'dashboard', user: 'settings', system: 'dashboard' };
  openTab(map[type] || 'dashboard');
}

/* ---------------------------------- Tabs ---------------------------------- */

function openTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.classList.remove('active');
    btn.removeAttribute('aria-current');
  });
  const panel = getEl(tabId);
  if (panel) panel.classList.remove('hidden');
  const nav = document.querySelector('.nav-item[data-tab="' + tabId + '"]');
  if (nav) {
    nav.classList.add('active');
    nav.setAttribute('aria-current', 'page');
  }
  if (tabId === 'analytics') renderAnalytics();
  if (tabId === 'audit') renderAuditPanel();
  if (tabId === 'reports') renderReportPreview();
  if (tabId === 'settings') renderSettings();
  if (tabId === 'dashboard') renderDashboard();
  if (tabId === 'approvals') renderApprovals();
  if (tabId === 'tasks') renderTasks();
}

/* ---------------------------------- Auth flows ---------------------------------- */

function initApp() {
  startLiveClock();
  initDatePicker();

  const token = getAuthToken();

  if (!token) {
    showScreen('login');
    hideSplash();
    let msg = '';
    try {
      msg = window.sessionStorage.getItem(STORAGE_REAUTH_MSG) || '';
      window.sessionStorage.removeItem(STORAGE_REAUTH_MSG);
    } catch (err) {}
    if (msg) showAuthMessage('loginMessage', msg);
    return;
  }

  loadApp();
}

function loadApp() {
  showOverlay('Loading app…');
  ApiService.getAppData().then(function (data) {
    hideOverlay();
    hideSplash();
    if (!data || !data.user || !data.user.loggedIn) {
      setAuthToken('');
      showScreen('login');
      return;
    }
    appState.user = data.user || {};
    appState.isAdmin = data.user.role === 'ADMIN';
    appState.isEditor = data.user.role === 'ADMIN' || data.user.role === 'EDITOR';
    appState.mustChange = !!data.mustChange;
    appState.permissions = (data.user && data.user.permissions) || {};
    applyAppData(data);

    populateFilters();
    populateResponsibilitySelect();
    renderReviewReminders();
    renderProfile();
    applyTheme();
    applySidebarPref();
    showScreen('login');
    getEl('loginScreen').classList.add('hidden');
    getEl('forgotScreen').classList.add('hidden');
    renderDashboard();
    updateOfflineBanner();
    loadNotifications(true);
    loadDashboardPreferences();
    EventBus.emit('DataRefreshed');
    EventBus.emit('UserLoggedIn');

    if (appState.mustChange) {
      getEl('mustChangeBanner').classList.remove('hidden');
      openTab('settings');
      showToast('Please set a new password to continue.', 'warning');
    }
  }).catch(function (err) {
    hideOverlay();
    hideSplash();
    if (handleServerFailure(err)) return;
    const message = err && err.message ? err.message : String(err || 'Unknown error');
    const panel = getEl('messagePanel');
    panel.classList.remove('hidden');
    panel.textContent = 'Error loading app: ' + message;
    console.error('App load failed', err);
  });
}

function handleLogin(e) {
  e.preventDefault();
  const emailEl = getEl('loginEmail');
  const passEl = getEl('loginPassword');
  const email = emailEl.value.trim();
  const password = passEl.value;
  let valid = true;
  valid = setFieldInvalid(emailEl, email ? '' : 'Enter your email or username.') && valid;
  valid = setFieldInvalid(passEl, password ? '' : 'Enter your password.') && valid;
  if (!valid) return;

  showOverlay('Logging in…');
  ApiService.login(email, password).then(function (res) {
    hideOverlay();
    if (!res || !res.success) {
      showAuthMessage('loginMessage', (res && res.message) || 'Login failed.');
      return;
    }
    setAuthToken(res.token);
    appState.mustChange = !!res.mustChange;
    showAuthMessage('loginMessage', '');
    loadApp();
  }).catch(function (err) {
    hideOverlay();
    showAuthMessage('loginMessage', err && err.message ? err.message : 'Login failed.');
  });
}

function showForgotPassword() {
  showAuthMessage('forgotMessage', '');
  const loginEmail = getEl('loginEmail').value || '';
  getEl('forgotEmail').value = loginEmail;
  showScreen('forgot');
}

function showLogin() {
  ['loginMessage', 'forgotMessage'].forEach(id => showAuthMessage(id, ''));
  showScreen('login');
}

function handleForgotPassword(e) {
  e.preventDefault();
  const email = getEl('forgotEmail').value.trim();
  if (!setFieldInvalid(getEl('forgotEmail'), email ? '' : 'Enter your email or username.')) return;
  showOverlay('Submitting reset request…');
  ApiService.requestPasswordReset(email).then(function (res) {
    hideOverlay();
    showAuthMessage('forgotMessage', (res && res.message) || 'A reset request has been sent to your administrator.');
    showToast((res && res.message) || 'A reset request has been sent to your administrator.', 'success');
  }).catch(function (err) {
    hideOverlay();
    showAuthMessage('forgotMessage', err && err.message ? err.message : 'Could not submit the reset request.');
  });
}

function logout() {
  ApiService.logout().then(function () {
    setAuthToken('');
    window.location.href = window.location.href.split('?')[0];
  }).catch(function () {
    setAuthToken('');
    window.location.reload();
  });
}

/* ---------------------------------- Form validation ---------------------------------- */

function setFieldInvalid(inputEl, message) {
  if (!inputEl) return !message;
  const field = inputEl.closest('.field');
  if (!field) return !message;
  const err = field.querySelector('.field-error');
  if (err) err.textContent = message || '';
  field.classList.toggle('invalid', !!message);
  return !message;
}

function wireFieldClearing(container) {
  (container || document).querySelectorAll('input, select, textarea').forEach(function (input) {
    input.addEventListener('input', function () {
      setFieldInvalid(input, '');
    });
  });
}

/* ---------------------------------- Dashboard: filters ---------------------------------- */

function populateFilters() {
  const filter = getEl('sectorFilter');
  if (!filter) return;
  const selected = filter.value;
  const sectors = [...new Set(appState.items.map(function (item) { return item.sector; }).filter(Boolean))].sort();
  filter.innerHTML = '<option value="">All sectors</option>' + sectors.map(function (s) {
    return `<option value="${escAttr(s)}">${escapeHtml(s)}</option>`;
  }).join('');
  filter.value = selected;
}

/* Populate the edit-dialog responsibility dropdown with every responsibility
   entry returned by the server (all records, not just the current view). */
function populateResponsibilitySelect() {
  const select = getEl('editResponsibility');
  if (!select) return;
  const selected = select.value;
  const list = appState.responsibilities || [];
  select.innerHTML = '<option value="">Select responsibility…</option>' + list.map(function (r) {
    return `<option value="${escAttr(r)}">${escapeHtml(r)}</option>`;
  }).join('');
  select.value = selected;
}

/* Render the review-reminder flash under the topbar/search for the logged-in
   user (records due today/tomorrow assigned to their office). */
function renderReviewReminders() {
  const banner = getEl('reminderBanner');
  const listEl = getEl('reminderBannerList');
  if (!banner || !listEl) return;
  const reminders = appState.reminders || [];
  if (!reminders.length) {
    banner.classList.add('hidden');
    return;
  }
  listEl.innerHTML = reminders.map(function (r) {
    const due = r.daysUntil === 0 ? 'today' : 'tomorrow';
    return `<div class="reminder-item">` +
      `<strong>#${escapeHtml(r.id)} · ${escapeHtml(r.sector || '')}</strong>` +
      (r.action ? ` — <em>${escapeHtml(r.action)}</em>` : '') +
      ` <span class="reminder-due">(review ${due}: ${escapeHtml(r.reviewDate || '—')})</span>` +
      `</div>`;
  }).join('');
  banner.classList.remove('hidden');
}

function dismissReminderBanner() {
  const banner = getEl('reminderBanner');
  if (banner) banner.classList.add('hidden');
}

function applyFilters() {
  const query = appState.searchQuery.toLowerCase();
  const sector = appState.sector;
  appState.filtered = appState.items.filter(function (item) {
    const haystack = [item.sector, item.id, item.description, item.action, item.responsibility, item.reviewDate]
      .join(' ').toLowerCase();
    return (!query || haystack.indexOf(query) !== -1) && (!sector || item.sector === sector);
  });
  appState.page = 1;
}

function handleSectorFilterChange() {
  appState.sector = getEl('sectorFilter').value;
  updateFilterChips();
  renderDashboard();
}

function resetFilters() {
  appState.searchQuery = '';
  appState.sector = '';
  const search = getEl('searchInput');
  if (search) search.value = '';
  const filter = getEl('sectorFilter');
  if (filter) filter.value = '';
  updateFilterChips();
  renderDashboard();
}

function updateFilterChips() {
  const chips = getEl('filterChips');
  if (!chips) return;
  const parts = [];
  if (appState.searchQuery) {
    parts.push(`<span class="filter-chip">Search: ${escapeHtml(appState.searchQuery)} <button type="button" aria-label="Remove search filter" onclick="removeChip('search')">✕</button></span>`);
  }
  if (appState.sector) {
    parts.push(`<span class="filter-chip">Sector: ${escapeHtml(appState.sector)} <button type="button" aria-label="Remove sector filter" onclick="removeChip('sector')">✕</button></span>`);
  }
  chips.innerHTML = parts.join('');
  const resetBtn = getEl('resetFiltersBtn');
  if (resetBtn) resetBtn.classList.toggle('hidden', parts.length === 0);
}

function removeChip(kind) {
  if (kind === 'search') appState.searchQuery = '';
  if (kind === 'sector') appState.sector = '';
  const search = getEl('searchInput');
  if (search) search.value = appState.searchQuery;
  const filter = getEl('sectorFilter');
  if (filter) filter.value = appState.sector;
  updateFilterChips();
  renderDashboard();
}

/* ---------------------------------- Dashboard: KPI cards ---------------------------------- */

function monthlyTrendArray() {
  const trend = (appState.analytics && appState.analytics.trend) || [];
  if (Array.isArray(trend)) {
    return trend.slice().sort(function (a, b) {
      return String(a && a.key).localeCompare(String(b && b.key));
    });
  }
  return Object.keys(trend).sort().map(function (key) {
    return { key: key, value: trend[key] };
  });
}

function trendPill() {
  const points = monthlyTrendArray();
  if (points.length < 2) return '';
  const last = points[points.length - 1].value;
  const prev = points[points.length - 2].value;
  const diff = last - prev;
  const cls = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
  const arrow = diff > 0 ? '↑' : (diff < 0 ? '↓' : '—');
  const label = diff !== 0 ? `${arrow} ${Math.abs(diff)} this month` : 'Flat this month';
  return `<span class="kpi-trend ${cls}">${label}</span>`;
}

function sparklineSvg() {
  const points = monthlyTrendArray().slice(-12).map(function (p) { return p.value; });
  if (points.length < 2) return '';
  const max = Math.max.apply(null, points);
  const min = Math.min.apply(null, points);
  const span = (max - min) || 1;
  const coords = points.map(function (v, i) {
    const x = points.length === 1 ? 0 : (i / (points.length - 1)) * 100;
    const y = 40 - 4 - ((v - min) / span) * 32;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  return `<div class="kpi-sparkline"><svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--secondary)" stroke-width="2" points="${coords}"></polyline></svg></div>`;
}

function renderKpiCards() {
  const grid = getEl('summaryCards');
  if (!grid) return;
  const summary = appState.summary || {};
  const sectorCount = Object.keys(summary.sectors || {}).length;
  const total = summary.total || 0;
  const flagged = summary.flagged || 0;
  const trend = trendPill();
  const spark = sparklineSvg();

  grid.innerHTML =
    `<div class="kpi-card">
      <div class="kpi-top">
        <span class="kpi-icon tone-secondary">${svgIcon('database')}</span>
        ${trend}
      </div>
      <div class="kpi-label">Total records</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-subtitle">Across ${sectorCount} sector${sectorCount === 1 ? '' : 's'}</div>
      ${spark}
    </div>
    <div class="kpi-card">
      <div class="kpi-top">
        <span class="kpi-icon tone-warning">${svgIcon('flag')}</span>
      </div>
      <div class="kpi-label">Review due</div>
      <div class="kpi-value">${flagged}</div>
      <div class="kpi-subtitle">Flagged for follow-up</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top">
        <span class="kpi-icon tone-success">${svgIcon('layers')}</span>
      </div>
      <div class="kpi-label">Open sectors</div>
      <div class="kpi-value">${sectorCount}</div>
      <div class="kpi-subtitle">Active operations</div>
    </div>`;
}

/* ---------------------------------- Dashboard: cards ---------------------------------- */

function buildCardHtml(item) {
  const fieldsHtml = (item.displayFields || []).filter(function (field) {
    const label = String(field && field.label || '').trim().toLowerCase();
    return label !== '#' && label !== 'id' && label !== 'sr no';
  }).map(function (field) {
    const isHeaderRowValue = field && field.label && String(field.label).trim() !== '';
    const valueHtml = field.html
      ? `<div class="field-value preserve-whitespace field-html">${field.html}</div>`
      : `<div class="field-value preserve-whitespace">${escapeHtml(field.value)}</div>`;
    return `
      <div class="card-field ${isHeaderRowValue ? 'card-field-highlight' : ''}">
        <span class="field-label ${isHeaderRowValue ? 'field-label-highlight' : ''}">${escapeHtml(field.label || 'Value')}</span>
        ${valueHtml}
      </div>`;
  }).join('');

  const subCount = (appState.submissionCounts || {})[item.row] || 0;
  const subFlash = !!(appState.submissionFlash || {})[item.row];

  const updateFieldsHtml = (appState.displayedSubmissions || [])
    .filter(function (s) { return Number(s.cardRow) === Number(item.row); })
    .map(function (s) {
      return `
        <div class="card-field submission-display">
          <span class="field-label submission-display-label">Update by ${escapeHtml(s.email)} <span class="submission-display-time">${escapeHtml(s.createdAt || '')}</span></span>
          <div class="field-value preserve-whitespace">${escapeHtml(s.text || '')}</div>
        </div>`;
    }).join('');

  const reviewBadgeHtml = item.reviewStatus === 'due'
    ? `<span class="review-badge review-due">Review due${appState.isAdmin ? `
        <span class="review-dropdown">
          <button type="button" class="review-dropdown-toggle" aria-label="Review actions" onclick="event.stopPropagation(); toggleReviewDropdown(this);">&#9662;</button>
          <span class="review-dropdown-menu">
            <button type="button" class="review-dropdown-item" onclick="event.stopPropagation(); markReviewDone('${escAttr(item.row)}');">Mark as review done</button>
          </span>
        </span>` : ''}</span>`
    : item.reviewStatus === 'done'
      ? `<span class="review-badge review-done">Review done</span>`
      : '';

  const actionsHtml = `
    <div class="submit-update-wrap">
      <button class="btn btn-secondary btn-small" onclick="openSubmissionsModal('${escAttr(item.row)}','${escAttr(item.id)}')">Submit update</button>
      ${subCount > 0 ? `<span class="submission-badge${subFlash ? ' flash' : ''}">${subCount}</span>` : ''}
    </div>
    <div class="menu-dropdown">
      <button class="btn btn-secondary btn-small" type="button" onclick="event.stopPropagation(); toggleDropdown(this);">Print</button>
      <span class="menu-dropdown-menu">
        <button class="menu-dropdown-item" type="button" onclick="event.stopPropagation(); closeDropdowns(); printCard('${escAttr(item.row)}', true);">With submissions</button>
        <button class="menu-dropdown-item" type="button" onclick="event.stopPropagation(); closeDropdowns(); printCard('${escAttr(item.row)}', false);">Without submissions</button>
      </span>
    </div>
    ${appState.isEditor ? `<button class="btn btn-secondary btn-small" onclick="editItem('${escAttr(item.row)}')">Edit</button>` : ''}
    ${appState.isEditor ? `<button class="btn btn-danger btn-small" onclick="deleteItem('${escAttr(item.row)}')">Delete</button>` : ''}`;

  return `
    <article class="card ${item.reviewStatus === 'due' ? 'review-due' : ''}">
      ${reviewBadgeHtml}
      <div class="card-title preserve-whitespace"><span class="id-badge">#${escapeHtml(item.id)}</span></div>
      <div class="card-fields">${fieldsHtml || '<div class="card-field"><span class="field-label">Details</span><div class="field-value preserve-whitespace">No details available</div></div>'}${updateFieldsHtml}</div>
      <div class="card-footer"><div class="actions">${actionsHtml}</div></div>
    </article>`;
}

function emptyStateHtml() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${svgIcon('search')}</div>
      <div class="empty-state-title">No records found</div>
      <div class="empty-state-subtitle">Try adjusting your search or clearing the active filters.</div>
    </div>`;
}

function renderDashboardCards() {
  const grid = getEl('dashboardCards');
  if (!grid) return;
  const start = (appState.page - 1) * PAGE_SIZE;
  const pageItems = appState.filtered.slice(start, start + PAGE_SIZE);
  grid.innerHTML = pageItems.length
    ? pageItems.map(buildCardHtml).join('')
    : emptyStateHtml();
}

/* ---------------------------------- Dashboard: table view ---------------------------------- */
/* Enterprise-style sortable table, additive alongside the card view. Rows use
   the same filters + pagination as the cards; clicking a row opens the record
   detail dialog (S8). */

function toggleDashboardView(view) {
  appState.dashboardView = view === 'table' ? 'table' : 'cards';
  renderDashboard();
}

function dashCompare(a, b) {
  const av = a == null ? '' : a;
  const bv = b == null ? '' : b;
  const an = Number(av);
  const bn = Number(bv);
  const aIsNum = av !== '' && isFinite(an);
  const bIsNum = bv !== '' && isFinite(bn);
  if (aIsNum && bIsNum) return an - bn;
  return String(av).toLowerCase() < String(bv).toLowerCase() ? -1
    : (String(av).toLowerCase() > String(bv).toLowerCase() ? 1 : 0);
}

function sortedItems() {
  const key = appState.dashSortKey;
  const dir = appState.dashSortDir === 'desc' ? -1 : 1;
  return appState.filtered.slice().sort(function (a, b) {
    return dashCompare(a[key], b[key]) * dir;
  });
}

function buildTableRowHtml(item) {
  const subCount = (appState.submissionCounts || {})[item.row] || 0;
  const statusBadge = item.reviewStatus === 'due'
    ? '<span class="review-badge review-due">Review due</span>'
    : item.reviewStatus === 'done'
      ? '<span class="review-badge review-done">Review done</span>'
      : '';
  const actions = `
    <div class="row-actions">
      <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); openSubmissionsModal('${escAttr(item.row)}','${escAttr(item.id)}')">Update${subCount ? ' (' + subCount + ')' : ''}</button>
      ${appState.isEditor ? `<button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); editItem('${escAttr(item.row)}')">Edit</button>` : ''}
      ${appState.isEditor ? `<button class="btn btn-danger btn-small" onclick="event.stopPropagation(); deleteItem('${escAttr(item.row)}')">Delete</button>` : ''}
    </div>`;
  return `
    <tr class="row-clickable ${item.reviewStatus === 'due' ? 'row-flagged' : ''}" data-row="${escAttr(item.row)}" tabindex="0">
      <td><span class="id-badge">#${escapeHtml(item.id)}</span></td>
      <td class="preserve-whitespace">${escapeHtml(item.sector || '')}</td>
      <td class="details-cell preserve-whitespace">${escapeHtml(item.description || '')}</td>
      <td class="preserve-whitespace">${escapeHtml(item.entryDate || '')}</td>
      <td class="preserve-whitespace">${escapeHtml(item.reviewDate || '')}</td>
      <td>${statusBadge}</td>
      <td>${actions}</td>
    </tr>`;
}

function renderDashboardTable() {
  const wrap = getEl('dashboardTableWrap');
  const table = getEl('dashboardTable');
  if (!wrap || !table) return;
  const start = (appState.page - 1) * PAGE_SIZE;
  const pageItems = sortedItems().slice(start, start + PAGE_SIZE);

  table.querySelectorAll('thead th[data-dash-sort]').forEach(function (th) {
    const sortKey = th.getAttribute('data-dash-sort');
    if (sortKey === appState.dashSortKey) {
      th.setAttribute('aria-sort', appState.dashSortDir === 'asc' ? 'ascending' : 'descending');
    } else {
      th.removeAttribute('aria-sort');
    }
  });

  table.querySelector('tbody').innerHTML = pageItems.length
    ? pageItems.map(buildTableRowHtml).join('')
    : '<tr><td colspan="7">No records found.</td></tr>';

  const summaryEl = getEl('dashboardTableSummary');
  if (summaryEl) summaryEl.textContent = appState.filtered.length + ' record' + (appState.filtered.length === 1 ? '' : 's') + ' found';

  applyColumnVisibility();
}

function applyColumnVisibility() {
  const prefs = appState.dashboardPrefs || {};
  const columns = prefs.columns || {};
  const table = getEl('dashboardTable');
  if (!table) return;
  table.querySelectorAll('th[data-col]').forEach(function (th) {
    const col = th.getAttribute('data-col');
    const show = columns[col] !== false;
    th.style.display = show ? '' : 'none';
  });
  table.querySelectorAll('tbody tr').forEach(function (tr) {
    const cells = tr.querySelectorAll('td');
    const headers = table.querySelectorAll('th[data-col]');
    headers.forEach(function (th, idx) {
      if (cells[idx]) cells[idx].style.display = th.style.display;
    });
  });
}

function setDashSort(key) {
  if (key === appState.dashSortKey) {
    appState.dashSortDir = appState.dashSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    appState.dashSortKey = key;
    appState.dashSortDir = 'asc';
  }
  renderDashboard();
}

function renderPagination() {
  const bar = getEl('paginationBar');
  if (!bar) return;
  const total = appState.filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (appState.page > pages) appState.page = pages;
  if (total <= PAGE_SIZE) {
    bar.innerHTML = '';
    return;
  }
  let html = `<button class="page-btn" type="button" onclick="setPage(${appState.page - 1})" ${appState.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>`;
  const start = Math.max(1, appState.page - 2);
  const end = Math.min(pages, start + 4);
  for (let p = start; p <= end; p++) {
    html += `<button class="page-btn ${p === appState.page ? 'active' : ''}" type="button" onclick="setPage(${p})" ${p === appState.page ? 'aria-current="page"' : ''}>${p}</button>`;
  }
  html += `<button class="page-btn" type="button" onclick="setPage(${appState.page + 1})" ${appState.page >= pages ? 'disabled' : ''} aria-label="Next page">›</button>`;
  html += `<span class="page-info">${total} record${total === 1 ? '' : 's'}</span>`;
  bar.innerHTML = html;
}

function setPage(page) {
  const pages = Math.max(1, Math.ceil(appState.filtered.length / PAGE_SIZE));
  appState.page = Math.min(Math.max(1, page), pages);
  renderDashboardCards();
  renderDashboardTable();
  renderPagination();
  const target = appState.dashboardView === 'table' ? getEl('dashboardTableWrap') : getEl('dashboardCards');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderDashboard() {
  applyFilters();
  renderKpiCards();
  updateFilterChips();
  const grid = getEl('dashboardCards');
  const tableWrap = getEl('dashboardTableWrap');
  const viewCardsBtn = getEl('viewCardsBtn');
  const viewTableBtn = getEl('viewTableBtn');
  const isTable = appState.dashboardView === 'table';
  if (grid) grid.classList.toggle('hidden', isTable);
  if (tableWrap) tableWrap.classList.toggle('hidden', !isTable);
  if (viewCardsBtn) viewCardsBtn.classList.toggle('active', !isTable);
  if (viewTableBtn) viewTableBtn.classList.toggle('active', isTable);
  if (isTable) {
    renderDashboardTable();
  } else {
    renderDashboardCards();
  }
  renderPagination();
}

function refreshData() {
  showOverlay('Refreshing data…');
  ApiService.getAppData().then(function (data) {
    hideOverlay();
    applyAppData(data);
    populateFilters();
    populateResponsibilitySelect();
    renderReviewReminders();
    renderDashboard();
    loadNotifications(true);
    auditLoaded = false;
    const auditPanel = getEl('audit');
    if (auditPanel && !auditPanel.classList.contains('hidden')) {
      renderAuditPanel();
    }
    EventBus.emit('DataRefreshed');
    showToast('Dashboard refreshed', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Refresh failed: ' + (err.message || err), 'error');
  });
}

/* ---------------------------------- Analytics ---------------------------------- */

function renderAnalytics() {
  const summary = appState.summary || {};
  const analytics = appState.analytics || {};
  const trendPrev = (analytics.trendPrev && analytics.trendPrev.length) ? analytics.trendPrev[analytics.trendPrev.length - 1].value : 0;
  const trendCurr = (analytics.trend && analytics.trend.length) ? analytics.trend[analytics.trend.length - 1].value : 0;
  const trendDir = trendCurr > trendPrev ? 'up' : trendCurr < trendPrev ? 'down' : 'flat';
  const trendLabel = trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→';
  const trendClass = trendDir === 'up' ? 'trend-up' : trendDir === 'down' ? 'trend-down' : 'trend-flat';

  const cards = [
    { title: 'Total records', value: summary.total || 0, trend: '' },
    { title: 'Review due', value: summary.flagged || 0, trend: '' },
    { title: 'Normal items', value: summary.normal || 0, trend: '' },
    { title: 'This month', value: trendCurr, trend: trendLabel, trendClass: trendClass }
  ].map(function (item) {
    return `<div class="analytics-card"><h3>${item.title}</h3><p>${item.value}${item.trend ? ' <span class="' + item.trendClass + '">' + item.trend + '</span>' : ''}</p></div>`;
  }).join('');
  getEl('analyticsCards').innerHTML = cards;

  const sectors = (analytics.sectors) || [];
  const offices = (analytics.offices) || [];
  const flagged = (analytics.flaggedItems) || [];
  const trend = (analytics.trend) || [];

  let reportHtml = `
    <div class="card">
      <h3>Records by sector</h3>
      <ul>${sectors.length ? sectors.map(function (s) {
        return `<li>${escapeHtml(s.sector)}: ${s.total}</li>`;
      }).join('') : '<li>No sector data</li>'}</ul>
    </div>`;

  if (offices.length) {
    reportHtml += `
    <div class="card">
      <h3>Records by office</h3>
      <ul>${offices.map(function (o) {
        return `<li>${escapeHtml(o.office)}: ${o.total}</li>`;
      }).join('')}</ul>
    </div>`;
  }

  if (trend.length) {
    reportHtml += `
    <div class="card">
      <h3>New records by month</h3>
      <ul>${trend.slice(-12).map(function (t) {
        return `<li>${escapeHtml(t.key)}: ${t.value}</li>`;
      }).join('')}</ul>
    </div>`;
  }

  reportHtml += `
    <div class="card">
      <h3>Flagged items (review due)</h3>
      <ul>${flagged.length ? flagged.slice(0, 50).map(function (item) {
        return `<li>#${escapeHtml(item.id)} — ${escapeHtml(item.sector)}${item.reviewDate ? ' · due ' + escapeHtml(item.reviewDate) : ''}</li>`;
      }).join('') : '<li>No flagged items</li>'}</ul>
    </div>`;

  getEl('analyticsReport').innerHTML = reportHtml;
}

/* ---------------------------------- Audit ---------------------------------- */

function auditValue(row, key) {
  return row[key] == null ? '' : String(row[key]);
}

function renderAudit() {
  const table = getEl('auditTable');
  if (!table) return;
  const key = appState.auditSortKey;
  const dir = appState.auditSortDir;
  const rows = appState.audit.slice().sort(function (a, b) {
    const av = auditValue(a, key).toLowerCase();
    const bv = auditValue(b, key).toLowerCase();
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  table.querySelectorAll('thead th[data-sort]').forEach(function (th) {
    const sortKey = th.getAttribute('data-sort');
    if (sortKey === key) {
      th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
    } else {
      th.removeAttribute('aria-sort');
    }
  });

  const selected = {};
  appState.selectedAuditRows.forEach(function (r) { selected[r] = true; });

  const tbody = table.querySelector('tbody');
  const totalRows = rows.length;
  const pages = Math.max(1, Math.ceil(totalRows / AUDIT_PAGE_SIZE));
  if (appState.auditPage > pages) appState.auditPage = pages;
  const start = (appState.auditPage - 1) * AUDIT_PAGE_SIZE;
  const pageRows = rows.slice(start, start + AUDIT_PAGE_SIZE);

  tbody.innerHTML = pageRows.length ? pageRows.map(function (row) {
    const rowNum = Number(row.row);
    const selectable = isFinite(rowNum) && rowNum >= 2;
    const checkbox = appState.isAdmin && selectable
      ? `<input type="checkbox" class="audit-row-check" data-row="${rowNum}"${selected[rowNum] ? ' checked' : ''} onchange="updateAuditSelection()" aria-label="Select this audit entry">`
      : '';
    return `
      <tr>
        <td class="audit-check-col">${checkbox}</td>
        <td class="preserve-whitespace">${escapeHtml(row.timestamp)}</td>
        <td class="preserve-whitespace">${escapeHtml(row.user)}</td>
        <td class="preserve-whitespace">${renderLinkableText(row.action)}</td>
        <td class="preserve-whitespace">${renderLinkableText(row.recordId)}</td>
        <td class="details-cell preserve-whitespace">${renderLinkableText(row.details)}</td>
      </tr>`;
  }).join('') : '<tr><td colspan="6">No audit entries yet.</td></tr>';

  updateAuditSelection();

  const summaryEl = getEl('auditSummary');
  if (summaryEl) summaryEl.textContent = totalRows
    ? (start + 1) + '–' + Math.min(start + AUDIT_PAGE_SIZE, totalRows) + ' of ' + totalRows + ' entries'
    : 'No entries';
  renderAuditPager();
}

function renderAuditPager() {
  const pager = getEl('auditPager');
  if (!pager) return;
  const total = appState.audit.length;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  pager.innerHTML = pages <= 1 ? '' : `
    <button class="page-btn" type="button" onclick="setAuditPage(${appState.auditPage - 1})" ${appState.auditPage <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
    <span class="page-info">Page ${appState.auditPage} of ${pages}</span>
    <button class="page-btn" type="button" onclick="setAuditPage(${appState.auditPage + 1})" ${appState.auditPage >= pages ? 'disabled' : ''} aria-label="Next page">›</button>`;
}

function setAuditPage(page) {
  const pages = Math.max(1, Math.ceil(appState.audit.length / AUDIT_PAGE_SIZE));
  appState.auditPage = Math.min(Math.max(1, page), pages);
  renderAudit();
}

function auditSelectedRows() {
  const selected = [];
  document.querySelectorAll('#auditTable .audit-row-check:checked').forEach(function (cb) {
    selected.push(Number(cb.getAttribute('data-row')));
  });
  return selected;
}

function updateAuditSelection() {
  appState.selectedAuditRows = auditSelectedRows();
  const boxes = document.querySelectorAll('#auditTable .audit-row-check');
  const selectAll = getEl('auditSelectAll');
  if (selectAll) {
    selectAll.checked = boxes.length > 0 && appState.selectedAuditRows.length === boxes.length;
    selectAll.disabled = !appState.isAdmin || boxes.length === 0;
  }
  const deleteBtn = getEl('deleteAuditBtn');
  if (deleteBtn) deleteBtn.disabled = appState.selectedAuditRows.length === 0;
  const clearBtn = getEl('clearAuditBtn');
  if (clearBtn) clearBtn.classList.toggle('hidden', !appState.isAdmin);
}

function toggleAuditSelectAll() {
  const selectAll = getEl('auditSelectAll');
  const checked = !!selectAll && selectAll.checked;
  document.querySelectorAll('#auditTable .audit-row-check').forEach(function (cb) {
    cb.checked = checked;
  });
  updateAuditSelection();
}

function deleteAuditRows() {
  const rows = appState.selectedAuditRows.slice().sort(function (a, b) { return a - b; });
  if (!rows.length) { showToast('Select audit entries to delete', 'warning'); return; }
  showConfirm({
    title: 'Delete audit entries',
    message: 'Delete ' + rows.length + ' selected audit entr' + (rows.length === 1 ? 'y' : 'ies') + '?',
    okLabel: 'Delete',
    danger: true
  }).then(function (ok) {
    if (!ok) return;
    showOverlay('Deleting audit entries…');
    ApiService.adminDeleteAuditRows(rows).then(function (result) {
      hideOverlay();
      appState.audit = result || [];
      appState.selectedAuditRows = [];
      appState.auditPage = 1;
      auditLoaded = true;
      renderAudit();
      showToast('Deleted ' + rows.length + ' audit entr' + (rows.length === 1 ? 'y' : 'ies'), 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Could not delete audit entries: ' + (err.message || err), 'error');
    });
  });
}

function clearAuditLog() {
  showConfirm({
    title: 'Clear audit log',
    message: 'Delete the ENTIRE audit log? This cannot be undone.',
    okLabel: 'Clear log',
    danger: true
  }).then(function (ok) {
    if (!ok) return;
    showOverlay('Clearing audit log…');
    ApiService.adminClearAudit().then(function (result) {
      hideOverlay();
      appState.audit = result || [];
      appState.selectedAuditRows = [];
      appState.auditPage = 1;
      auditLoaded = true;
      renderAudit();
      showToast('Audit log cleared', 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Could not clear audit log: ' + (err.message || err), 'error');
    });
  });
}

function setAuditSort(key) {
  if (key === appState.auditSortKey) {
    appState.auditSortDir = appState.auditSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    appState.auditSortKey = key;
    appState.auditSortDir = key === 'timestamp' ? 'desc' : 'asc';
  }
  appState.auditPage = 1;
  renderAudit();
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
  }
  fallbackCopy(text);
  return Promise.resolve();
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (err) {}
  document.body.removeChild(ta);
}

function auditAsText() {
  return appState.audit.map(function (row) {
    return [row.timestamp, row.user, row.action, row.recordId, row.details].join('\t');
  }).join('\n');
}

function copyAudit() {
  copyText(auditAsText()).then(function () {
    showToast('Audit log copied to clipboard', 'success');
  }, function () {
    showToast('Could not copy audit log', 'error');
  });
}

function toCsv(rows) {
  return rows.map(function (row) {
    return row.map(function (cell) {
      return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\r\n');
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

function downloadAuditCsv() {
  const headers = ['Time', 'User', 'Action', 'Record', 'Details'];
  const rows = appState.audit.map(function (row) {
    return [row.timestamp, row.user, row.action, row.recordId, row.details];
  });
  downloadTextFile('IndiaPostDashboard_Audit_' + new Date().toISOString().slice(0, 10) + '.csv', toCsv([headers].concat(rows)), 'text/csv;charset=utf-8');
  showToast('Audit CSV downloaded', 'success');
}

function printAudit() {
  const entries = appState.audit || [];
  const rowsHtml = entries.length ? entries.map(function (row) {
    return `
      <tr>
        <td class="preserve-whitespace">${escapeHtml(row.timestamp)}</td>
        <td>${escapeHtml(row.user)}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml(row.recordId)}</td>
        <td>${escapeHtml(row.details)}</td>
      </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No audit entries yet.</td></tr>';

  const count = entries.length;
  const title = appState.settings.appName || 'India Post Dashboard';
  const now = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} - Audit Log</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; font-size: 12px; }
  .report-header { border-bottom: 3px solid #1f5c2e; padding-bottom: 8px; margin-bottom: 12px; }
  .report-header h1 { margin: 0; font-size: 18px; color: #1f5c2e; }
  .report-header .meta { margin-top: 4px; color: #6b7280; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 5px 7px; text-align: left; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  th { background: #1f5c2e; color: #fff; font-weight: 600; white-space: nowrap; }
  td.preserve-whitespace { white-space: pre-wrap; }
  tr:nth-child(even) td { background: #f9fafb; }
  .empty { text-align: center; color: #6b7280; padding: 16px; }
  .report-footer { margin-top: 12px; color: #6b7280; font-size: 10px; }
</style>
</head>
<body>
  <div class="report-header">
    <h1>${escapeHtml(title)} - Audit Log</h1>
    <div class="meta">Generated ${escapeHtml(now)} &middot; ${count} entr${count === 1 ? 'y' : 'ies'}</div>
  </div>
  <table>
    <thead>
      <tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="report-footer">India Post Dashboard &middot; Circle Office Haryana</div>
  <script>window.onload = function () { window.focus(); setTimeout(function () { window.print(); }, 100); };<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=980,height=720');
  if (!win) { showToast('Pop-up blocked. Please allow pop-ups to print the audit log.', 'error'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ---------------------------------- Reports ---------------------------------- */

function renderReportPreview() {
  const wrap = getEl('reportPreview');
  if (!wrap) return;
  const templateKey = getEl('reportTemplate') ? getEl('reportTemplate').value : 'summary';
  let items = appState.items || [];
  if (templateKey === 'flagged') items = items.filter(function (i) { return i.flagged; });
  const itemsHtml = items.map(function (item) {
    return `
      <tr>
        <td class="preserve-whitespace">${escapeHtml(item.id)}</td>
        <td class="preserve-whitespace">${renderLinkableText(item.sector)}</td>
        <td class="preserve-whitespace">${renderLinkableText(item.description)}</td>
        <td class="preserve-whitespace">${item.actionHtml || renderLinkableText(item.action)}</td>
        <td class="preserve-whitespace">${renderLinkableText(item.responsibility)}</td>
        <td class="preserve-whitespace">${renderLinkableText(item.reviewDate)}</td>
      </tr>`;
  }).join('');
  wrap.innerHTML = `
    <h3>Report preview (${templateKey})</h3>
    <div class="report-preview-scroll">
      <table class="data-table">
        <thead><tr><th>#</th><th>Sector</th><th>Description</th><th>Action</th><th>Responsibility</th><th>Review</th></tr></thead>
        <tbody>${itemsHtml || '<tr><td colspan="6">No records to report.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function downloadReportCsv() {
  const headers = ['#', 'Sector', 'Description', 'Entry Date', 'Action', 'Responsibility', 'Review Date', 'Flagged'];
  const rows = (appState.items || []).map(function (item) {
    return [item.id, item.sector, item.description, item.entryDate, item.action, item.responsibility, item.reviewDate, item.flagged ? 'YES' : 'NO'];
  });
  downloadTextFile('IndiaPostDashboard_Report_' + new Date().toISOString().slice(0, 10) + '.csv', toCsv([headers].concat(rows)), 'text/csv;charset=utf-8');
  showToast('Report CSV downloaded', 'success');
}

function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=980,height=720');
  if (!win) { showToast('Pop-up blocked. Please allow pop-ups to print.', 'error'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function buildPrintPage(opts) {
  const title = opts.title || (appState.settings.appName || 'India Post Dashboard');
  const now = new Date().toLocaleString();
  const subtitle = opts.subtitle ? ' &middot; ' + escapeHtml(opts.subtitle) : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: ${opts.landscape ? 'A4 landscape' : 'A4 portrait'}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; font-size: 12px; }
  .report-header { border-bottom: 3px solid #1f5c2e; padding-bottom: 8px; margin-bottom: 12px; }
  .report-header h1 { margin: 0; font-size: 18px; color: #1f5c2e; }
  .report-header .meta { margin-top: 4px; color: #6b7280; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 5px 7px; text-align: left; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  th { background: #1f5c2e; color: #fff; font-weight: 600; white-space: nowrap; }
  td.num { white-space: nowrap; }
  tr:nth-child(even) td { background: #f9fafb; }
  .empty { text-align: center; color: #6b7280; padding: 16px; }
  .sub-block { background: #f3f7f4; border-left: 3px solid #1f5c2e; margin-top: 6px; padding: 8px 10px; }
  .sub-block h2, .sub-block h4 { margin: 0 0 6px; font-size: 12px; color: #1f5c2e; }
  .sub-item { padding: 4px 0; border-bottom: 1px dotted #d1d5db; }
  .sub-item:last-child { border-bottom: none; }
  .sub-meta { color: #6b7280; font-size: 10px; }
  .preserve-whitespace { white-space: pre-wrap; }
  .report-footer { margin-top: 12px; color: #6b7280; font-size: 10px; }
</style>
</head>
<body>
  <div class="report-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Generated ${escapeHtml(now)}${subtitle}</div>
  </div>
  ${opts.body}
  <div class="report-footer">India Post Dashboard &middot; Circle Office Haryana</div>
  <script>window.onload = function () { window.focus(); setTimeout(function () { window.print(); }, 100); };<\/script>
</body>
</html>`;
}

function groupSubmissionsByCard_(list) {
  const map = {};
  (list || []).forEach(function (s) {
    const key = Number(s.cardRow);
    if (!map[key]) map[key] = [];
    map[key].push(s);
  });
  return map;
}

function countSubmissions_(map) {
  let n = 0;
  Object.keys(map || {}).forEach(function (k) { n += map[k].length; });
  return n;
}

function printCard(row, includeSubmissions) {
  const item = (appState.items || []).find(function (x) { return Number(x.row) === Number(row); });
  if (!item) { showToast('Record not found.', 'error'); return; }
  const useSubs = includeSubmissions === true;

  const build = function (subs) {
    const fields = (item.displayFields || []).map(function (field) {
      const label = String(field && field.label || '').trim();
      const value = field.html ? field.html : escapeHtml(field.value);
      return `
        <tr>
          <th style="width:32%">${escapeHtml(label || 'Value')}</th>
          <td class="preserve-whitespace">${value}</td>
        </tr>`;
    }).join('');

    const subsHtml = (subs && subs.length) ? `
      <h2 style="margin:16px 0 6px;font-size:14px;color:#1f5c2e;">Submissions (${subs.length})</h2>
      <div class="sub-block">
        ${subs.map(function (s) {
          return `
          <div class="sub-item">
            <div class="sub-meta">${escapeHtml(s.email)} &middot; ${escapeHtml(s.createdAt || '')}</div>
            <div class="preserve-whitespace">${escapeHtml(s.text || '')}</div>
          </div>`;
        }).join('')}
      </div>` : '';

    openPrintWindow(buildPrintPage({
      title: (appState.settings.appName || 'India Post Dashboard') + ' - Record #' + item.id,
      subtitle: (useSubs ? 'with submissions' : 'without submissions') + ' &middot; Record #' + item.id + (item.sector ? ' &middot; ' + item.sector : ''),
      body: `<table class="fields-table">
        <tbody>${fields || '<tr><td colspan="2" class="empty">No details available.</td></tr>'}</tbody>
      </table>${subsHtml}`
    }));
  };

  if (useSubs) {
    showOverlay('Preparing print…');
    ApiService.getSubmissions(Number(row)).then(function (list) {
      hideOverlay();
      build(list || []);
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Could not load submissions: ' + (err.message || err), 'error');
    });
  } else {
    build([]);
  }
}

function printReport(includeSubmissions) {
  const items = appState.items || [];
  const useSubs = includeSubmissions === true;

  const run = function (subMap) {
    const rowsHtml = items.length ? items.map(function (item) {
      const subs = (subMap && subMap[Number(item.row)]) || [];
      const subsHtml = subs.length ? `
        <tr><td colspan="6" class="sub-block">
          <h4>Submissions (${subs.length})</h4>
          ${subs.map(function (s) {
            return `
            <div class="sub-item">
              <div class="sub-meta">${escapeHtml(s.email)} &middot; ${escapeHtml(s.createdAt || '')}</div>
              <div class="preserve-whitespace">${escapeHtml(s.text || '')}</div>
            </div>`;
          }).join('')}
        </td></tr>` : '';
      return `
        <tr>
          <td class="num">${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.sector)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.action)}</td>
          <td>${escapeHtml(item.responsibility)}</td>
          <td>${escapeHtml(item.reviewDate)}</td>
        </tr>${subsHtml}`;
    }).join('') : '<tr><td colspan="6" class="empty">No records to report.</td></tr>';

    const count = items.length;
    const subCount = useSubs ? countSubmissions_(subMap) : 0;
    const subtitle = useSubs
      ? count + ' record' + (count === 1 ? '' : 's') + ' &middot; with submissions (' + subCount + ')'
      : count + ' record' + (count === 1 ? '' : 's') + ' &middot; without submissions';

    openPrintWindow(buildPrintPage({
      title: (appState.settings.appName || 'India Post Dashboard') + ' - Report',
      landscape: true,
      subtitle: subtitle,
      body: `<table>
        <thead>
          <tr><th>#</th><th>Sector</th><th>Description</th><th>Action</th><th>Responsibility</th><th>Review</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`
    }));
  };

  if (useSubs) {
    showOverlay('Preparing report…');
    ApiService.getSubmissions().then(function (list) {
      hideOverlay();
      run(groupSubmissionsByCard_(list || []));
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Could not load submissions: ' + (err.message || err), 'error');
    });
  } else {
    run(null);
  }
}

function downloadFromBase64(base64, filename, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'IndiaPostDashboard_Report';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

function exportSpreadsheet() {
  showOverlay('Exporting Excel file…');
  ApiService.exportToSpreadsheet().then(function (result) {
    hideOverlay();
    if (result && result.base64) {
      downloadFromBase64(result.base64, result.filename || 'IndiaPostDashboard_Report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      showToast('Excel file downloaded', 'success');
    } else {
      showToast('Excel export failed', 'error');
    }
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Excel export failed: ' + (err.message || err), 'error');
  });
}

function downloadPdf() {
  showOverlay('Generating PDF…');
  ApiService.createPdfReport().then(function (result) {
    hideOverlay();
    if (result && result.base64) {
      downloadFromBase64(result.base64, result.filename || 'IndiaPostDashboard_Report.pdf', 'application/pdf');
      showToast('PDF downloaded', 'success');
    } else {
      showToast('PDF export failed', 'error');
    }
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('PDF export failed: ' + (err.message || err), 'error');
  });
}

/* ---------------------------------- Settings ---------------------------------- */

function renderSettings() {
  getEl('mustChangeBanner').classList.toggle('hidden', !appState.mustChange);

  const usersAdmin = getEl('usersAdmin');
  const userActivityCard = getEl('userActivityCard');
  if (appState.isAdmin && can('users', 'view')) {
    usersAdmin.classList.remove('hidden');
    if (userActivityCard) userActivityCard.classList.remove('hidden');
    loadUsers();
    loadUserActivity();
  } else {
    usersAdmin.classList.add('hidden');
    if (userActivityCard) userActivityCard.classList.add('hidden');
  }
}

function loadUsers() {
  ApiService.adminGetUsers().then(function (users) {
    renderUsersTable(users || []);
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not load users: ' + (err.message || err), 'error');
  });
}

function renderUsersTable(users) {
  const tbody = getEl('usersTable').querySelector('tbody');
  tbody.dataset.users = JSON.stringify(users);
  tbody.innerHTML = users.length ? users.map(function (u, i) {
    const username = escapeHtml(u.username || '');
    const group = escapeHtml(u.group || '');
    const dept = escapeHtml(u.department || '');
    const office = escapeHtml(u.office || '');
    const resetPending = !!(u.resetRequested && String(u.resetRequested).trim());
    const resetBadge = resetPending
      ? ' <span class="badge" data-tone="warning" title="Requested at ' + escapeHtml(String(u.resetRequested)) + '">Reset request received</span>'
      : '';
    return `
      <tr${resetPending ? ' class="row-reset-requested"' : ''}>
        <td class="preserve-whitespace">${escapeHtml(u.email)}${u.mustChange ? ' <em>(must change)</em>' : ''}${resetBadge}</td>
        <td class="preserve-whitespace">${username || '<span class="badge" data-tone="muted">—</span>'}</td>
        <td>${escapeHtml(u.role)}</td>
        <td class="preserve-whitespace">${group || '<span class="badge" data-tone="muted">—</span>'}</td>
        <td class="preserve-whitespace">${dept || '<span class="badge" data-tone="muted">—</span>'}</td>
        <td class="preserve-whitespace">${office || '<span class="badge" data-tone="muted">—</span>'}</td>
        <td class="preserve-whitespace">${escapeHtml(u.createdAt || '')}</td>
        <td><button class="btn btn-secondary btn-small" type="button" data-action="reset" data-index="${i}">Reset password</button></td>
        <td><button class="btn btn-secondary btn-small" type="button" data-action="edit" data-index="${i}">Edit</button></td>
        <td><button class="btn btn-danger btn-small" type="button" data-action="delete" data-index="${i}">Delete</button></td>
      </tr>`;
  }).join('') : '<tr><td colspan="10">No users found.</td></tr>';
}

function loadUserActivity() {
  ApiService.adminGetUserActivity().then(function (activity) {
    renderUserActivity(activity || {});
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not load user activity: ' + (err.message || err), 'error');
  });
}

function renderUserActivity(activity) {
  const totals = activity.totals || {};
  const statsEl = getEl('activityStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="activity-stat"><span class="activity-stat-value">${totals.events || 0}</span><span class="activity-stat-label">Events (tracked)</span></div>
      <div class="activity-stat"><span class="activity-stat-value">${totals.logins || 0}</span><span class="activity-stat-label">Logins</span></div>
      <div class="activity-stat"><span class="activity-stat-value">${totals.activeUsers || 0}</span><span class="activity-stat-label">Active users</span></div>`;
  }
  const tbody = getEl('activityTableBody');
  if (tbody) {
    tbody.innerHTML = (activity.users || []).map(function (u) {
      return `
        <tr>
          <td class="preserve-whitespace">${escapeHtml(u.email)}</td>
          <td>${u.actions || 0}</td>
          <td>${u.logins || 0}</td>
          <td class="preserve-whitespace">${escapeHtml(u.lastSeen || '')}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="4">No activity recorded yet.</td></tr>';
  }
  const recent = getEl('activityRecentList');
  if (recent) {
    recent.innerHTML = (activity.recent || []).map(function (row) {
      return `
        <li class="activity-recent-item">
          <span class="badge" data-tone="muted">${escapeHtml(row.action)}</span>
          <span class="preserve-whitespace">${escapeHtml(row.user)}</span>
          <span class="preserve-whitespace activity-recent-time">${escapeHtml(row.timestamp)}</span>
        </li>`;
    }).join('') || '<li class="activity-recent-item">No recent activity.</li>';
  }
}

function exportUsers() {
  if (!appState.isAdmin) { showToast('Admin access required', 'error'); return; }
  showOverlay('Preparing CSV…');
  ApiService.adminExportUsers().then(function (csv) {
    hideOverlay();
    downloadTextFile('IndiaPostDashboard_Users_' + new Date().toISOString().slice(0, 10) + '.csv', csv || '', 'text/csv;charset=utf-8');
    showToast('Users CSV downloaded', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Export failed: ' + (err.message || err), 'error');
  });
}

function importUsersFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const csv = String(e.target.result || '');
    if (!csv.trim()) { showToast('The file is empty', 'error'); return; }
    showOverlay('Importing users…');
    ApiService.adminImportUsers(csv).then(function (result) {
      hideOverlay();
      renderUsersTable((result && result.users) || []);
      const errors = (result && result.errors) || [];
      const summary = 'Imported: ' + (result.added || 0) + ' added, ' + (result.updated || 0) + ' updated' + (errors.length ? ', ' + errors.length + ' errors' : '');
      showToast(summary, errors.length ? 'warning' : 'success');
      if (errors.length) {
        console.warn('User import errors', errors);
      }
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Import failed: ' + (err.message || err), 'error');
    });
  };
  reader.readAsText(file);
}

function triggerUserImport() {
  const input = getEl('userImportFile');
  if (input) input.click();
}

function openEditUser(email) {
  const usersTable = getEl('usersTable');
  const tbody = usersTable ? usersTable.querySelector('tbody') : null;
  const users = JSON.parse((tbody && tbody.dataset.users) || '[]');
  const u = users.find(function (x) { return String(x.email).toLowerCase() === String(email).toLowerCase(); });
  if (!u) return;
  getEl('editUserEmail').value = u.email;
  getEl('editUserUsername').value = u.username || '';
  getEl('editUserRole').value = u.role || 'VIEWER';
  getEl('editUserGroup').value = u.group || '';
  getEl('editUserDepartment').value = u.department || '';
  getEl('editUserOffice').value = u.office || '';
  openDialog('editUserModal');
}

function closeEditUser() {
  closeDialog('editUserModal');
}

function saveEditUser() {
  const emailEl = getEl('editUserEmail');
  const email = emailEl.value.trim();
  const fields = {
    email: email,
    username: getEl('editUserUsername').value.trim(),
    role: getEl('editUserRole').value,
    group: getEl('editUserGroup').value.trim(),
    department: getEl('editUserDepartment').value.trim(),
    office: getEl('editUserOffice').value.trim()
  };
  if (!setFieldInvalid(emailEl, email ? '' : 'Enter an email address.')) return;
  showOverlay('Saving user…');
  ApiService.adminUpdateUser(email, fields).then(function (res) {
    hideOverlay();
    closeEditUser();
    const result = res || {};
    renderUsersTable(result.users || []);
    showToast(result.message || 'User updated', 'success');
    if (result.reAuth) {
      setAuthToken('');
      try { window.sessionStorage.setItem(STORAGE_REAUTH_MSG, 'Your email was changed. Please log in with your new email.'); } catch (err) {}
      window.location.reload();
    }
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Update failed: ' + (err.message || err), 'error');
  });
}

function handleAddUser(e) {
  e.preventDefault();
  if (!appState.isAdmin) { showToast('Admin access required', 'error'); return; }
  const emailEl = getEl('newUserEmail');
  const usernameEl = getEl('newUserUsername');
  const roleEl = getEl('newUserRole');
  const passwordEl = getEl('newUserPassword');
  const groupEl = getEl('newUserGroup');
  const departmentEl = getEl('newUserDepartment');
  const officeEl = getEl('newUserOffice');
  const email = emailEl.value.trim();
  const username = (usernameEl && usernameEl.value.trim()) || '';
  const role = roleEl.value;
  const password = passwordEl.value;
  const group = (groupEl && groupEl.value) || '';
  const department = (departmentEl && departmentEl.value) || '';
  const office = (officeEl && officeEl.value) || '';

  let valid = true;
  valid = setFieldInvalid(emailEl, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Enter a valid email address.') && valid;
  valid = setFieldInvalid(passwordEl, password.length >= 8 ? '' : 'Password must be at least 8 characters.') && valid;
  if (!valid) return;

  showOverlay('Adding user…');
  ApiService.adminAddUser(email, username, role, password, group, department, office).then(function (users) {
    hideOverlay();
    emailEl.value = '';
    if (usernameEl) usernameEl.value = '';
    passwordEl.value = '';
    if (groupEl) groupEl.value = '';
    if (departmentEl) departmentEl.value = '';
    if (officeEl) officeEl.value = '';
    const status = getEl('addUserStatus');
    status.textContent = 'User added';
    status.classList.add('success');
    setTimeout(function () {
      status.textContent = '';
      status.classList.remove('success');
    }, 3000);
    renderUsersTable(users || []);
    showToast('User added', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    const status = getEl('addUserStatus');
    status.textContent = err.message || 'Could not add user';
    status.classList.add('error');
  });
}

function handleChangePassword(e) {
  e.preventDefault();
  const currentEl = getEl('changeCurrentPassword');
  const newEl = getEl('changeNewPassword');
  const confirmEl = getEl('changeConfirmPassword');
  const current = currentEl.value;
  const np = newEl.value;
  const cp = confirmEl.value;

  let valid = true;
  valid = setFieldInvalid(currentEl, current ? '' : 'Enter your current password.') && valid;
  valid = setFieldInvalid(newEl, np.length >= 8 ? '' : 'Password must be at least 8 characters.') && valid;
  if (np !== cp) {
    setFieldInvalid(confirmEl, 'Passwords do not match.');
    valid = false;
  } else {
    setFieldInvalid(confirmEl, '');
  }
  if (!valid) return;

  showOverlay('Updating password…');
  ApiService.changePassword(current, np).then(function (res) {
    hideOverlay();
    const status = getEl('changePasswordStatus');
    if (res && res.success) {
      currentEl.value = '';
      newEl.value = '';
      confirmEl.value = '';
      appState.mustChange = false;
      getEl('mustChangeBanner').classList.add('hidden');
      status.textContent = (res && res.message) || 'Password updated';
      status.classList.add('success');
      showToast('Password updated', 'success');
      EventBus.emit('SettingsUpdated');
    } else {
      status.textContent = (res && res.message) || 'Could not update password';
      status.classList.add('error');
    }
    setTimeout(function () {
      status.textContent = '';
      status.classList.remove('success');
      status.classList.remove('error');
    }, 3500);
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    const status = getEl('changePasswordStatus');
    status.textContent = err.message || 'Could not update password';
    status.classList.add('error');
  });
}

function deleteUser(email) {
  showConfirm({
    title: 'Delete user',
    message: 'Delete user ' + email + '? They will no longer be able to sign in.',
    okLabel: 'Delete',
    danger: true
  }).then(function (ok) {
    if (!ok) return;
    showOverlay('Deleting user…');
    ApiService.adminDeleteUser(email).then(function (users) {
      hideOverlay();
      renderUsersTable(users || []);
      showToast('User deleted', 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Delete failed: ' + (err.message || err), 'error');
    });
  });
}

function resetUserPassword(email) {
  const newPassword = prompt('New password for ' + email + ' (min 8 characters):');
  if (!newPassword) return;
  showOverlay('Resetting password…');
  ApiService.adminResetPassword(email, newPassword).then(function (users) {
    hideOverlay();
    renderUsersTable(users || []);
    showToast('Password reset for ' + email, 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Reset failed: ' + (err.message || err), 'error');
  });
}

/* ---------------------------------- Record detail dialog ---------------------------------- */
/* Read-only drill-down for any record (S8): shows every display field plus the
   review status and submission count, with contextual actions. */

function openRecordDetail(row) {
  const item = appState.items.find(function (i) { return String(i.row) === String(row); });
  if (!item) return;
  const fieldsHtml = (item.displayFields || []).map(function (field) {
    const valueHtml = field.html
      ? `<div class="detail-value preserve-whitespace field-html">${field.html}</div>`
      : `<div class="detail-value preserve-whitespace">${escapeHtml(field.value)}</div>`;
    return `
      <div class="about-row detail-row">
        <span class="detail-label">${escapeHtml(field.label || 'Value')}</span>
        ${valueHtml}
      </div>`;
  }).join('');

  const subCount = (appState.submissionCounts || {})[item.row] || 0;
  const statusBadge = item.reviewStatus === 'due'
    ? '<span class="review-badge review-due">Review due</span>'
    : item.reviewStatus === 'done'
      ? '<span class="review-badge review-done">Review done</span>'
      : '<span class="badge" data-tone="muted">Not reviewed</span>';

  getEl('recordDetailTitle').textContent = 'Record #' + (item.id || item.row);
  getEl('recordDetailBody').innerHTML = `
    <div class="detail-status">${statusBadge}<span class="form-status">${subCount} submission${subCount === 1 ? '' : 's'}</span></div>
    <div class="about-rows">${fieldsHtml}</div>`;

  let actionsHtml = '';
  if (appState.isEditor) {
    actionsHtml += `<button class="btn btn-primary" type="button" onclick="closeRecordDetail(); editItem('${escAttr(item.row)}');">Edit</button>`;
    actionsHtml += `<button class="btn btn-secondary" type="button" onclick="closeRecordDetail(); submitRecordReview('${escAttr(item.row)}', '${escAttr((item.description || '').slice(0, 80))}');">Submit for review</button>`;
  }
  actionsHtml += `
    <button class="btn btn-secondary" type="button" onclick="closeRecordDetail(); openSubmissionsModal('${escAttr(item.row)}','${escAttr(item.id)}');">Submit update</button>
    <button class="btn btn-ghost" type="button" onclick="closeRecordDetail()">Close</button>`;
  getEl('recordDetailActions').innerHTML = actionsHtml;

  loadRecordDocuments(item.row);

  openDialog('recordDetailModal');
}

function loadRecordDocuments(row) {
  const docsEl = getEl('recordDetailDocs');
  if (!docsEl) return;
  ApiService.getRecordDocuments(row).then(function (docs) {
    const docsList = docs || [];
    docsEl.innerHTML = docsList.length ? `
      <div class="detail-docs-head">
        <span class="text-subheading">Documents</span>
        <label class="btn btn-ghost btn-small" style="cursor:pointer;">
          <input type="file" id="docUploadInput" style="display:none" onchange="handleDocUpload(${escAttr(row)}, this)">
          Upload
        </label>
      </div>
      <ul class="detail-docs-list">${docsList.map(function (d) {
        return '<li class="detail-doc-item">' +
          '<a href="' + escapeHtml(d.url || '#') + '" target="_blank" rel="noopener">' + escapeHtml(d.fileName) + '</a>' +
          '<button class="btn btn-ghost btn-small" type="button" onclick="deleteRecordDoc(\'' + escAttr(d.id) + '\', \'' + escAttr(row) + '\')">Remove</button>' +
          '</li>';
      }).join('')}</ul>` : '';
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
  });
}

function handleDocUpload(row, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const bytes = e.target.result;
    const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)));
    showOverlay('Uploading document…');
    ApiService.uploadDocument(row, '', file.name, base64, file.type || 'application/octet-stream').then(function () {
      hideOverlay();
      showToast('Document uploaded.', 'success');
      loadRecordDocuments(row);
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Upload failed: ' + (err.message || err), 'error');
    });
  };
  reader.readAsArrayBuffer(file);
}

function deleteRecordDoc(docId, row) {
  showConfirm({
    title: 'Delete document',
    body: 'Remove this document permanently?',
    confirmLabel: 'Delete',
    onConfirm: function () {
      showOverlay('Deleting document…');
      ApiService.deleteDocument(docId).then(function () {
        hideOverlay();
        showToast('Document removed.', 'success');
        loadRecordDocuments(row);
      }).catch(function (err) {
        hideOverlay();
        if (handleServerFailure(err)) return;
        showToast('Could not delete document.', 'error');
      });
    }
  });
}

function closeRecordDetail() {
  closeDialog('recordDetailModal');
}

function submitRecordReview(row, summary) {
  showOverlay('Submitting review request…');
  ApiService.submitRecordReview(row, summary).then(function () {
    hideOverlay();
    showToast('Review request submitted.', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not submit review: ' + (err.message || err), 'error');
  });
}

/* ---------------------------------- Approvals ---------------------------------- */

function loadApprovals() {
  return Promise.all([
    ApiService.getPendingApprovals(),
    ApiService.getMyApprovals()
  ]).then(function (results) {
    appState.pendingApprovals = results[0] || [];
    appState.myApprovals = results[1] || [];
    renderApprovals();
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not load approvals: ' + (err.message || err), 'error');
  });
}

function renderApprovals() {
  const pending = appState.pendingApprovals || [];
  const mine = appState.myApprovals || [];
  const pendingBody = getEl('approvalsPendingBody');
  const pendingEmpty = getEl('approvalsPendingEmpty');
  const myBody = getEl('approvalsMyBody');
  const myEmpty = getEl('approvalsMyEmpty');

  if (pendingBody) {
    pendingBody.innerHTML = pending.map(function (a) {
      return '<tr>' +
        '<td>' + escapeHtml('Record #' + (a.targetRow || '')) + '</td>' +
        '<td class="preserve-whitespace">' + escapeHtml(a.summary || '') + '</td>' +
        '<td>' + escapeHtml(formatNotifTime(a.submittedAt)) + '</td>' +
        '<td><button class="btn btn-primary btn-small" type="button" onclick="openReviewDialog(\'' + escapeAttr(a.id) + '\')">Review</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="4">No pending approvals.</td></tr>';
  }
  if (pendingEmpty) pendingEmpty.classList.toggle('hidden', !!pending.length);

  if (myBody) {
    myBody.innerHTML = mine.map(function (a) {
      const statusBadge = a.status === 'APPROVED'
        ? '<span class="badge" data-tone="success">Approved</span>'
        : a.status === 'REJECTED'
          ? '<span class="badge" data-tone="danger">Rejected</span>'
          : '<span class="badge" data-tone="muted">Pending</span>';
      return '<tr>' +
        '<td>' + escapeHtml('Record #' + (a.targetRow || '')) + '</td>' +
        '<td class="preserve-whitespace">' + escapeHtml(a.summary || '') + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + escapeHtml(a.reviewedBy ? formatNotifTime(a.reviewedAt) : '—') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="4">No requests yet.</td></tr>';
  }
  if (myEmpty) myEmpty.classList.toggle('hidden', !!mine.length);
}

function openReviewDialog(id) {
  getEl('reviewApprovalId').value = id;
  getEl('reviewComment').value = '';
  openDialog('reviewModal');
  const commentEl = getEl('reviewComment');
  if (commentEl) commentEl.focus();
}

function closeReviewDialog() {
  closeDialog('reviewModal');
}

function setReviewDecision(approve) {
  const id = getEl('reviewApprovalId').value;
  const comment = getEl('reviewComment').value;
  saveReview(id, approve, comment);
}

function saveReview(id, approve, comment) {
  showOverlay('Processing review…');
  ApiService.reviewApproval(id, approve, comment).then(function (result) {
    hideOverlay();
    closeReviewDialog();
    showToast('Approval ' + (approve ? 'approved' : 'rejected') + '.', 'success');
    loadApprovals();
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not process review: ' + (err.message || err), 'error');
  });
}

/* ---------------------------------- Tasks ---------------------------------- */

function renderTasks() {
  const statusFilter = getEl('taskStatusFilter');
  const priorityFilter = getEl('taskPriorityFilter');
  const filters = {};
  if (statusFilter && statusFilter.value) filters.status = statusFilter.value;
  if (priorityFilter && priorityFilter.value) filters.priority = priorityFilter.value;

  showOverlay('Loading tasks…');
  ApiService.getTasks(filters).then(function (tasks) {
    hideOverlay();
    appState.tasks = tasks || [];
    renderTaskList();
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not load tasks: ' + (err.message || err), 'error');
  });
}

function renderTaskList() {
  const tasks = appState.tasks || [];
  const tbody = getEl('tasksBody');
  const empty = getEl('tasksEmpty');
  if (tbody) {
    tbody.innerHTML = tasks.map(function (t) {
      const statusClass = t.status === 'DONE' ? 'badge-success' : t.status === 'IN_PROGRESS' ? 'badge-warning' : t.status === 'CANCELLED' ? 'badge-muted' : 'badge-danger';
      const priorityClass = t.priority === 'URGENT' ? 'badge-danger' : t.priority === 'HIGH' ? 'badge-warning' : t.priority === 'MEDIUM' ? 'badge-info' : 'badge-muted';
      return '<tr>' +
        '<td class="preserve-whitespace">' + escapeHtml(t.title || '') + '</td>' +
        '<td>' + escapeHtml(t.assignee || '') + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + escapeHtml(t.status || '') + '</span></td>' +
        '<td><span class="badge ' + priorityClass + '">' + escapeHtml(t.priority || '') + '</span></td>' +
        '<td>' + (t.dueDate ? escapeHtml(formatDate(t.dueDate)) : '') + '</td>' +
        '<td><button class="btn btn-ghost btn-small" type="button" onclick="completeTask(' + escAttr(t.id) + ')">Complete</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6">No tasks found.</td></tr>';
  }
  if (empty) empty.classList.toggle('hidden', !!tasks.length);
}

function openTaskModal() {
  openDialog('taskModal');
  const modal = getEl('taskModal');
  const firstInput = modal.querySelector('input:not([type=hidden]):not([readonly])');
  if (firstInput) firstInput.focus();
}

function closeTaskModal() {
  closeDialog('taskModal');
  getEl('taskTitle').value = '';
  getEl('taskDescription').value = '';
  getEl('taskAssignee').value = '';
  getEl('taskPriority').value = 'MEDIUM';
  getEl('taskDueDate').value = '';
  getEl('taskRecordRow').value = '';
}

function saveTask() {
  const title = getEl('taskTitle').value.trim();
  if (!title) {
    showToast('Task title is required.', 'error');
    return;
  }
  const params = {
    title: title,
    description: getEl('taskDescription').value.trim(),
    assignee: getEl('taskAssignee').value.trim(),
    priority: getEl('taskPriority').value,
    dueDate: dmyToIso(getEl('taskDueDate').value),
    recordRow: getEl('taskRecordRow').value ? Number(getEl('taskRecordRow').value) : 0
  };
  showOverlay('Creating task…');
  ApiService.createTask(params).then(function () {
    hideOverlay();
    closeTaskModal();
    showToast('Task created.', 'success');
    renderTasks();
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not create task: ' + (err.message || err), 'error');
  });
}

function completeTask(id) {
  showConfirm({
    title: 'Mark task complete',
    body: 'Mark this task as done?',
    confirmLabel: 'Done',
    onConfirm: function () {
      showOverlay('Updating task…');
      ApiService.updateTask(id, { status: 'DONE' }).then(function () {
        hideOverlay();
        showToast('Task marked complete.', 'success');
        renderTasks();
      }).catch(function (err) {
        hideOverlay();
        if (handleServerFailure(err)) return;
        showToast('Could not update task: ' + (err.message || err), 'error');
      });
    }
  });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return day + '/' + month + '/' + year;
}

/* ---------------------------------- Date picker ---------------------------------- */

var DP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var DP_WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

var datePickerState = {
  open: false,
  input: null,
  month: new Date().getMonth(),
  year: new Date().getFullYear()
};

function parseDateFieldValue(str) {
  if (!str) return null;
  str = String(str).trim();
  let m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }
  return null;
}

function formatDmy(date) {
  return String(date.getDate()).padStart(2, '0') + '.' +
    String(date.getMonth() + 1).padStart(2, '0') + '.' +
    date.getFullYear();
}

function dmyToIso(str) {
  const d = parseDateFieldValue(str);
  if (!d || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function ensureDatePickerPopup() {
  if (getEl('datePickerPopup')) return;
  const div = document.createElement('div');
  div.id = 'datePickerPopup';
  div.className = 'datepicker-popup hidden';
  div.innerHTML =
    '<div class="dp-head">' +
    '<button type="button" class="dp-nav" data-dp="prev" aria-label="Previous month">&#8249;</button>' +
    '<div class="dp-title"></div>' +
    '<button type="button" class="dp-nav" data-dp="next" aria-label="Next month">&#8250;</button>' +
    '</div>' +
    '<div class="dp-weekdays">' + DP_WEEKDAYS.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
    '<div class="dp-grid"></div>' +
    '<div class="dp-foot">' +
    '<button type="button" class="dp-btn dp-today" data-dp="today">Today</button>' +
    '<button type="button" class="dp-btn dp-clear" data-dp="clear">Clear</button>' +
    '</div>';
  div.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-dp]');
    if (!btn) return;
    const act = btn.getAttribute('data-dp');
    if (act === 'prev') {
      datePickerState.month--;
      if (datePickerState.month < 0) { datePickerState.month = 11; datePickerState.year--; }
      renderDatePicker();
    } else if (act === 'next') {
      datePickerState.month++;
      if (datePickerState.month > 11) { datePickerState.month = 0; datePickerState.year++; }
      renderDatePicker();
    } else if (act === 'today') {
      const now = new Date();
      datePickerState.month = now.getMonth();
      datePickerState.year = now.getFullYear();
      renderDatePicker();
      if (datePickerState.input) {
        datePickerState.input.value = formatDmy(now);
        datePickerState.input.dispatchEvent(new Event('change', { bubbles: true }));
        closeDatePicker();
      }
    } else if (act === 'clear') {
      if (datePickerState.input) {
        datePickerState.input.value = '';
        datePickerState.input.dispatchEvent(new Event('change', { bubbles: true }));
        closeDatePicker();
      }
    }
  });
  div.addEventListener('click', function (e) {
    const dayBtn = e.target.closest('[data-dp-day]');
    if (!dayBtn) return;
    const d = new Date(datePickerState.year, datePickerState.month, Number(dayBtn.getAttribute('data-dp-day')));
    if (datePickerState.input) {
      datePickerState.input.value = formatDmy(d);
      datePickerState.input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeDatePicker();
  });
  document.body.appendChild(div);
}

function renderDatePicker() {
  const popup = getEl('datePickerPopup');
  if (!popup) return;
  popup.querySelector('.dp-title').textContent = DP_MONTHS[datePickerState.month] + ' ' + datePickerState.year;
  const grid = popup.querySelector('.dp-grid');
  grid.innerHTML = '';
  const first = new Date(datePickerState.year, datePickerState.month, 1);
  const startCol = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(datePickerState.year, datePickerState.month + 1, 0).getDate();
  const today = new Date();
  const todayStr = formatDmy(today);
  const parsedSel = datePickerState.input ? parseDateFieldValue(datePickerState.input.value) : null;
  const selStr = parsedSel ? formatDmy(parsedSel) : '';
  for (let i = 0; i < startCol; i++) {
    const blank = document.createElement('span');
    blank.className = 'dp-cell dp-blank';
    grid.appendChild(blank);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'dp-cell';
    cell.setAttribute('data-dp-day', String(d));
    cell.textContent = String(d);
    const dstr = formatDmy(new Date(datePickerState.year, datePickerState.month, d));
    if (dstr === todayStr) cell.classList.add('dp-today');
    if (dstr === selStr) cell.classList.add('dp-selected');
    grid.appendChild(cell);
  }
}

function openDatePicker(input) {
  ensureDatePickerPopup();
  const popup = getEl('datePickerPopup');
  const field = input.closest('.date-field') || input.parentElement;
  const parsed = parseDateFieldValue(input.value);
  if (parsed) {
    datePickerState.month = parsed.getMonth();
    datePickerState.year = parsed.getFullYear();
  } else {
    const now = new Date();
    datePickerState.month = now.getMonth();
    datePickerState.year = now.getFullYear();
  }
  datePickerState.input = input;
  popup.classList.remove('hidden');
  field.appendChild(popup);
  popup.style.top = 'calc(100% + 4px)';
  popup.style.bottom = 'auto';
  const card = input.closest('.modal-card');
  const inputRect = input.getBoundingClientRect();
  const popupH = popup.offsetHeight;
  const cardRect = card ? card.getBoundingClientRect() : null;
  if (cardRect && (inputRect.bottom + popupH + 8 > cardRect.bottom)) {
    popup.style.top = 'auto';
    popup.style.bottom = 'calc(100% + 4px)';
  }
  renderDatePicker();
  datePickerState.open = true;
}

function closeDatePicker() {
  const popup = getEl('datePickerPopup');
  if (popup) popup.classList.add('hidden');
  datePickerState.open = false;
  datePickerState.input = null;
}

function initDatePicker() {
  document.addEventListener('click', function (e) {
    const field = e.target.closest('input[data-datepicker]');
    if (field) {
      e.preventDefault();
      openDatePicker(field);
      return;
    }
    const popup = getEl('datePickerPopup');
    if (popup && !popup.classList.contains('hidden') && !popup.contains(e.target)) {
      closeDatePicker();
    }
  });
}

/* ---------------------------------- Live clock ---------------------------------- */

var clockOffsetMs = 0;

function startLiveClock() {
  renderClock(new Date());
  setInterval(function () { renderClock(new Date(Date.now() + clockOffsetMs)); }, 1000);
  ApiService.getServerTime().then(function (ts) {
    const serverNow = Number(ts);
    if (serverNow > 0) clockOffsetMs = serverNow - Date.now();
  }).catch(function () {});
}

function renderClock(d) {
  const el = getEl('liveClock');
  if (!el) return;
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  el.textContent = h + ':' + mm + ':' + ss + ' ' + ampm;
}

/* ---------------------------------- Dashboard Studio ---------------------------------- */

function loadDashboardPreferences() {
  return ApiService.getDashboardPreferences().then(function (prefs) {
    appState.dashboardPrefs = prefs || { viewMode: 'cards', columns: {}, layout: {} };
    applyDashboardPreferences();
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    appState.dashboardPrefs = { viewMode: 'cards', columns: {}, layout: {} };
  });
}

function applyDashboardPreferences() {
  const prefs = appState.dashboardPrefs || {};
  if (prefs.viewMode === 'table') {
    switchView('table');
  } else {
    switchView('cards');
  }
}

function saveDashboardPreferences() {
  const columns = {};
  document.querySelectorAll('.col-toggle').forEach(function (cb) {
    columns[cb.dataset.col] = cb.checked;
  });
  const modeRadio = document.querySelector('input[name="viewMode"]:checked');
  const viewMode = modeRadio ? modeRadio.value : 'cards';
  const prefs = { viewMode: viewMode, columns: columns };
  showOverlay('Saving preferences…');
  ApiService.saveDashboardPreferences(prefs).then(function () {
    hideOverlay();
    showToast('Dashboard preferences saved.', 'success');
    appState.dashboardPrefs = prefs;
    applyDashboardPreferences();
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not save preferences.', 'error');
  });
}

function toggleColumnVisibility(colKey) {
  const cb = document.querySelector('.col-toggle[data-col="' + colKey + '"]');
  if (cb) {
    cb.checked = !cb.checked;
    renderDashboard();
  }
}

function openColumnDialog() {
  const prefs = appState.dashboardPrefs || {};
  const columns = prefs.columns || {};
  document.querySelectorAll('.col-toggle').forEach(function (cb) {
    cb.checked = columns[cb.dataset.col] !== false;
  });
  const modeRadio = document.querySelector('input[name="viewMode"][value="' + (prefs.viewMode || 'cards') + '"]');
  if (modeRadio) modeRadio.checked = true;
  openDialog('columnModal');
}

function closeColumnDialog() {
  closeDialog('columnModal');
}

/* ---------------------------------- Command Palette ---------------------------------- */

const COMMAND_ACTIONS = [
  { key: 'goto-dashboard', label: 'Go to Dashboard', shortcut: 'G D', action: function () { openTab('dashboard'); closeCommandPalette(); } },
  { key: 'goto-audit', label: 'Go to Audit log', shortcut: 'G A', action: function () { openTab('audit'); closeCommandPalette(); } },
  { key: 'goto-reports', label: 'Go to Reports', shortcut: 'G R', action: function () { openTab('reports'); closeCommandPalette(); } },
  { key: 'goto-settings', label: 'Go to Settings', shortcut: 'G S', action: function () { openTab('settings'); closeCommandPalette(); } },
  { key: 'goto-approvals', label: 'Go to Approvals', shortcut: 'G P', action: function () { openTab('approvals'); closeCommandPalette(); } },
  { key: 'goto-tasks', label: 'Go to Tasks', shortcut: 'G T', action: function () { openTab('tasks'); closeCommandPalette(); } },
  { key: 'refresh', label: 'Refresh data', shortcut: 'R', action: function () { refreshData(); closeCommandPalette(); } },
  { key: 'add-record', label: 'Add new record', shortcut: 'N', action: function () { openAddModal(); closeCommandPalette(); }, requireEditor: true },
  { key: 'toggle-theme', label: 'Toggle dark mode', shortcut: 'T', action: function () { toggleDarkMode(); closeCommandPalette(); } },
  { key: 'logout', label: 'Sign out', shortcut: 'Q', action: function () { handleLogout(); closeCommandPalette(); } }
];

function openCommandPalette() {
  openDialog('commandPalette');
  const input = getEl('commandInput');
  if (input) {
    input.value = '';
    input.focus();
    filterCommands('');
  }
}

function closeCommandPalette() {
  closeDialog('commandPalette');
}

function filterCommands(query) {
  const list = getEl('commandList');
  if (!list) return;
  const q = String(query || '').toLowerCase().trim();
  let actions = COMMAND_ACTIONS.slice();
  if (appState.isEditor === false) actions = actions.filter(function (a) { return !a.requireEditor; });
  if (q) actions = actions.filter(function (a) { return a.label.toLowerCase().indexOf(q) !== -1; });
  let records = [];
  if (q.length >= 2) {
    records = (appState.items || []).filter(function (item) {
      return String(item.id).indexOf(q) !== -1 || String(item.sector || '').toLowerCase().indexOf(q) !== -1 || String(item.description || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8).map(function (item) {
      return {
        key: 'record-' + item.row,
        label: 'Record #' + item.id + ' — ' + (item.sector || ''),
        subtitle: (item.description || '').slice(0, 60),
        action: function () { openRecordDetail(item.row); closeCommandPalette(); }
      };
    });
  }
  let html = '';
  if (actions.length) {
    html += '<div style="padding:8px 16px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Commands</div>';
    actions.forEach(function (cmd) {
      html += '<div class="command-item" data-cmd="' + escAttr(cmd.key) + '" onclick="executeCommand(\'' + escAttr(cmd.key) + '\')">' +
        '<span>' + escapeHtml(cmd.label) + '</span>' +
        '<span class="command-shortcut">' + escapeHtml(cmd.shortcut || '') + '</span></div>';
    });
  }
  if (records.length) {
    html += '<div style="padding:8px 16px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Records</div>';
    records.forEach(function (rec) {
      html += '<div class="command-item" data-cmd="' + escAttr(rec.key) + '" onclick="executeCommand(\'' + escAttr(rec.key) + '\')">' +
        '<span>' + escapeHtml(rec.label) + '</span>' +
        '<span style="color:var(--muted);font-size:12px;">' + escapeHtml(rec.subtitle || '') + '</span></div>';
    });
  }
  if (!html) html = '<div style="padding:16px;color:var(--muted);text-align:center;">No results</div>';
  list.innerHTML = html;
}

function executeCommand(key) {
  const action = COMMAND_ACTIONS.find(function (a) { return a.key === key; });
  if (action && !action.requireEditor) action.action();
  else if (key.indexOf('record-') === 0) {
    const row = key.replace('record-', '');
    const item = (appState.items || []).find(function (i) { return String(i.row) === String(row); });
    if (item) openRecordDetail(item.row);
  }
}

/* ---------------------------------- Edit modal ---------------------------------- */

function openEditModal() {
  openDialog('editModal');
  const modal = getEl('editModal');
  const firstInput = modal.querySelector('input:not([type=hidden]):not([readonly])');
  if (firstInput) firstInput.focus();
}

function closeEditModal() {
  closeDialog('editModal');
}

function resetEditForm() {
  getEl('editRow').value = '';
  getEl('editId').value = '';
  getEl('editSector').value = '';
  getEl('editDescription').value = '';
  getEl('editEntryDate').value = '';
  getEl('editAction').value = '';
  populateResponsibilitySelect();
  getEl('editResponsibility').value = '';
  getEl('editReviewDate').value = '';
  getEl('editFlagged').checked = false;
  const status = getEl('editStatus');
  if (status) { status.textContent = ''; status.classList.remove('success', 'error'); }
  ['editSector', 'editDescription'].forEach(function (id) {
    const el = getEl(id);
    if (el) setFieldInvalid(el, '');
  });
}

function addNewItem() {
  if (!appState.isEditor) { showToast('Admin/editor access required', 'warning'); return; }
  appState.editMode = 'add';
  resetEditForm();
  openEditModal();
}

function editItem(row) {
  const item = appState.items.find(function (i) { return String(i.row) === String(row); });
  if (!item) return;
  appState.editMode = 'edit';
  getEl('editRow').value = item.row;
  getEl('editId').value = item.id || '';
  getEl('editSector').value = item.sector || '';
  getEl('editDescription').value = item.description || '';
  getEl('editEntryDate').value = item.entryDate || '';
  getEl('editAction').value = item.action || '';
  populateResponsibilitySelect();
  getEl('editResponsibility').value = item.responsibility || '';
  getEl('editReviewDate').value = item.reviewDate || '';
  getEl('editFlagged').checked = !!item.flagged;
  const status = getEl('editStatus');
  if (status) { status.textContent = ''; status.classList.remove('success', 'error'); }
  ['editSector', 'editDescription'].forEach(function (id) {
    const el = getEl(id);
    if (el) setFieldInvalid(el, '');
  });
  openEditModal();
}

function saveEditModal(e) {
  e.preventDefault();
  if (!appState.isEditor) { showToast('Admin/editor access required', 'warning'); return; }

  const sectorEl = getEl('editSector');
  const descEl = getEl('editDescription');
  let valid = true;
  valid = setFieldInvalid(sectorEl, sectorEl.value.trim() ? '' : 'Sector is required.') && valid;
  valid = setFieldInvalid(descEl, descEl.value.trim() ? '' : 'Description is required.') && valid;
  if (!valid) return;

  const item = {
    row: Number(getEl('editRow').value || 0),
    id: getEl('editId').value,
    sector: sectorEl.value.trim(),
    description: descEl.value,
    entryDate: getEl('editEntryDate').value.trim(),
    action: getEl('editAction').value,
    responsibility: getEl('editResponsibility').value.trim(),
    reviewDate: getEl('editReviewDate').value.trim(),
    flagged: getEl('editFlagged').checked
  };

  if (appState.editMode === 'add') {
    submitNewItem(item);
  } else if (item.row) {
    saveItem(item);
  }
}

function submitNewItem(item) {
  showOverlay('Adding record…');
  ApiService.addItem(item).then(function (data) {
    hideOverlay();
    closeEditModal();
    appState.items = data.items || [];
    appState.summary = data.summary || {};
    appState.analytics = data.analytics || {};
    populateFilters();
    renderDashboard();
    showToast('New item created', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Add failed: ' + (err.message || err), 'error');
  });
}

function saveItem(item) {
  showOverlay('Saving record…');
  ApiService.updateItem(item).then(function (data) {
    hideOverlay();
    closeEditModal();
    appState.items = data.items || [];
    appState.summary = data.summary || {};
    appState.analytics = data.analytics || {};
    renderDashboard();
    showToast('Record saved', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Save failed: ' + (err.message || err), 'error');
  });
}

function deleteItem(row) {
  if (!appState.isEditor) { showToast('Admin/editor access required', 'warning'); return; }
  showConfirm({
    title: 'Delete record',
    message: 'Delete this record permanently? This cannot be undone.',
    okLabel: 'Delete',
    danger: true
  }).then(function (ok) {
    if (!ok) return;
    showOverlay('Deleting record…');
    ApiService.deleteItem(row).then(function (data) {
      hideOverlay();
      appState.items = data.items || [];
      appState.summary = data.summary || {};
      appState.analytics = data.analytics || {};
      renderDashboard();
      showToast('Record deleted', 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Delete failed: ' + (err.message || err), 'error');
    });
  });
}

/* ---------------------------------- Review badge ---------------------------------- */

function toggleDropdown(btn) {
  const wrap = btn.closest ? btn.closest('.menu-dropdown') : btn.parentElement;
  const menu = wrap ? wrap.querySelector('.menu-dropdown-menu') : null;
  if (!menu) return;
  const isOpen = menu.classList.toggle('open');
  closeDropdowns(menu);
  return isOpen;
}

function closeDropdowns(exceptMenu) {
  document.querySelectorAll('.menu-dropdown-menu.open').forEach(function (m) {
    if (m !== exceptMenu) m.classList.remove('open');
  });
  document.querySelectorAll('.review-dropdown-menu.open').forEach(function (m) {
    if (m !== exceptMenu) m.classList.remove('open');
  });
}

function toggleReviewDropdown(btn) {
  const menu = btn.parentElement.querySelector('.review-dropdown-menu');
  if (!menu) return;
  const isOpen = menu.classList.toggle('open');
  document.querySelectorAll('.review-dropdown-menu.open').forEach(function (m) {
    if (m !== menu) m.classList.remove('open');
  });
  return isOpen;
}

function markReviewDone(row) {
  if (!appState.isAdmin) { showToast('Admin access required', 'warning'); return; }
  showConfirm({
    title: 'Mark review done',
    message: 'Mark this record as review done?',
    okLabel: 'Mark done'
  }).then(function (ok) {
    if (!ok) return;
    showOverlay('Marking review as done…');
    ApiService.markReviewDone(row).then(function (data) {
      hideOverlay();
      appState.items = data.items || [];
      appState.summary = data.summary || {};
      renderDashboard();
      showToast('Marked review as done', 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Failed: ' + (err.message || err), 'error');
    });
  });
}

/* ---------------------------------- Submissions modal ---------------------------------- */

function openSubmissionsModal(row, cardId, onlyMine) {
  appState.submissionCardRow = row;
  appState.submissionCardId = cardId;
  appState.submissionEditingId = '';
  getEl('submissionText').value = '';
  resetSubmissionCompose();
  getEl('submissionStatus').textContent = '';
  getEl('submissionsOnlyMine').checked = !!onlyMine;
  getEl('submissionText').placeholder = 'Write your update for record #' + cardId + '…';
  getEl('submissionsModal').classList.remove('hidden');
  loadSubmissions();
}

function closeSubmissionsModal() {
  closeDialog('submissionsModal');
}

function resetSubmissionCompose() {
  getEl('submitSubmissionBtn').textContent = 'Submit update';
  getEl('cancelSubmissionBtn').classList.add('hidden');
}

function loadSubmissions() {
  ApiService.getSubmissions(Number(appState.submissionCardRow)).then(function (list) {
    appState.submissions = list || [];
    renderSubmissionList();
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not load submissions: ' + (err.message || err), 'error');
  });
}

function renderSubmissionList() {
  const onlyMine = getEl('submissionsOnlyMine').checked;
  const all = appState.submissions || [];
  const list = all.filter(function (s) { return !onlyMine || s.isOwner; });
  getEl('submissionsCount').textContent = list.length + ' shown / ' + all.length + ' total';
  getEl('submissionsList').innerHTML = list.length
    ? list.map(renderSubmissionCard).join('')
    : '<div class="empty-state"><div class="empty-state-icon">' + svgIcon('inbox') + '</div><div class="empty-state-title">No submissions yet</div><div class="empty-state-subtitle">Submissions for this record will appear here.</div></div>';
}

function renderSubmissionCard(s) {
  const lockedBadge = s.locked ? '<span class="badge badge-locked">Locked</span>' : '';
  const displayedBadge = s.displayed ? '<span class="badge badge-displayed">On card</span>' : '';
  const ownerTag = s.isOwner ? ' <em>(you)</em>' : '';
  const editBtn = s.editable
    ? `<button class="btn btn-secondary btn-small" type="button" onclick="editSubmission('${escAttr(s.id)}')">Edit</button>`
    : '';
  let lockBtn = '';
  if (s.canUnlock) {
    lockBtn = `<button class="btn btn-secondary btn-small" type="button" onclick="unlockSubmission('${escAttr(s.id)}')">Unlock</button>`;
  } else if (s.canLock) {
    lockBtn = `<button class="btn btn-secondary btn-small" type="button" onclick="lockSubmission('${escAttr(s.id)}')">Lock</button>`;
  }
  const deleteBtn = appState.isAdmin
    ? `<button class="btn btn-danger btn-small" type="button" onclick="deleteSubmission('${escAttr(s.id)}')">Delete</button>`
    : '';
  const displayBtn = appState.isAdmin
    ? `<button class="btn btn-secondary btn-small" type="button" onclick="toggleDisplaySubmission('${escAttr(s.id)}')">${s.displayed ? 'Hide from card' : 'Display on card'}</button>`
    : '';
  const lockRoleTag = s.lockRole ? ` (${escapeHtml(s.lockRole.toLowerCase())})` : '';
  const lockNote = s.lockedBy
    ? `<span class="submission-note">Locked by ${escapeHtml(s.lockedBy)}${lockRoleTag}${s.lockedAt ? ' on ' + escapeHtml(s.lockedAt) : ''}</span>`
    : '';
  return `
    <div class="submission-card">
      <div class="submission-meta">
        <span>${escapeHtml(s.email)}${ownerTag} ${lockedBadge} ${displayedBadge}</span>
        <span>${escapeHtml(s.createdAt || '')}</span>
      </div>
      <div class="submission-text preserve-whitespace">${escapeHtml(s.text || '')}</div>
      <div class="submission-actions">${editBtn}${lockBtn}${deleteBtn}${displayBtn}${lockNote}</div>
    </div>`;
}

function editSubmission(id) {
  const s = (appState.submissions || []).find(function (x) { return String(x.id) === String(id); });
  if (!s) return;
  appState.submissionEditingId = s.id;
  getEl('submissionText').value = s.text;
  getEl('submitSubmissionBtn').textContent = 'Save changes';
  getEl('cancelSubmissionBtn').classList.remove('hidden');
  getEl('submissionStatus').textContent = 'Editing your submission';
}

function cancelSubmissionEdit() {
  appState.submissionEditingId = '';
  getEl('submissionText').value = '';
  getEl('submissionStatus').textContent = '';
  resetSubmissionCompose();
}

function submitSubmission() {
  const text = getEl('submissionText').value;
  if (!text || !text.trim()) {
    getEl('submissionStatus').textContent = 'Write your update before submitting.';
    return;
  }
  const editingId = appState.submissionEditingId;
  if (editingId) {
    showOverlay('Saving submission…');
    ApiService.updateSubmission(editingId, text).then(function (list) {
      hideOverlay();
      appState.submissions = list || [];
      appState.submissionEditingId = '';
      getEl('submissionText').value = '';
      resetSubmissionCompose();
      getEl('submissionStatus').textContent = '';
      renderSubmissionList();
      showToast('Submission updated', 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      getEl('submissionStatus').textContent = err.message || 'Could not save submission';
    });
  } else {
    showOverlay('Submitting update…');
    ApiService.addSubmission(Number(appState.submissionCardRow), appState.submissionCardId, text).then(function (list) {
      hideOverlay();
      appState.submissions = list || [];
      appState.submissionCounts[Number(appState.submissionCardRow)] = (list || []).length;
      appState.submissionFlash[Number(appState.submissionCardRow)] = true;
      getEl('submissionText').value = '';
      resetSubmissionCompose();
      getEl('submissionStatus').textContent = '';
      renderSubmissionList();
      renderDashboard();
      showToast('Update submitted', 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      getEl('submissionStatus').textContent = err.message || 'Could not submit update';
    });
  }
}

function lockSubmission(id) {
  if (!appState.isEditor) { showToast('Editor access required', 'warning'); return; }
  showOverlay('Locking submission…');
  ApiService.lockSubmission(id).then(function (list) {
    hideOverlay();
    appState.submissions = list || [];
    renderSubmissionList();
    showToast('Submission locked', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not lock submission: ' + (err.message || err), 'error');
  });
}

function unlockSubmission(id) {
  if (!appState.isEditor) { showToast('Editor access required', 'warning'); return; }
  showOverlay('Unlocking submission…');
  ApiService.unlockSubmission(id).then(function (list) {
    hideOverlay();
    appState.submissions = list || [];
    renderSubmissionList();
    showToast('Submission unlocked', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not unlock submission: ' + (err.message || err), 'error');
  });
}

function deleteSubmission(id) {
  if (!appState.isAdmin) { showToast('Admin access required', 'warning'); return; }
  showConfirm({
    title: 'Delete submission',
    message: 'Delete this submission permanently?',
    okLabel: 'Delete',
    danger: true
  }).then(function (ok) {
    if (!ok) return;
    showOverlay('Deleting submission…');
    ApiService.deleteSubmission(id).then(function (list) {
      hideOverlay();
      appState.submissions = list || [];
      renderSubmissionList();
      showToast('Submission deleted', 'success');
      refreshData();
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Could not delete submission: ' + (err.message || err), 'error');
    });
  });
}

function toggleDisplaySubmission(id) {
  if (!appState.isAdmin) { showToast('Admin access required', 'warning'); return; }
  showOverlay('Updating display…');
  ApiService.toggleSubmissionDisplay(id).then(function (list) {
    hideOverlay();
    appState.submissions = list || [];
    renderSubmissionList();
    showToast('Display updated', 'success');
    refreshData();
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not update display: ' + (err.message || err), 'error');
  });
}

/* ---------------------------------- About ---------------------------------- */

function openAbout() {
  getEl('aboutVersion').textContent = APP_VERSION;
  getEl('aboutBuild').textContent = APP_BUILD;
  openDialog('aboutModal');
  getEl('profileDropdown').classList.remove('open');
}

function closeAbout() {
  closeDialog('aboutModal');
}

/* ---------------------------------- Offline ---------------------------------- */

function updateOfflineBanner() {
  const banner = getEl('offlineBanner');
  if (banner) banner.classList.toggle('hidden', navigator.onLine);
}

/* ---------------------------------- Event wiring ---------------------------------- */

function wireGlobalEvents() {
  const searchInput = getEl('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(function () {
      appState.searchQuery = searchInput.value.trim();
      updateFilterChips();
      renderDashboard();
    }, 180));
  }

  const notifList = getEl('notifList');
  if (notifList) {
    notifList.addEventListener('click', function (e) {
      const item = e.target.closest('.notif-item');
      if (!item) return;
      openNotification(item.getAttribute('data-notif-id'), item.getAttribute('data-notif-type'));
    });
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      const palette = getEl('commandPalette');
      if (palette && !palette.classList.contains('hidden')) {
        const input = getEl('searchInput');
        if (input) { input.focus(); input.select(); }
      } else {
        openCommandPalette();
      }
    }
    if (e.key === 'Escape') {
      closeDropdowns();
      const profileDropdown = getEl('profileDropdown');
      if (profileDropdown && profileDropdown.classList.contains('open')) {
        profileDropdown.classList.remove('open');
        const trigger = getEl('profileTrigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
      closeNotificationsPanel();
      const confirmModal = getEl('confirmModal');
      if (confirmModal && !confirmModal.classList.contains('hidden')) {
        cancelConfirmDialog();
        return;
      }
      ['editModal', 'aboutModal', 'submissionsModal', 'recordDetailModal', 'editUserModal', 'reviewModal', 'taskModal', 'columnModal', 'commandPalette'].forEach(function (id) {
        const el = getEl(id);
        if (el && !el.classList.contains('hidden')) closeDialog(id);
      });
      document.body.classList.remove('sidebar-open');
      const backdrop = getEl('sidebarBackdrop');
      if (backdrop) backdrop.classList.add('hidden');
    }
  });

  document.addEventListener('click', function (event) {
    ['review-dropdown-menu', 'menu-dropdown-menu'].forEach(function (cls) {
      document.querySelectorAll('.' + cls + '.open').forEach(function (menu) {
        if (!menu.parentElement.contains(event.target)) menu.classList.remove('open');
      });
    });
    const profileDropdown = getEl('profileDropdown');
    const profileMenu = getEl('profileMenu');
    if (profileDropdown && profileMenu && profileDropdown.classList.contains('open') && !profileMenu.contains(event.target)) {
      profileDropdown.classList.remove('open');
      const trigger = getEl('profileTrigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
    const notifPanel = getEl('notifPanel');
    const notifMenu = getEl('notifMenu');
    if (notifPanel && notifMenu && !notifPanel.classList.contains('hidden') && !notifMenu.contains(event.target)) {
      closeNotificationsPanel();
    }
  });

  document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) {
        if (backdrop.id === 'editModal') closeEditModal();
        else if (backdrop.id === 'aboutModal') closeAbout();
        else if (backdrop.id === 'submissionsModal') closeSubmissionsModal();
        else if (backdrop.id === 'recordDetailModal') closeRecordDetail();
        else if (backdrop.id === 'editUserModal') closeEditUser();
        else if (backdrop.id === 'confirmModal') cancelConfirmDialog();
      }
    });
  });

  const dashboardTable = getEl('dashboardTable');
  if (dashboardTable) {
    dashboardTable.querySelectorAll('thead th[data-dash-sort]').forEach(function (th) {
      th.classList.add('sortable');
      th.addEventListener('click', function () {
        setDashSort(th.getAttribute('data-dash-sort'));
      });
    });
    const dashTbody = dashboardTable.querySelector('tbody');
    if (dashTbody) {
      dashTbody.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        const tr = e.target.closest('tr[data-row]');
        if (tr) openRecordDetail(tr.getAttribute('data-row'));
      });
      dashTbody.addEventListener('keydown', function (e) {
        const focused = document.activeElement;
        if (!focused || focused.tagName !== 'TR') return;
        const rows = Array.from(dashTbody.querySelectorAll('tr[data-row]'));
        const idx = rows.indexOf(focused);
        if (e.key === 'ArrowDown' && idx < rows.length - 1) { rows[idx + 1].focus(); e.preventDefault(); }
        if (e.key === 'ArrowUp' && idx > 0) { rows[idx - 1].focus(); e.preventDefault(); }
        if (e.key === 'Enter' || e.key === ' ') { openRecordDetail(focused.getAttribute('data-row')); e.preventDefault(); }
      });
    }
  }

  const auditTable = getEl('auditTable');
  if (auditTable) {
    auditTable.querySelectorAll('thead th[data-sort]').forEach(function (th) {
      th.classList.add('sortable');
      th.addEventListener('click', function () {
        setAuditSort(th.getAttribute('data-sort'));
      });
    });
  }

  const usersTable = getEl('usersTable');
  if (usersTable) {
    usersTable.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const tbody = usersTable.querySelector('tbody');
      const users = JSON.parse((tbody && tbody.dataset.users) || '[]');
      const user = users[Number(btn.dataset.index)];
      if (!user) return;
      if (btn.dataset.action === 'delete') deleteUser(user.email);
      else if (btn.dataset.action === 'reset') resetUserPassword(user.email);
      else if (btn.dataset.action === 'edit') openEditUser(user.email);
    });
  }

  ['loginForm', 'forgotForm', 'changePasswordForm', 'addUserForm', 'editForm'].forEach(function (id) {
    const form = getEl(id);
    if (form) wireFieldClearing(form);
  });

  window.addEventListener('offline', updateOfflineBanner);
  window.addEventListener('online', function () {
    updateOfflineBanner();
    showToast('You are back online', 'info');
  });
}

wireGlobalEvents();
window.addEventListener('load', initApp);