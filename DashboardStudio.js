/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * DashboardStudio.gs
 * Dashboard customization: column visibility, view mode, layout.
 * ============================================================
 */

const DASHBOARD_PREF_KEYS = Object.freeze({
  VIEW_MODE: 'viewMode',
  COLUMNS: 'columns',
  LAYOUT: 'layout'
});

const VIEW_MODES = Object.freeze({
  CARDS: 'cards',
  TABLE: 'table'
});

const DEFAULT_COLUMNS = Object.freeze({
  id: true,
  sector: true,
  description: true,
  entryDate: true,
  reviewDate: true,
  actions: true
});

function getUserPreferences_(email) {
  const user = findUserRecord_(email);
  if (!user) return {};
  try {
    const raw = String(user.preferences || '').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function setUserPreferences_(email, prefs) {
  const user = findUserRecord_(email);
  if (!user) return false;
  const sh = usersSheet_();
  const col = USER_SHEET_HEADERS.indexOf('Preferences') + 1;
  if (col < 1) return false;
  sh.getRange(user.row, col).setValue(JSON.stringify(prefs || {}));
  return true;
}

function getDashboardPreferences(token) {
  const user = requireLogin_(token);
  const prefs = getUserPreferences_(user.email);
  return {
    viewMode: prefs[DASHBOARD_PREF_KEYS.VIEW_MODE] || VIEW_MODES.CARDS,
    columns: Object.assign({}, DEFAULT_COLUMNS, (prefs[DASHBOARD_PREF_KEYS.COLUMNS] || {})),
    layout: prefs[DASHBOARD_PREF_KEYS.LAYOUT] || {}
  };
}

function saveDashboardPreferences(prefs, token) {
  const user = requireLogin_(token);
  const merged = getUserPreferences_(user.email);
  merged[DASHBOARD_PREF_KEYS.VIEW_MODE] = prefs.viewMode || merged[DASHBOARD_PREF_KEYS.VIEW_MODE] || VIEW_MODES.CARDS;
  merged[DASHBOARD_PREF_KEYS.COLUMNS] = Object.assign({}, DEFAULT_COLUMNS, prefs.columns || merged[DASHBOARD_PREF_KEYS.COLUMNS] || {});
  merged[DASHBOARD_PREF_KEYS.LAYOUT] = prefs.layout || merged[DASHBOARD_PREF_KEYS.LAYOUT] || {};
  const ok = setUserPreferences_(user.email, merged);
  if (!ok) throw new Error('Could not save preferences.');
  return { success: true };
}
