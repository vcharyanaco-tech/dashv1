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
    TTL: 60
  },
  USERS: {
    SHEET_NAME: 'Users',
    SESSION_TTL_SECONDS: 21600,
    RESET_TTL_MINUTES: 30,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCK_MINUTES: 15,
    ACTIVITY_LIMIT: 500
  },
  SUBMISSIONS: {
    SHEET_NAME: 'Submissions',
    MAX_TEXT_LENGTH: 5000
  },
  NOTIFICATIONS: {
    SHEET_NAME: 'Notifications',
    MAX_PER_USER: 50
  },
  WORKFLOW: {
    APPROVALS_SHEET_NAME: 'Approvals'
  },
  TASKS: {
    SHEET_NAME: 'Tasks'
  },
  DOCUMENTS: {
    SHEET_NAME: 'Documents'
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
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  USER_IMPORT: 'USER_IMPORT',
  USER_RESET_PASSWORD: 'USER_RESET_PASSWORD',
  SUBMISSION_ADD: 'SUBMISSION_ADD',
  SUBMISSION_UPDATE: 'SUBMISSION_UPDATE',
  SUBMISSION_LOCK: 'SUBMISSION_LOCK',
  SUBMISSION_UNLOCK: 'SUBMISSION_UNLOCK',
  SUBMISSION_DELETE: 'SUBMISSION_DELETE',
  SUBMISSION_DISPLAY: 'SUBMISSION_DISPLAY',
  SUBMISSION_HIDE: 'SUBMISSION_HIDE',
  REVIEW_DONE: 'REVIEW_DONE',
  REVIEW_NOT_DONE: 'REVIEW_NOT_DONE'
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

/**
 * Feature modules used by the RBAC permission matrix.
 */
const MODULES = Object.freeze({
  RECORDS: 'records',
  SUBMISSIONS: 'submissions',
  AUDIT: 'audit',
  USERS: 'users',
  REPORTS: 'reports',
  SETTINGS: 'settings'
});

/**
 * Granular actions available on each module.
 */
const MODULE_ACTIONS = Object.freeze({
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  EXPORT: 'export',
  APPROVE: 'approve'
});

/**
 * RBAC permission matrix. A user's effective permissions are the union of
 * their role's grants and any grants from their assigned groups.
 * @type {Object<string, Object<string, string[]>>}
 */
const PERMISSIONS = Object.freeze({
  ADMIN: {
    records: ['view', 'create', 'edit', 'delete', 'export', 'approve'],
    submissions: ['view', 'create', 'edit', 'delete', 'export', 'approve'],
    audit: ['view', 'delete', 'export'],
    users: ['view', 'create', 'edit', 'delete', 'export'],
    reports: ['view', 'export'],
    settings: ['view', 'edit']
  },
  EDITOR: {
    records: ['view', 'create', 'edit', 'export'],
    submissions: ['view', 'create', 'edit', 'export'],
    audit: ['view'],
    users: [],
    reports: ['view', 'export'],
    settings: []
  },
  VIEWER: {
    records: ['view'],
    submissions: ['view', 'create'],
    audit: [],
    users: [],
    reports: ['view'],
    settings: []
  }
});

/**
 * User groups. Assigning a group to a user grants the group's permissions
 * on top of the user's role permissions. A user's 'Group' cell may hold one
 * or more comma-separated group names.
 */
const USER_GROUPS = Object.freeze({
  APPROVER: {
    label: 'Approver',
    permissions: { records: ['approve'] }
  },
  AUDITOR: {
    label: 'Auditor',
    permissions: { audit: ['view', 'export', 'delete'], users: ['view'] }
  },
  EXPORTER: {
    label: 'Exporter',
    permissions: { records: ['export'], audit: ['export'], reports: ['export'] }
  }
});

const USER_GROUP_KEYS = Object.freeze(Object.keys(USER_GROUPS));

/**
 * Workflow approval types. Each entry describes an approval flow that the
 * engine routes to approvers (ADMIN role or APPROVER group).
 */
const WORKFLOW_TYPES = Object.freeze({
  RECORD_REVIEW: {
    key: 'RECORD_REVIEW',
    module: MODULES.RECORDS,
    label: 'Record review'
  }
});

const APPROVAL_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
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
