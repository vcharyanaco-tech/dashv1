/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Counts.gs
 * Lightweight cached count endpoints (Point 6).
 *
 * Every count family is cached per logged-in user with a SHORT TTL and a
 * cache key that embeds generation counters, so a mutation instantly orphans
 * stale counts without per-recipient invalidation:
 *   counts:v1:<scope>:d<dataGen>:t<taskGen>:n<notifGen>:u<emailHash>
 * - dataGen is the existing data-generation counter (bumped by record
 *   add/delete); record edits patch the cached getData() payload directly.
 * - taskGen is bumped by every task mutation (Tasks.js).
 * - notifGen is bumped by every notification write/read (Notifications.js).
 * ============================================================
 */

const COUNT_GEN_PROP = Object.freeze({
  RECORDS: 'dashv1:countGen:records',
  TASKS: 'dashv1:countGen:tasks',
  NOTIF: 'dashv1:countGen:notif',
  SUBMISSIONS: 'dashv1:countGen:submissions'
});

function countGen_(prop) {
  try {
    const g = parseInt(PropertiesService.getScriptProperties().getProperty(prop) || '1', 10);
    return isFinite(g) && g > 0 ? g : 1;
  } catch (err) {
    return 1;
  }
}

/** Bumps a count generation counter — orphans every cached count payload
 *  whose key embeds the old generation. Call after the relevant mutation. */
function bumpCountGen_(prop) {
  try {
    PropertiesService.getScriptProperties().setProperty(prop, String(countGen_(prop) + 1));
  } catch (err) {}
}

/** Cache key for a count family, per user, versioned by all four gens. */
function countCacheKey_(scope, email) {
  const d = dataGeneration_();
  const r = countGen_(COUNT_GEN_PROP.RECORDS);
  const t = countGen_(COUNT_GEN_PROP.TASKS);
  const n = countGen_(COUNT_GEN_PROP.NOTIF);
  return 'counts:v1:' + scope + ':d' + d + ':r' + r + ':t' + t + ':n' + n + ':u' + AppUtils.safeCacheKey(email);
}

function countCacheRead_(key) {
  flushCountBumps_(); // a read must observe pending mutations: collapse them into one bump first
  try {
    const hit = CacheService.getScriptCache().get(key);
    return hit ? JSON.parse(hit) : null;
  } catch (err) {
    return null;
  }
}

function countCacheWrite_(key, payload, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(payload), Math.max(1, ttlSeconds || CONFIG.CACHE.COUNTS_TTL_FAST));
  } catch (err) {}
}

/* ============================================================
 * Deferred count-generation bump batching
 *
 * Multi-mutation flows (task create/update with notifications, submission add
 * with per-recipient staff notifications, stable-ID migration) used to bump a
 * count generation after EVERY write or notification — each bump orphaned
 * cached payloads (tasks list, submissions overview) and count tiles. Inside
 * runWithBatchedCountBumps_, invalidateCounts_() only records the family as
 * pending; the wrapper flushes each pending family exactly once on exit
 * (finally — even on throw). The cached read funnels flush pending first, so
 * an intra-flow read observes all mutations. Flush is a no-op outside a
 * deferred context (pending only accumulates while deferred), so the hot read
 * path pays nothing.
 *
 * Note: flush-on-read is wired into the count-tile (countCacheRead_), tasks
 * (cachedTasksList_), submissions (getSubmissionOverview_) and users
 * (readUserRecords_) reads. The records/getData payload (RecordService) is NOT
 * wired — a wrapped flow that bumps 'records' must re-read getData or flush
 * explicitly to avoid serving a stale payload.
 * ============================================================ */

let __countBumpsDeferred__ = false;
let __countBumpsPending__ = {};

const COUNT_FAMILY_PROP = Object.freeze({
  records: COUNT_GEN_PROP.RECORDS,
  tasks: COUNT_GEN_PROP.TASKS,
  notif: COUNT_GEN_PROP.NOTIF,
  submissions: COUNT_GEN_PROP.SUBMISSIONS
});

function bumpCountFamily_(family) {
  const prop = COUNT_FAMILY_PROP[family];
  if (prop) bumpCountGen_(prop);
}

/**
 * Invalidates count caches by bumping the relevant generation counter.
 * Deferred-aware: inside a batched flow it records the family as pending and
 * the flush on wrapper exit performs one bump per family.
 * @param {string} family 'records' | 'tasks' | 'notif' | 'submissions'.
 *   Records additionally keep the getData() payload itself consistent via
 *   patchCachedDataRow_ / bumpDataGeneration_ in RecordService.js.
 */
function invalidateCounts_(family) {
  if (__countBumpsDeferred__) { __countBumpsPending__[family] = true; return; }
  bumpCountFamily_(family);
}

/** Collapses all pending families into one bump each. No-op when nothing is
 *  pending or no flow is deferred — safe to call on every cached read. */
function flushCountBumps_() {
  if (!__countBumpsDeferred__) return;
  const families = Object.keys(__countBumpsPending__);
  if (!families.length) return;
  __countBumpsPending__ = {};
  for (let i = 0; i < families.length; i++) bumpCountFamily_(families[i]);
}

