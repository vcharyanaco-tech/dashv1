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
  NOTIF: 'dashv1:countGen:notif'
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
  return 'counts:v1:' + scope + ':d' + d + ':r' + r + ':t' + t + ':n' + n + ':u' + safeCacheKey_(email);
}

function countCacheRead_(key) {
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

/**
 * Invalidates count caches by bumping the relevant generation counter.
 * @param {string} family 'records' | 'tasks' | 'notif'.
 *   Records additionally keep the getData() payload itself consistent via
 *   patchCachedDataRow_ / bumpDataGeneration_ in RecordService.js.
 */
function invalidateCounts_(family) {
  if (family === 'records') bumpCountGen_(COUNT_GEN_PROP.RECORDS);
  else if (family === 'tasks') bumpCountGen_(COUNT_GEN_PROP.TASKS);
  else if (family === 'notif') bumpCountGen_(COUNT_GEN_PROP.NOTIF);
}

/**
 * Task counts (global task data, cached per user, 45s TTL).
 * @param {string} token Session token (login required).
 * @returns {{open: number, dueToday: number, overdue: number, completed: number, total: number}}
 */
function getTaskCounts(token) {
  const user = requireLogin_(token);
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
  const user = requireLogin_(token);
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
  const user = requireLogin_(token);
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
