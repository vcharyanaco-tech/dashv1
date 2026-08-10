
const ApiService = {
  getServerTime: function () { return apiCall_('getServerTime'); },
  getAppData: function () { return apiCall_('getAppData', getAuthToken()); },
  getData: function () { return apiCall_('getData', getAuthToken()); },
  addItem: function (item) { return apiCall_('addItem', item, getAuthToken()); },
  updateItem: function (item) { return apiCall_('updateItem', item, getAuthToken()); },
  deleteItem: function (row) { return apiCall_('deleteItem', row, getAuthToken()); },
  markReviewDone: function (row) { return apiCall_('markReviewDone', row, getAuthToken()); },
  markReviewNotDone: function (row) { return apiCall_('markReviewNotDone', row, getAuthToken()); },
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
  generateReviewNotifications: function () { return apiCall_('generateReviewNotifications', getAuthToken()); },
  markNotificationsRead: function (ids) { return apiCall_('markNotificationsRead', ids, getAuthToken()); },
  clearMyNotifications: function () { return apiCall_('clearMyNotifications', getAuthToken()); },
  createTask: function (params) { return apiCall_('createTask', params, getAuthToken()); },
  getTasks: function (filters) { return apiCall_('getTasks', filters || {}, getAuthToken()); },
  getAssignableUsers: function () { return apiCall_('getAssignableUsers', getAuthToken()); },
  getMyTasks: function () { return apiCall_('getMyTasks', getAuthToken()); },
  updateTask: function (id, fields) { return apiCall_('updateTask', id, fields, getAuthToken()); },
  updateTaskField: function (id, field, value, rowVersion, idempotencyKey) { return apiCall_('updateTaskField', id, field, value, rowVersion, idempotencyKey, getAuthToken()); },
  getDashboardCounts: function () { return apiCall_('getDashboardCounts', getAuthToken()); },
  getTaskCounts: function () { return apiCall_('getTaskCounts', getAuthToken()); },
  getUnreadCount: function () { return apiCall_('getUnreadNotificationCount', getAuthToken()); },
  setAdminBootstrapPassword: function (password) { return apiCall_('setAdminBootstrapPassword', password, getAuthToken()); },
  adminKillUserSessions: function (email) { return apiCall_('adminKillUserSessions', email, getAuthToken()); },
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
  createPdfReport: function () { return apiCall_('createPdfReport', getAuthToken()); },
  emailReport: function (recipient, templateKey) { return apiCall_('emailReport', getAuthToken(), recipient, templateKey); },
  exportReviewCalendarIcs: function () { return apiCall_('exportReviewCalendarIcs', getAuthToken()); },
  sendWhatsAppReviewReminders: function () { return apiCall_('sendWhatsAppReviewReminders', getAuthToken()); },
  getAiInsights: function () { return apiCall_('getAiInsights', getAuthToken()); },
  getCardAiInsight: function (row) { return apiCall_('getCardAiInsight', getAuthToken(), row); },
  getLinkContentAiInsight: function (row) { return apiCall_('getLinkContentAiInsight', getAuthToken(), row); },
  processMeetingRecording: function (payload) { return apiCall_('processMeetingRecording', payload, getAuthToken()); },
  transcribeMeetingSegment: function (payload) { return apiCall_('transcribeMeetingSegment', payload, getAuthToken()); },
  generateMeetingMinutes: function (payload) { return apiCall_('generateMeetingMinutes', payload, getAuthToken()); },
  getFathomStatus: function () { return apiCall_('getFathomStatus', getAuthToken()); },
  setFathomApiKey: function (apiKey) { return apiCall_('setFathomApiKey', getAuthToken(), apiKey); },
  listFathomMeetings: function (opts) { return apiCall_('listFathomMeetings', getAuthToken(), opts || {}); },
  getFathomMeetingContent: function (recordingId) { return apiCall_('getFathomMeetingContent', getAuthToken(), recordingId); }
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
  fieldLinks: {},
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
    info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
    clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>'
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

/* ---------------------------------- AI Meeting Notes ---------------------------------- */
/* Admin-only: records or uploads a review-meeting audio, transcribes it via
   Groq Whisper, saves audio + minutes to Drive and renders structured minutes.
   Action items become "Create task" buttons plus a bulk "Add all" (never
   auto-created). */

function openMeetingNotes() {
  if (!appState.isAdmin) { showToast('Admin access required', 'error'); return; }
  openDialog('meetingNotesModal');
  const title = getEl('meetingNotesTitleInput');
  const file = getEl('meetingNotesFile');
  const body = getEl('meetingNotesResult');
  const loading = getEl('meetingNotesLoading');
  const go = getEl('meetingNotesGo');
  const player = getEl('meetingNotesPlayer');
  if (meetingRecorder && meetingRecorder.state === 'recording') {
    // Reopening the dialog must NOT cancel an active recording. Restore the
    // recording UI (timer / End / Cancel) and keep capturing.
    const startBtn = getEl('meetingNotesStartBtn');
    const endBtn = getEl('meetingNotesEndBtn');
    const cancelBtn = getEl('meetingNotesCancelBtn');
    const timer = getEl('meetingNotesRecTimer');
    if (startBtn) startBtn.style.display = 'none';
    if (endBtn) { endBtn.style.display = 'inline-flex'; endBtn.disabled = false; endBtn.textContent = 'End recording'; }
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (timer) timer.style.display = 'inline-flex';
    if (go) { go.disabled = true; go.textContent = 'Recording\u2026'; }
    if (loading) loading.style.display = 'none';
    startMeetingRecTimer();
  } else {
    if (title) title.value = '';
    if (file) file.value = '';
    if (body) body.innerHTML = '';
    if (loading) loading.style.display = 'none';
    if (go) go.disabled = false;
    if (player) { player.removeAttribute('src'); player.style.display = 'none'; }
    resetMeetingRecUi_();
    setMeetingRecStatus('');
  }
  syncMeetingRecFloat_();
  initFathomPanel();
}

function closeMeetingNotes() {
  closeDialog('meetingNotesModal');
  // A live recording keeps running in the background; the floating indicator
  // lets the user reopen the dialog and stop it later.
  syncMeetingRecFloat_();
}

function processMeetingNotes() {
  const fileInput = getEl('meetingNotesFile');
  const go = getEl('meetingNotesGo');
  const loading = getEl('meetingNotesLoading');
  const body = getEl('meetingNotesResult');
  let file = null;
  if (fileInput && fileInput.files && fileInput.files.length) {
    file = fileInput.files[0];
  } else if (meetingRecBlob) {
    file = new File([meetingRecBlob], meetingRecordingFileName_(), { type: meetingRecMimeType });
  }
  if (!file) {
    showToast('Record or choose an audio file first.', 'warning');
    return;
  }
  const titleEl = getEl('meetingNotesTitleInput');
  const title = titleEl ? titleEl.value.trim() : '';
  if (go) go.disabled = true;
  if (loading) loading.style.display = 'flex';
  if (body) body.innerHTML = '';

  // Files over the 25 MB cap cannot be sent in one request; re-encode locally
  // into ~5-minute segments so the raw file never crosses the limit. Long
  // recordings also go straight to segments: a single request on a long file
  // makes Groq churn for minutes and can trip Cloudflare's origin timeout.
  if (file.size > 25 * 1024 * 1024) {
    processMeetingNotesSegmented(file, title, go, loading);
    return;
  }

  readAudioBuffer_(file).then(function (audioBuffer) {
    if (audioBuffer.duration > MEETING_SEGMENT_SECONDS * 2) {
      processMeetingNotesSegmented(file, title, go, loading);
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = String(reader.result || '').replace(/^data:[^;]*;base64,/, '');
      ApiService.processMeetingRecording({
        title: title,
        base64: base64,
        mimeType: file.type || 'audio/mpeg',
        fileName: file.name
      }).then(function (data) {
        if (!data || data.success !== true) {
          const msg = (data && data.message) || 'Could not process the recording.';
          // Groq rejects some encodings (e.g. mixed sample-rate VBR MP3) with a
          // generic "Internal Server Error". Retry through the local re-encode path.
          if (msg === 'Internal Server Error') {
            return processMeetingNotesSegmented(file, title, go, loading);
          }
          showToast(msg, 'error');
          renderMeetingMinutesError(msg);
          return;
        }
        renderMeetingMinutes(data);
      }).catch(function (err) {
        if (handleServerFailure(err)) return;
        const msg = err && err.message ? err.message : String(err || 'Unknown error');
        // Timeouts (e.g. Cloudflare 524 while Groq churns through a long file)
        // and transient failures retry through the local re-encode path.
        if (/^HTTP \d{3}/.test(msg)) {
          return processMeetingNotesSegmented(file, title, go, loading);
        }
        showToast(msg, 'error');
        renderMeetingMinutesError(msg);
      }).then(function () {
        if (go) go.disabled = false;
        if (go) go.textContent = 'Transcribe & summarize';
        if (loading) loading.style.display = 'none';
        resetMeetingRecUi_();
      });
    };
    reader.onerror = function () {
      showToast('Could not read the audio file.', 'error');
      if (go) go.disabled = false;
    };
    reader.readAsDataURL(file);
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    const msg = err && err.message ? err.message : String(err || 'Unknown error');
    showToast(msg, 'error');
    renderMeetingMinutesError(msg);
    if (go) go.disabled = false;
  });
}

/* Fallback for recordings that exceed the 25 MB single-request cap or that
   Groq refuses to decode: decode in the browser, split into ~5-minute chunks,
   re-encode each as a compact 16 kHz mono WAV, then transcribe + draft minutes
   via sequential API calls. Each segment is retried on transient failures and
   the run continues past a bad segment instead of aborting everything. */
const MEETING_SEGMENT_SECONDS = 5 * 60;
const MEETING_SEGMENT_SAMPLE_RATE = 16000;
const MEETING_SEGMENT_MAX_ATTEMPTS = 3;

function processMeetingNotesSegmented(file, title, go, loading) {
  if (go) go.disabled = true;
  if (loading) {
    loading.style.display = 'flex';
    setMeetingNotesLoadingText(loading, 'Decoding audio in the browser\u2026');
  }
  readAudioBuffer_(file).then(function (audioBuffer) {
    const totalSeconds = audioBuffer.duration;
    const count = Math.max(1, Math.ceil(totalSeconds / MEETING_SEGMENT_SECONDS));
    const transcripts = [];
    const failures = [];
    let index = 0;
    const runNext = function () {
      if (index >= count) {
        const combined = transcripts.join('\n').trim();
        if (!combined) {
          renderMeetingMinutesError('No segments could be transcribed' +
            (failures.length ? ' (parts ' + failures.join(', ') + ')' : '') + '.');
          return;
        }
        setMeetingNotesLoadingText(loading, 'Drafting minutes\u2026');
        return ApiService.generateMeetingMinutes({ title: title, transcript: combined }).then(function (data) {
          if (!data || data.success !== true) {
            const msg = (data && data.message) || 'Could not draft the minutes.';
            showToast(msg, 'error');
            renderMeetingMinutesError(msg);
            return;
          }
          renderMeetingMinutes(data);
        });
      }
      const partNum = index + 1;
      const start = index * MEETING_SEGMENT_SECONDS;
      const duration = Math.min(MEETING_SEGMENT_SECONDS, totalSeconds - start);
      setMeetingNotesLoadingText(loading, 'Re-encoding + transcribing part ' + partNum + ' of ' + count + '\u2026');
      return transcribeSegmentWithRetry_(audioBuffer, start, duration, partNum, title, loading).then(function (text) {
        if (text) transcripts.push(text);
        else failures.push(partNum);
        index++;
        return runNext();
      });
    };
    return runNext();
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    const msg = err && err.message ? err.message : String(err || 'Unknown error');
    showToast(msg, 'error');
    renderMeetingMinutesError(msg);
  }).then(function () {
    if (go) go.disabled = false;
    if (go) go.textContent = 'Transcribe & summarize';
    if (loading) loading.style.display = 'none';
    resetMeetingRecUi_();
  });
}

/* Transcribes one segment, retrying on transient HTTP/network failures. Returns
   the transcript, or '' if the segment could not be transcribed after all
   attempts (the caller continues with the remaining segments). */
function transcribeSegmentWithRetry_(audioBuffer, start, duration, partNum, title, loading) {
  let attempt = 0;
  const tryOnce = function () {
    attempt++;
    if (attempt > 1) {
      setMeetingNotesLoadingText(loading, 'Retrying part ' + partNum + ' (attempt ' + attempt + ')\u2026');
    }
    return encodeWavSegment_(audioBuffer, start, duration).then(function (wav) {
      return ApiService.transcribeMeetingSegment({
        title: title,
        base64: wav.base64,
        mimeType: 'audio/wav',
        fileName: 'part_' + partNum + '.wav'
      });
    }).then(function (data) {
      if (!data || data.success !== true) {
        throw new Error((data && data.message) || 'Could not transcribe part ' + partNum + '.');
      }
      return String(data.transcript || '').trim();
    }).catch(function (err) {
      if (handleServerFailure(err)) throw err;
      const msg = err && err.message ? err.message : String(err || '');
      if (attempt < MEETING_SEGMENT_MAX_ATTEMPTS && /^(HTTP|TypeError|NetworkError|Failed to fetch)/.test(msg)) {
        return new Promise(function (resolve) { setTimeout(resolve, 1500 * attempt); }).then(tryOnce);
      }
      throw err;
    });
  };
  return tryOnce().catch(function () {
    return '';
  });
}

function setMeetingNotesLoadingText(loading, msg) {
  if (!loading) return;
  const span = loading.querySelector('span:last-child');
  if (span) span.textContent = msg || '';
}

function readAudioBuffer_(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return Promise.reject(new Error('Audio decoding is not supported in this browser. Use Chrome, Edge, Firefox or Safari.'));
  }
  const ctx = new Ctx();
  return file.arrayBuffer().then(function (buf) {
    return ctx.decodeAudioData(buf);
  }).then(function (buffer) {
    if (ctx.close) ctx.close();
    return buffer;
  });
}