/* Runs fn with count-generation bumps deferred; all mutations inside collapse
 * into one bump per family (flushed on exit, including on throw). Nested calls
 * flush their own batch and restore the outer deferral state — pending is
 * flushed, never restored (one bump invalidates both batches, so correctness
 * holds even if a flow ever nests wrappers). */
function runWithBatchedCountBumps_(fn) {
  const wasDeferred = __countBumpsDeferred__;
  __countBumpsDeferred__ = true;
  try {
    return fn();
  } finally {
    flushCountBumps_();
    __countBumpsDeferred__ = wasDeferred;
  }
}

/* ============================================================
 * Generic chunked payload cache
 *
 * CacheService caps a single key around 100KB, so payloads that can grow
 * (Tasks list, Users sheet, Submissions overview) are split across multiple
 * keys with a count index. Keys embed a generation counter that the caller
 * bumps on mutation, so invalidation is instant without a removeAll() loop.
 * Every read/write is defensive: a quota miss simply falls back to reading
 * the spreadsheet.
 * ============================================================ */

const __PAYLOAD_CHUNK_SIZE__ = 90000;

function payloadCacheWrite_(key, payload, ttlSeconds) {
  try {
    const json = JSON.stringify(payload);
    if (!json) return;
    const cache = CacheService.getScriptCache();
    const ttl = Math.max(1, ttlSeconds || CONFIG.CACHE.COUNTS_TTL_SLOW);
    if (json.length <= __PAYLOAD_CHUNK_SIZE__) {
      cache.put(key, json, ttl);
      return;
    }
    const keyed = {};
    let chunk = 0;
    for (let i = 0; i < json.length; i += __PAYLOAD_CHUNK_SIZE__) {
      keyed[key + ':c' + chunk] = json.substring(i, i + __PAYLOAD_CHUNK_SIZE__);
      chunk++;
    }
    keyed[key + ':n'] = String(chunk);
    cache.putAll(keyed, ttl);
  } catch (err) {}
}

function payloadCacheRead_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const index = cache.get(key + ':n');
    if (index) {
      const count = parseInt(index, 10);
      if (!isFinite(count) || count < 1 || count > 50) return null;
      const keys = [];
      for (let i = 0; i < count; i++) keys.push(key + ':c' + i);
      const chunks = cache.getAll(keys) || {};
      let json = '';
      for (let i = 0; i < count; i++) {
        const c = chunks[key + ':c' + i];
        if (c === undefined || c === null) return null;
        json += c;
      }
      return JSON.parse(json);
    }
    const hit = cache.get(key);
    return hit ? JSON.parse(hit) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Task counts (global task data, cached per user, 45s TTL).
 * @param {string} token Session token (login required).
 * @returns {{open: number, dueToday: number, overdue: number, completed: number, total: number}}
 */
function getTaskCounts(token) {
  const user = AppUtils.requireLogin(token);
  const key = countCacheKey_('tasks', user.email);
  const hit = countCacheRead_(key);
  if (hit) return hit;
  const counts = computeTaskCounts_();
  countCacheWrite_(key, counts, CONFIG.CACHE.COUNTS_TTL_FAST);
  return counts;
}

/**
 * Unread-notification count for the signed-in user (45s TTL).
 * @param {string} token Session token (login required).
 * @returns {{unread: number}}
 */
function getUnreadNotificationCount(token) {
  const user = AppUtils.requireLogin(token);
  const key = countCacheKey_('notif', user.email);
  const hit = countCacheRead_(key);
  if (hit) return hit;
  const payload = { unread: countUnreadNotificationsForEmail_(user.email) };
  countCacheWrite_(key, payload, CONFIG.CACHE.COUNTS_TTL_FAST);
  return payload;
}

/**
 * Dashboard KPI counts: records + tasks + notifications in one call.
 * Record figures derive from the cached getData() payload (no full
 * sheet re-read); task/notification figures use their own short caches.
 * @param {string} token Session token (login required).
 * @returns {Object} { totalRecords, flaggedRecords, openTasks, dueToday,
 *   overdue, completedTasks, unreadNotifications }
 */
function getDashboardCounts(token) {
  const user = AppUtils.requireLogin(token);
  const key = countCacheKey_('dash', user.email);
  const hit = countCacheRead_(key);
  if (hit) return hit;

  const data = getData(); // cached payload — never a full records re-read here
  const items = data.items || [];
  const summary = buildSummaryFromItems(items);
  const taskCounts = computeTaskCounts_();
  const unread = countUnreadNotificationsForEmail_(user.email);

  const counts = {
    totalRecords: items.length,
    flaggedRecords: summary.flagged || 0,
    openTasks: taskCounts.open,
    dueToday: taskCounts.dueToday,
    overdue: taskCounts.overdue,
    completedTasks: taskCounts.completed,
    unreadNotifications: unread
  };
  countCacheWrite_(key, counts, CONFIG.CACHE.COUNTS_TTL_FAST);
  return counts;
}
