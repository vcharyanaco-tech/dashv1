/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Settings.gs
 * Global configuration and constants
 * ============================================================
 */

const CONFIG = Object.freeze({
  SHEET: {
    NAME: 'Sheet1',
    START_ROW: 4,
    NUM_COLS: 7
  },
  TITLE: {
    DEFAULT: 'India Post Dashboard',
    DATE_FORMAT: 'dd.MM.yyyy'
  },
  COLORS: {
    FLAG: '#ffab00',
    REVIEW_DONE: '#c8e6c9',
    NORMAL: '#ffffff',
    BORDER: '#ded9d2',
    PRIMARY: '#da291c',
    SECONDARY: '#004b87'
  },
  CACHE: {
    ENABLED: true,
    TTL: 300
  },
  USERS: {
    SHEET_NAME: 'Users',
    SESSION_TTL_SECONDS: 21600,
    RESET_TTL_MINUTES: 30,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCK_MINUTES: 15
  },
  SUBMISSIONS: {
    SHEET_NAME: 'Submissions',
    MAX_TEXT_LENGTH: 5000
  },
  LOCK: {
    WAIT_TIME: 30000
  },
  APP: {
    NAME: 'India Post Dashboard',
    VERSION: '1.0.0',
    BRAND: 'India Post'
  }
});

const DATE_FORMAT = Object.freeze({
  DISPLAY: CONFIG.TITLE.DATE_FORMAT,
  SHEET: CONFIG.TITLE.DATE_FORMAT,
  FILE: 'yyyyMMdd'
});

const APP = CONFIG.APP;

/**
 * Application roles. Stored in the Users sheet 'Role' column.
 * Order is not significant; privilege checks use isAdmin/isEditor helpers.
 */
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER'
});

/**
 * Audit log action identifiers (Audit Log sheet 'Action' column).
 */
const ACTIONS = Object.freeze({
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  ERROR: 'ERROR',
  AUDIT_DELETE: 'AUDIT_DELETE',
  AUDIT_CLEAR: 'AUDIT_CLEAR',
  LOGIN: 'LOGIN',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  CHANGE_PASSWORD: 'CHANGE_PASSWORD',
  USER_ADD: 'USER_ADD',
  USER_DELETE: 'USER_DELETE',
  USER_RESET_PASSWORD: 'USER_RESET_PASSWORD',
  SUBMISSION_ADD: 'SUBMISSION_ADD',
  SUBMISSION_UPDATE: 'SUBMISSION_UPDATE',
  SUBMISSION_LOCK: 'SUBMISSION_LOCK',
  SUBMISSION_UNLOCK: 'SUBMISSION_UNLOCK',
  SUBMISSION_DELETE: 'SUBMISSION_DELETE',
  SUBMISSION_DISPLAY: 'SUBMISSION_DISPLAY',
  SUBMISSION_HIDE: 'SUBMISSION_HIDE',
  REVIEW_DONE: 'REVIEW_DONE'
});

const COL = Object.freeze({
  ID: 1,
  SECTOR: 2,
  DESCRIPTION: 3,
  ENTRY_DATE: 4,
  ACTION: 5,
  RESPONSIBILITY: 6,
  REVIEW_DATE: 7
});

const PROP = Object.freeze({
  APP_NAME: 'APP_NAME',
  SHEET_NAME: 'SHEET_NAME',
  START_ROW: 'START_ROW',
  LAST_SYNC: 'LAST_SYNC'
});

function getPropertyStore() {
  return PropertiesService.getScriptProperties();
}

/**
 * Reads overridable app settings from script properties, falling back to
 * CONFIG defaults.
 * @returns {{appName: string, sheetName: string, startRow: number}}
 */
function getAppSettings() {
  const props = getPropertyStore();
  return {
    appName: props.getProperty(PROP.APP_NAME) || CONFIG.TITLE.DEFAULT,
    sheetName: props.getProperty(PROP.SHEET_NAME) || CONFIG.SHEET.NAME,
    startRow: Number(props.getProperty(PROP.START_ROW) || CONFIG.SHEET.START_ROW)
  };
}