function encodeWavSegment_(audioBuffer, startSeconds, durationSeconds) {
  const rate = MEETING_SEGMENT_SAMPLE_RATE;
  const OffCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const frames = Math.max(1, Math.ceil(durationSeconds * rate));
  const off = new OffCtx(1, frames, rate);
  const src = off.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(off.destination);
  src.start(0, startSeconds, durationSeconds);
  return off.startRendering().then(function (rendered) {
    const samples = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = function (offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve({ blob: blob, base64: String(reader.result || '').replace(/^data:[^;]*;base64,/, '') });
      };
      reader.onerror = function () { reject(new Error('Could not read the re-encoded audio.')); };
      reader.readAsDataURL(blob);
    });
  });
}

function renderMeetingMinutesError(msg) {
  const body = getEl('meetingNotesResult');
  if (!body) return;
  body.innerHTML = '<div class="meeting-notes-error">' + escapeHtml(msg) + '</div>';
}

function renderMeetingMinutes(data) {
  const body = getEl('meetingNotesResult');
  if (!body) return;
  const minutes = (data && data.minutes) || {};
  const summary = String(minutes.summary || '').trim();
  const decisions = Array.isArray(minutes.decisions) ? minutes.decisions : [];
  const actions = Array.isArray(minutes.actionItems) ? minutes.actionItems : [];
  const risks = Array.isArray(minutes.risks) ? minutes.risks : [];
  const meetingTitle = String((data && data.title) || 'Review meeting');
  let html = '<div class="meeting-notes-wrap">';
  if (data && data.fathomUrl) {
    html += '<div class="meeting-notes-drive">' +
      '<span>&#128279; Fathom recording: <a href="' + escapeHtml(data.fathomUrl) + '" target="_blank" rel="noopener noreferrer">Open in Fathom</a></span>' +
      '</div>';
  }
  if (summary) {
    html += '<div class="card-ai-head"><span class="card-ai-title">Summary</span></div>' +
      '<div class="meeting-notes-section"><p>' + escapeHtml(summary) + '</p></div>';
  }
  if (actions.length) {
    html += '<div class="card-ai-head"><span class="card-ai-title">Action items (' + actions.length + ')</span>' +
      '<button class="btn btn-small btn-secondary" type="button" onclick="addAllMeetingTasks()">Add all as tasks</button></div>' +
      '<table class="card-ai-table meeting-notes-table"><thead><tr>' +
      '<th>Task</th><th>Assignee</th><th>Priority</th><th>Due</th><th></th>' +
      '</tr></thead><tbody>';
    actions.forEach(function (a, i) {
      const task = String((a && a.task) || '').trim() || ('Action item ' + (i + 1));
      const assignee = String((a && a.assignee) || '').trim();
      const priority = String((a && a.priority) || 'MEDIUM').toUpperCase();
      const due = String((a && a.dueDate) || '').trim();
      html += '<tr>' +
        '<td>' + escapeHtml(task) + '</td>' +
        '<td>' + escapeHtml(assignee || '\u2014') + '</td>' +
        '<td><span class="meeting-priority" data-priority="' + escapeHtml(priority) + '">' + escapeHtml(priority) + '</span></td>' +
        '<td>' + escapeHtml(due || '\u2014') + '</td>' +
        '<td><button class="btn btn-small btn-secondary" type="button" onclick="createTaskFromMeetingAction(this)" data-title="' + escapeHtml(task) + '" data-assignee="' + escapeHtml(assignee) + '" data-priority="' + escapeHtml(priority) + '" data-due="' + escapeHtml(due) + '">Create task</button></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }
  if (decisions.length) {
    html += '<div class="card-ai-head"><span class="card-ai-title">Decisions</span></div>' +
      '<ul class="meeting-notes-list">' + decisions.map(function (d) {
        return '<li>' + escapeHtml(String(d)) + '</li>';
      }).join('') + '</ul>';
  }
  if (risks.length) {
    html += '<div class="card-ai-head"><span class="card-ai-title">Risks</span></div>' +
      '<ul class="meeting-notes-list">' + risks.map(function (r) {
        return '<li>' + escapeHtml(String(r)) + '</li>';
      }).join('') + '</ul>';
  }
  if (data && data.minutesText && !summary && !decisions.length && !actions.length && !risks.length) {
    html += '<div class="card-ai-head"><span class="card-ai-title">Minutes</span></div>' +
      '<div class="meeting-notes-section"><p>' + escapeHtml(data.minutesText) + '</p></div>';
  }
  if (data && data.transcript) {
    const chars = data.transcriptChars || data.transcript.length;
    html += '<div class="card-ai-head"><span class="card-ai-title">Full transcript (' + chars + ' chars)</span>' +
      '<button class="btn btn-small btn-ghost" type="button" onclick="toggleMeetingTranscript()">Show</button></div>' +
      '<div id="meetingTranscript" class="meeting-notes-transcript hidden"><pre>' + escapeHtml(data.transcript) + '</pre></div>';
  }
  if (data && (data.driveAudio || data.driveMinutes)) {
    html += '<div class="card-ai-head"><span class="card-ai-title">Saved to Drive</span></div>' +
      '<div class="meeting-notes-drive">' +
      (data.driveAudio ? '<span>&#127911; <a href="' + escapeHtml(data.driveAudio.url) + '" target="_blank" rel="noopener noreferrer">Audio</a></span>' : '') +
      (data.driveAudio && data.driveMinutes ? '<span class="meeting-drive-sep">&nbsp;&middot;&nbsp;</span>' : '') +
      (data.driveMinutes ? '<span>&#128196; <a href="' + escapeHtml(data.driveMinutes.url) + '" target="_blank" rel="noopener noreferrer">Minutes</a></span>' : '') +
      '</div>';
  }
  if (html === '<div class="meeting-notes-wrap">') {
    html += '<p style="color:var(--muted);font-size:14px;">Transcription succeeded (' + escapeHtml(meetingTitle) +
      '), but no minutes were generated. Try again.</p>';
  }
  html += '</div>';
  body.innerHTML = html;
}

function toggleMeetingTranscript() {
  const pre = getEl('meetingTranscript');
  if (!pre) return;
  pre.classList.toggle('hidden');
  const head = pre.previousElementSibling;
  const btn = head ? head.querySelector('button') : null;
  if (btn) btn.textContent = pre.classList.contains('hidden') ? 'Show' : 'Hide';
}

function createTaskFromMeetingAction(btn) {
  const params = {
    title: btn.getAttribute('data-title') || '',
    description: 'Created from meeting notes: ' + (btn.getAttribute('data-title') || ''),
    assignee: btn.getAttribute('data-assignee') || '',
    priority: btn.getAttribute('data-priority') || 'MEDIUM',
    dueDate: btn.getAttribute('data-due') || ''
  };
  showOverlay('Creating task\u2026');
  ApiService.createTask(params).then(function () {
    hideOverlay();
    btn.disabled = true;
    btn.textContent = 'Created';
    showToast('Task created.', 'success');
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not create task: ' + (err.message || err), 'error');
  });
}

/* Bulk-creates tasks for every action item currently rendered. */
function addAllMeetingTasks() {
  const rows = Array.prototype.slice.call(document.querySelectorAll('#meetingNotesResult .meeting-notes-table tbody tr'));
  const items = [];
  rows.forEach(function (tr) {
    const btn = tr.querySelector('button[data-title]');
    if (!btn) return;
    items.push({
      title: btn.getAttribute('data-title') || '',
      assignee: btn.getAttribute('data-assignee') || '',
      priority: btn.getAttribute('data-priority') || 'MEDIUM',
      dueDate: btn.getAttribute('data-due') || ''
    });
  });
  if (!items.length) { showToast('No action items to add.', 'warning'); return; }
  showConfirm({
    title: 'Add ' + items.length + ' task(s)?',
    message: 'Create ' + items.length + ' task(s) from the meeting action items? They will appear in the Tasks dashboard.',
    okLabel: 'Add tasks'
  }).then(function (confirmed) {
    if (!confirmed) return;
    showOverlay('Adding tasks\u2026');
    const calls = items.map(function (it) {
      return ApiService.createTask({
        title: it.title,
        description: 'Created from meeting notes: ' + it.title,
        assignee: it.assignee,
        priority: it.priority,
        dueDate: it.dueDate
      });
    });
    Promise.all(calls).then(function () {
      hideOverlay();
      rows.forEach(function (tr) {
        const btn = tr.querySelector('button[data-title]');
        if (btn) { btn.disabled = true; btn.textContent = 'Created'; }
      });
      const bulkBtn = document.querySelector('#meetingNotesResult .card-ai-head button[onclick="addAllMeetingTasks()"]');
      if (bulkBtn) { bulkBtn.disabled = true; bulkBtn.textContent = 'Added'; }
      showToast(items.length + ' task(s) created.', 'success');
    }).catch(function (err) {
      hideOverlay();
      if (handleServerFailure(err)) return;
      showToast('Could not add tasks: ' + (err && err.message ? err.message : String(err)), 'error');
    });
  });
}

/* ---------------------------------- Fathom AI meeting notes ---------------------------------- */
/* Admin-only: pulls summaries/transcripts/action items recorded by Fathom into
   the AI Meeting Notes modal. API key is stored server-side via setFathomApiKey
   (Script Properties) and never committed to the repo. */

let fathomMeetingsCache = [];

function initFathomPanel() {
  const list = getEl('fathomList');
  const keyRow = getEl('fathomKeyRow');
  const loadBtn = getEl('fathomLoadBtn');
  const status = getEl('fathomStatus');
  if (list) list.innerHTML = '';
  if (keyRow) keyRow.classList.add('hidden');
  if (loadBtn) loadBtn.disabled = false;
  if (status) status.textContent = '';
  ApiService.getFathomStatus().then(function (data) {
    const f = data && data.fathom;
    if (!f) return;
    if (!f.enabled) {
      if (status) status.textContent = 'Fathom integration is not enabled on the server.';
      if (loadBtn) loadBtn.style.display = 'none';
      return;
    }
    if (!f.configured) {
      if (status) status.textContent = 'Enter a Fathom API key to pull notes (Settings \u2192 API Access).';
      if (keyRow) keyRow.classList.remove('hidden');
      if (loadBtn) loadBtn.style.display = 'none';
      return;
    }
    if (loadBtn) loadBtn.style.display = 'inline-flex';
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    if (status) status.textContent = err && err.message ? err.message : String(err);
  });
}

function saveFathomApiKey() {
  const input = getEl('fathomApiKeyInput');
  const key = input ? input.value.trim() : '';
  if (!key) { showToast('Paste your Fathom API key first.', 'warning'); return; }
  showOverlay('Saving key\u2026');
  ApiService.setFathomApiKey(key).then(function (res) {
    hideOverlay();
    if (res && res.ok) {
      if (input) input.value = '';
      showToast('Fathom API key saved.', 'success');
      initFathomPanel();
    } else {
      showToast((res && res.message) || 'Could not save the key.', 'error');
    }
  }).catch(function (err) {
    hideOverlay();
    if (handleServerFailure(err)) return;
    showToast('Could not save the key: ' + (err && err.message ? err.message : String(err)), 'error');
  });
}

function loadFathomMeetings() {
  const list = getEl('fathomList');
  const status = getEl('fathomStatus');
  const loadBtn = getEl('fathomLoadBtn');
  if (loadBtn) loadBtn.disabled = true;
  if (status) status.textContent = 'Loading recent Fathom meetings\u2026';
  if (list) list.innerHTML = '';
  ApiService.listFathomMeetings({}).then(function (data) {
    if (loadBtn) loadBtn.disabled = false;
    if (status) status.textContent = '';
    if (!data || data.success !== true) {
      if (status) status.textContent = (data && data.message) || 'Could not load Fathom meetings.';
      return;
    }
    fathomMeetingsCache = data.items || [];
    renderFathomMeetingList(fathomMeetingsCache);
  }).catch(function (err) {
    if (loadBtn) loadBtn.disabled = false;
    if (handleServerFailure(err)) return;
    if (status) status.textContent = err && err.message ? err.message : String(err);
  });
}

function renderFathomMeetingList(items) {
  const list = getEl('fathomList');
  const status = getEl('fathomStatus');
  if (!list) return;
  if (!items.length) {
    if (status) status.textContent = 'No Fathom meetings found yet.';
    return;
  }
  if (status) status.textContent = items.length + ' meeting(s) found \u2014 pick one to pull its notes.';
  let html = '<div class="fathom-meeting-list">';
  items.forEach(function (m, i) {
    const date = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
    const actionCount = (m.actionItems && m.actionItems.length) || 0;
    html += '<div class="fathom-meeting-item" role="button" tabindex="0" onclick="viewFathomMeeting(' + i + ')">' +
      '<div class="fathom-meeting-title">' + escapeHtml(m.title) + '</div>' +
      '<div class="fathom-meeting-meta">' + escapeHtml(date) +
      (m.recordedBy ? ' &middot; ' + escapeHtml(m.recordedBy) : '') +
      (actionCount ? ' &middot; ' + actionCount + ' action item(s)' : '') + '</div>' +
      (m.summary ? '<div class="fathom-meeting-summary">' + escapeHtml(m.summary.substring(0, 220)) + '</div>' : '') +
      '<span class="btn btn-small btn-secondary" style="pointer-events:none;">View notes</span>' +
      '</div>';
  });
  html += '</div>';
  list.innerHTML = html;
}

function viewFathomMeeting(index) {
  const m = fathomMeetingsCache[index];
  if (!m) return;
  const body = getEl('meetingNotesResult');
  if (body) body.innerHTML = '<p class="meeting-notes-hint">Loading Fathom notes\u2026</p>';
  ApiService.getFathomMeetingContent(m.recordingId).then(function (data) {
    if (!data || data.success !== true) {
      renderMeetingMinutesError((data && data.message) || 'Could not load this meeting\u2019s content.');
      return;
    }
    const actionItems = (m.actionItems || []).map(function (a) {
      return {
        task: a.task || '',
        assignee: a.assignee || '',
        priority: 'MEDIUM',
        dueDate: ''
      };
    });
    renderMeetingMinutes({
      title: m.title,
      minutes: {
        summary: m.summary || '',
        decisions: [],
        actionItems: actionItems,
        risks: []
      },
      transcript: data.transcript || '',
      transcriptChars: data.transcriptChars || 0,
      fathomUrl: m.shareUrl || m.url || ''
    });
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    renderMeetingMinutesError(err && err.message ? err.message : String(err));
  });
}

/* ---------------------------------- Live browser recording ---------------------------------- */

let meetingRecorder = null;
let meetingRecChunks = [];
let meetingRecStream = null;
let meetingRecTimerId = null;
let meetingRecElapsed = 0;
let meetingRecBlob = null;
let meetingRecMimeType = 'audio/webm';
let meetingRecCancelFlag = false;
let meetingRecSourceTracks = null;
let meetingRecAudioCtx = null;

function meetingRecordingFileName_() {
  const titleEl = getEl('meetingNotesTitleInput');
  const raw = titleEl && titleEl.value.trim() ? titleEl.value.trim() : 'Review meeting';
  const safe = raw.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const d = new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return safe + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.webm';
}

function getMeetingRecStream_(useDisplay) {
  var displayTracks = null;
  function fallbackToMic_() {
    if (displayTracks) { displayTracks.forEach(function (t) { try { t.stop(); } catch (e) {} }); displayTracks = null; }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (mic) {
      return { stream: mic, sourceTracks: mic.getTracks(), sourceType: 'mic', audioCtx: null };
    });
  }
  if (!useDisplay) return fallbackToMic_();
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(function (displayStream) {
    displayTracks = displayStream.getTracks();
    displayStream.getVideoTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    var audio = displayStream.getAudioTracks();
    if (!audio.length) throw new Error('The shared tab has no audio to record.');
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (mic) {
      return mixAudioStreams_([audio, mic.getTracks()]).then(function (mixed) {
        return { stream: mixed.stream, sourceTracks: displayTracks.concat(mic.getTracks()), sourceType: 'tab+mic', audioCtx: mixed.audioCtx };
      }).catch(function () {
        return { stream: displayStream, sourceTracks: displayTracks, sourceType: 'tab', audioCtx: null };
      });
    }).catch(function () {
      return { stream: displayStream, sourceTracks: displayTracks, sourceType: 'tab', audioCtx: null };
    });
  }).catch(function (err) {
    return fallbackToMic_();
  });
}

function mixAudioStreams_(trackGroups) {
  return new Promise(function (resolve, reject) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { reject(new Error('AudioContext unsupported')); return; }
      var ctx = new Ctx();
      var dest = ctx.createMediaStreamDestination();
      trackGroups.forEach(function (group) {
        group.forEach(function (track) {
          var src = ctx.createMediaStreamSource(new MediaStream([track]));
          src.connect(dest);
        });
      });
      if (ctx.state === 'suspended') {
        ctx.resume().then(function () { resolve({ stream: dest.stream, audioCtx: ctx }); }, function () { resolve({ stream: dest.stream, audioCtx: ctx }); });
      } else {
        resolve({ stream: dest.stream, audioCtx: ctx });
      }
    } catch (e) { reject(e); }
  });
}

function meetingRecCleanup_() {
  if (meetingRecSourceTracks) {
    meetingRecSourceTracks.forEach(function (t) { try { t.stop(); } catch (e) {} });
    meetingRecSourceTracks = null;
  }
  if (meetingRecAudioCtx) { try { meetingRecAudioCtx.close(); } catch (e) {} meetingRecAudioCtx = null; }
  if (meetingRecStream) {
    try { meetingRecStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    meetingRecStream = null;
  }
}

function startMeetingRecording() {
  if (!appState.isAdmin) { showToast('Admin access required', 'error'); return; }
  if (meetingRecorder) { showToast('Recording already in progress.', 'warning'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    showToast('Live recording is not supported in this browser. Use Chrome, Edge, Firefox or Safari.', 'error');
    return;
  }
  var useDisplay = !!(navigator.mediaDevices.getDisplayMedia);
  if (useDisplay) {
    showToast('Select the meeting tab and tick "Share tab audio" (or your screen) to record meeting audio.', 'info');
  }
  getMeetingRecStream_(useDisplay).then(function (result) {
    meetingRecStream = result.stream;
    meetingRecSourceTracks = result.sourceTracks;
    meetingRecAudioCtx = result.audioCtx || null;
    meetingRecChunks = [];
    meetingRecElapsed = 0;
    meetingRecMimeType = 'audio/webm';
    let options = {};
    if (window.MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
    else if (window.MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };
    meetingRecorder = new MediaRecorder(result.stream, options);
    meetingRecorder.ondataavailable = function (e) { if (e.data && e.data.size) meetingRecChunks.push(e.data); };
    meetingRecorder.onstop = function () {
      const type = (meetingRecorder && meetingRecorder.mimeType) || meetingRecMimeType || 'audio/webm';
      meetingRecBlob = new Blob(meetingRecChunks, { type: type });
      meetingRecChunks = [];
      stopMeetingRecTimer();
      const player = getEl('meetingNotesPlayer');
      if (player) { player.src = URL.createObjectURL(meetingRecBlob); player.style.display = 'block'; }
      meetingRecCleanup_();
      const wasCancel = meetingRecCancelFlag;
      meetingRecCancelFlag = false;
      if (wasCancel) {
        meetingRecBlob = null;
        setMeetingRecStatus('Recording cancelled.');
        return;
      }
      const titleEl = getEl('meetingNotesTitleInput');
      if (titleEl && !titleEl.value.trim()) {
        const d = new Date();
        titleEl.value = 'Review meeting ' + (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
      }
      setMeetingRecStatus('Recording finished \u2014 sending to Groq\u2026');
      processMeetingNotes();
    };
    meetingRecorder.start(1000);
    const startBtn = getEl('meetingNotesStartBtn');
    const endBtn = getEl('meetingNotesEndBtn');
    const cancelBtn = getEl('meetingNotesCancelBtn');
    const timer = getEl('meetingNotesRecTimer');
    const go = getEl('meetingNotesGo');
    const status = getEl('meetingNotesRecStatus');
    if (startBtn) startBtn.style.display = 'none';
    if (endBtn) endBtn.style.display = 'inline-flex';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (timer) timer.style.display = 'inline-flex';
    if (go) { go.disabled = true; go.textContent = 'Recording\u2026'; }
    if (status) status.textContent = '';
    startMeetingRecTimer();
    syncMeetingRecFloat_();
    const note = result.sourceType === 'tab+mic'
      ? 'Recording meeting tab audio + microphone.'
      : (result.sourceType === 'tab' ? 'Recording meeting tab audio. Your voice may not be included.' : 'Recording microphone only.');
    showToast('Recording started. ' + note + ' Click "End recording" when done.', 'info');
  }).catch(function (err) {
    showToast('Could not start recording: ' + (err && err.message ? err.message : String(err || 'error')), 'error');
  });
}

function startMeetingRecTimer() {
  stopMeetingRecTimer();
  const timer = getEl('meetingNotesRecTimer');
  if (timer) {
    timer.textContent = '\u25CF ' + fmtMeetingRecElapsed_();
    const floatTimer = getEl('meetingRecFloatTimer');
    if (floatTimer) floatTimer.textContent = fmtMeetingRecElapsed_();
    meetingRecTimerId = setInterval(function () {
      meetingRecElapsed++;
      const t = fmtMeetingRecElapsed_();
      timer.textContent = '\u25CF ' + t;
      const floatTimer2 = getEl('meetingRecFloatTimer');
      if (floatTimer2) floatTimer2.textContent = t;
    }, 1000);
  }
}

function fmtMeetingRecElapsed_() {
  const m = String(Math.floor(meetingRecElapsed / 60)).padStart(2, '0');
  const s = String(meetingRecElapsed % 60).padStart(2, '0');
  return m + ':' + s;
}

function syncMeetingRecFloat_() {
  const floatBtn = getEl('meetingRecFloat');
  if (!floatBtn) return;
  const recording = !!(meetingRecorder && meetingRecorder.state === 'recording');
  const modal = getEl('meetingNotesModal');
  const modalOpen = modal && !modal.classList.contains('hidden');
  if (recording && !modalOpen) {
    const floatTimer = getEl('meetingRecFloatTimer');
    if (floatTimer) floatTimer.textContent = fmtMeetingRecElapsed_();
    floatBtn.classList.remove('hidden');
  } else {
    floatBtn.classList.add('hidden');
  }
}

function stopMeetingRecTimer() {
  if (meetingRecTimerId) { clearInterval(meetingRecTimerId); meetingRecTimerId = null; }
}

function stopMeetingRecording() {
  if (!meetingRecorder) return;
  meetingRecCancelFlag = false;
  try { meetingRecorder.stop(); } catch (err) {}
  const endBtn = getEl('meetingNotesEndBtn');
  const cancelBtn = getEl('meetingNotesCancelBtn');
  const timer = getEl('meetingNotesRecTimer');
  if (endBtn) { endBtn.disabled = true; endBtn.textContent = 'Processing\u2026'; }
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (timer) timer.textContent = '\u25CF Saving\u2026';
  syncMeetingRecFloat_();
}

function cancelMeetingRecording() {
  meetingRecCancelFlag = true;
  if (meetingRecorder && meetingRecorder.state === 'recording') {
    try { meetingRecorder.stop(); } catch (err) {}
  } else {
    meetingRecBlob = null;
    meetingRecChunks = [];
    meetingRecCleanup_();
    meetingRecorder = null;
    stopMeetingRecTimer();
    resetMeetingRecUi_();
    setMeetingRecStatus('Recording cancelled.');
  }
  syncMeetingRecFloat_();
}

function resetMeetingRecUi_() {
  const startBtn = getEl('meetingNotesStartBtn');
  const endBtn = getEl('meetingNotesEndBtn');
  const cancelBtn = getEl('meetingNotesCancelBtn');
  const timer = getEl('meetingNotesRecTimer');
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (endBtn) { endBtn.style.display = 'none'; endBtn.disabled = false; endBtn.textContent = 'End recording'; }
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (timer) timer.style.display = 'none';
  syncMeetingRecFloat_();
}

function setMeetingRecStatus(msg) {
  const status = getEl('meetingNotesRecStatus');
  if (status) status.textContent = msg || '';
}

/* ---------------------------------- Per-record AI insight (cards + table rows) ---------------------------------- */
/* "AI insight" toggles an inline collapsible panel under a card / table row
   (editors and admins). If the record has a linked file, an "Analyze linked
   file" button fetches the link content and runs AI analysis over it. */

function cardAiPanelHtml_() {
  return '<div class="card-ai-head">' +
    '<span class="card-ai-title">AI insight</span>' +
    '<button class="btn btn-small btn-ghost" type="button" onclick="collapseCardAi(this)">Collapse</button>' +
    '</div>' +
    '<div class="card-ai-body"></div>';
}

function toggleCardAi(row, btn) {
  if (!appState.isEditor) { showToast('Admin/editor access required', 'warning'); return; }
  const article = btn.closest('.card');
  if (!article) return;
  let panel = article.querySelector('.card-ai-insight');
  if (panel) { panel.classList.toggle('card-ai-collapsed'); return; }
  panel = document.createElement('div');
  panel.className = 'card-ai-panel card-ai-insight';
  panel.innerHTML = cardAiPanelHtml_();
  article.appendChild(panel);
  loadCardAi(panel, row);
}

function collapseCardAi(btn) {
  const panel = btn.closest('.card-ai-panel');
  if (panel) panel.classList.add('card-ai-collapsed');
}

function toggleRowAi(row, btn) {
  if (!appState.isEditor) { showToast('Admin/editor access required', 'warning'); return; }
  const tr = btn.closest('tr');
  if (!tr) return;
  const next = tr.nextElementSibling;
  if (next && next.classList && next.classList.contains('ai-insight-tr')) { next.remove(); return; }
  const panelTr = document.createElement('tr');
  panelTr.className = 'ai-insight-tr';
  const td = document.createElement('td');
  td.setAttribute('colspan', '8');
  td.className = 'card-ai-panel card-ai-insight';
  td.innerHTML = cardAiPanelHtml_();
  panelTr.appendChild(td);
  tr.parentNode.insertBefore(panelTr, tr.nextSibling);
  loadCardAi(td, row);
}

function aiBulletsHtml_(text, tag) {
  const t = tag === 'li' ? 'li' : 'div';
  const lines = String(text || '').split(/\r?\n/).map(function (line) {
    return line.replace(/^[-*\u2022\u25CF\s]+/, '').trim();
  }).filter(function (line) { return line; });
  const items = lines.length ? lines : [String(text || '')];
  return items.map(function (line) {
    return '<' + t + ' style="display:flex;gap:8px;align-items:flex-start;font-size:14px;line-height:1.5;">' +
      '<span style="color:var(--accent,#2563eb);font-weight:700;">&rsaquo;</span>' +
      '<span>' + escapeHtml(line) + '</span></' + t + '>';
  }).join('');
}

function loadCardAi(panel, row) {
  const body = panel.querySelector('.card-ai-body');
  if (!body) return;
  body.innerHTML = '<div class="card-ai-loading">Generating insight…</div>';
  ApiService.getCardAiInsight(row).then(function (data) {
    if (!data || data.success !== true) {
      const msg = (data && data.message) || 'Could not generate AI insight.';
      body.innerHTML = '<div class="card-ai-error">' + escapeHtml(msg) + '</div>';
      return;
    }
    body.innerHTML = aiBulletsHtml_(data.insights || '', 'div');
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    const msg = err && err.message ? err.message : String(err || 'Unknown error');
    body.innerHTML = '<div class="card-ai-error">' + escapeHtml(msg) + '</div>';
  });
}

function cardLinkPanelHtml_() {
  return '<div class="card-ai-head">' +
    '<span class="card-ai-title">Linked file analysis</span>' +
    '<button class="btn btn-small btn-ghost" type="button" onclick="collapseCardAi(this)">Collapse</button>' +
    '</div>' +
    '<div class="card-ai-body"></div>';
}

function toggleCardLink(row, btn) {
  if (!appState.isEditor) { showToast('Admin/editor access required', 'warning'); return; }
  const article = btn.closest('.card');
  if (!article) return;
  let panel = article.querySelector('.card-link-panel');
  if (panel) { panel.classList.toggle('card-ai-collapsed'); return; }
  panel = document.createElement('div');
  panel.className = 'card-ai-panel card-link-panel';
  panel.innerHTML = cardLinkPanelHtml_();
  article.appendChild(panel);
  loadCardLink(panel, row);
}

function toggleRowLink(row, btn) {
  if (!appState.isEditor) { showToast('Admin/editor access required', 'warning'); return; }
  const tr = btn.closest('tr');
  if (!tr) return;
  const next = tr.nextElementSibling;
  if (next && next.classList && next.classList.contains('ai-link-tr')) { next.remove(); return; }
  const panelTr = document.createElement('tr');
  panelTr.className = 'ai-link-tr';
  const td = document.createElement('td');
  td.setAttribute('colspan', '8');
  td.className = 'card-ai-panel card-link-panel';
  td.innerHTML = cardLinkPanelHtml_();
  panelTr.appendChild(td);
  tr.parentNode.insertBefore(panelTr, tr.nextSibling);
  loadCardLink(td, row);
}

function itemHasLink_(item) {
  const links = (item && item.linkUrls) || {};
  return Object.keys(links).some(function (k) { return !!links[k]; });
}

function loadCardLink(panel, row) {
  const body = panel.querySelector('.card-ai-body');
  if (!body) return;
  body.innerHTML = '<div class="card-ai-loading">Analyzing linked file…</div>';
  ApiService.getLinkContentAiInsight(row).then(function (data) {
    if (!data || data.success !== true) {
      const msg = (data && data.message) || 'Could not analyze the linked file.';
      body.innerHTML = '<div class="card-ai-error">' + escapeHtml(msg) + '</div>';
      return;
    }
    body.innerHTML = linkAiResultHtml_(data);
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    const msg = err && err.message ? err.message : String(err || 'Unknown error');
    body.innerHTML = '<div class="card-ai-error">' + escapeHtml(msg) + '</div>';
  });
}

function linkAiResultHtml_(data) {
  const head = '<div class="card-ai-link-label">' + escapeHtml(data.source || '') +
    (data.contentRead && data.contentLength ? ' <span class="card-ai-size">' +
      Number(data.contentLength).toLocaleString() + ' chars' +
      (data.contentTruncated ? ' · truncated' : '') + '</span>' : '') +
    (data.contentRead ? '' : ' <em>(content not readable — analyzed from record only)</em>') + '</div>';
  let html = head + aiBulletsHtml_(data.insights || '', 'div');
  if (data.previewFormat === 'table' && data.previewRows && data.previewRows.length) {
    let rows = data.previewRows.slice();
    let title = '';
    if (rows.length > 1) {
      const n0 = rows[0].filter(function (c) { return String(c).trim() !== ''; }).length;
      const n1 = rows[1].filter(function (c) { return String(c).trim() !== ''; }).length;
      if (n0 === 1 && n1 > n0) {
        title = rows[0].filter(function (c) { return String(c).trim() !== ''; })[0];
        rows = rows.slice(1);
      }
    }
    const thead = '<thead><tr>' + (rows[0] || []).map(function (c) {
      return '<th>' + escapeHtml(c) + '</th>';
    }).join('') + '</tr></thead>';
    const tbody = '<tbody>' + rows.slice(1).map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + escapeHtml(c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';
    const note = (data.previewRowTotal && data.previewRowTotal > data.previewRows.length)
      ? '<div class="card-ai-table-note">Showing first ' + data.previewRows.length + ' of ' +
        Number(data.previewRowTotal).toLocaleString() + ' rows</div>'
      : '';
    html += '<details class="card-ai-preview" open><summary>Linked file preview</summary>' +
      (title ? '<div class="card-ai-table-title">' + escapeHtml(title) + '</div>' : '') +
      '<div class="card-ai-table-wrap"><table class="card-ai-table">' + thead + tbody + '</table></div>' +
      note + '</details>';
  } else if (data.preview) {
    html += '<details class="card-ai-preview"><summary>Linked file preview</summary>' +
      '<div class="card-ai-preview-text">' + escapeHtml(data.preview) + '</div></details>';
  }
  return html;
}

/* ---------------------------------- In-page link preview ---------------------------------- */
/* Opens a URL in an embedded iframe inside the dashboard instead of a new tab.
   Drive document previews use the Google Drive /preview host; plain URLs are
   attempted too, with a fallback "Open in new tab" button for sites that block
   embedding. */

/* Rewrite shareable URLs to an embeddable form where possible (Drive file
   links -> /preview host). Returns the URL unchanged when not recognized. */
function toEmbeddableUrl(url) {
  if (!url) return '';
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
  const o = url.match(/drive\.google\.com\/open\?id=([^&#]+)/);
  if (o) return 'https://drive.google.com/file/d/' + o[1] + '/preview';
  return url;
}

function openLinkPreview(url, title) {
  const frame = getEl('previewFrame');
  const openNew = getEl('previewOpenNew');
  if (!frame) { window.open(url, '_blank'); return; }
  const titleEl = getEl('previewModalTitle');
  if (titleEl) titleEl.textContent = title || 'Preview';
  if (openNew) openNew.href = url;
  previewZoom = 100;
  applyPreviewZoom();
  frame.src = toEmbeddableUrl(url) || '';
  openDialog('previewModal');
}

function closeLinkPreview() {
  const frame = getEl('previewFrame');
  if (frame) frame.src = 'about:blank';
  closeDialog('previewModal');
}

/* ---------------------------------- Preview zoom ---------------------------------- */
/* Scales the embedded iframe so Sheets/Docs/Presentations (and any other
   preview) can be zoomed in/out. Zoom buttons call these directly; trackpad
   pinch (browsers send Ctrl+wheel) is wired by wirePreviewPinch(). */

let previewZoom = 100;

function applyPreviewZoom() {
  const frame = getEl('previewFrame');
  const value = getEl('previewZoomValue');
  if (frame) frame.style.zoom = previewZoom / 100;
  if (value) value.textContent = previewZoom + '%';
}

function adjustPreviewZoom(delta) {
  previewZoom = Math.min(300, Math.max(50, previewZoom + delta));
  applyPreviewZoom();
}

function previewZoomIn() { adjustPreviewZoom(10); }
function previewZoomOut() { adjustPreviewZoom(-10); }
function previewZoomReset() { previewZoom = 100; applyPreviewZoom(); }

/* Trackpad pinch-to-zoom (and Ctrl+scroll on a mouse) scales the preview. */
function wirePreviewPinch() {
  const stage = getEl('previewStage');
  if (!stage) return;
  stage.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    adjustPreviewZoom(e.deltaY < 0 ? 10 : -10);
  }, { passive: false });
}

/* Preview handler for Drive attachments: file id -> /preview embed host. */
function openDriveDocPreview(fileId, fileName) {
  if (!fileId) return;
  openLinkPreview('https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/preview', fileName || 'Document preview');
}

/* Delegated handler: intercept links that would otherwise open in a new tab
   (auto-linkified URLs in records, table cells, Drive attachments) so they
   render in the in-page preview modal instead. The "Open in new tab" button
   inside the preview modal itself is exempt, and non-http(s) schemes like
   mailto:/tel: keep their default behaviour. */
function wireEmbeddedLinkPreview() {
  document.addEventListener('click', function (event) {
    const link = event.target.closest ? event.target.closest('a[data-embed], a[target="_blank"]') : null;
    if (!link) return;
    if (link.closest && link.closest('#previewModal')) return;
    const href = link.getAttribute('href') || '';
    if (!/^https?:/i.test(href)) return;
    event.preventDefault();
    openLinkPreview(href, link.textContent.trim());
  });
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
  const username = (user.username || '').trim();
  const role = user.role || 'VIEWER';
  const name = username || (email ? email.split('@')[0] : 'Guest');
  const initial = (username || email) ? (username || email).charAt(0).toUpperCase() : '?';
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
  const meetingBtn = getEl('meetingNotesBtn');
  if (meetingBtn) meetingBtn.style.display = appState.isAdmin ? 'inline-flex' : 'none';
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
    refreshCounts();
    showToast('All notifications marked as read.', 'success');
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not update notifications: ' + (err.message || err), 'error');
  });
}

function clearAllNotifications() {
  ApiService.clearMyNotifications().then(function (data) {
    appState.notifications = data || { unread: 0, recent: [] };
    renderNotifications();
    refreshCounts();
    showToast('All notifications cleared.', 'success');
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
    showToast('Could not clear notifications: ' + (err.message || err), 'error');
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
    refreshCounts();
  }).catch(function (err) {
    if (handleServerFailure(err)) return;
  });
  closeNotificationsPanel();
  const map = { record: 'dashboard', submission: 'dashboard', user: 'settings', system: 'dashboard' };
  openTab(map[type] || 'dashboard');
}

/* ---------------------------------- Point 6: cached counts ---------------------------------- */

/* Generates a one-time client id (idempotency keys, offline queue items). */
function newClientId_() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* Refreshes the KPI tiles + notification badge from the lightweight count
 * endpoints — never reloads a full list and never throws. Keeps working when
 * the count call fails (tiles fall back to '—'). */
function refreshCounts() {
  return ApiService.getDashboardCounts().then(function (counts) {
    appState.counts = counts || {};
    renderKpiCards();
    if (counts && typeof counts.unreadNotifications === 'number') {
      if (!appState.notifications) appState.notifications = { unread: 0, recent: [] };
      appState.notifications.unread = counts.unreadNotifications;
      renderNotifications();
    }
  }).catch(function () {
    // silent: keep last known values; tiles fall back to '—' when absent
  });
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
  if (tabId === 'dashboard') { renderDashboard(); refreshCounts(); }
  if (tabId === 'tasks') { renderTasks(); refreshCounts(); }
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
