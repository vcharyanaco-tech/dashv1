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
    NORMAL: '#ffffff',
    BORDER: '#ded9d2',
    PRIMARY: '#da291c',
    SECONDARY: '#004b87'
  },
  CACHE: {
    ENABLED: true,
    TTL: 300
  },
  LOCK: {
    WAIT_TIME: 30000
  },
  APP: {
    NAME: 'India Post Dashboard',
    VERSION: '3.1',
    BRAND: 'India Post'
  }
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

function getConfig() {
  return CONFIG;
}

function getAppInfo() {
  return CONFIG.APP;
}

function getPropertyStore() {
  return PropertiesService.getScriptProperties();
}

function getAppSettings() {
  const props = getPropertyStore();
  return {
    appName: props.getProperty(PROP.APP_NAME) || CONFIG.TITLE.DEFAULT,
    sheetName: props.getProperty(PROP.SHEET_NAME) || CONFIG.SHEET.NAME,
    startRow: Number(props.getProperty(PROP.START_ROW) || CONFIG.SHEET.START_ROW)
  };
}

function saveAppSettings(settings) {
  requireAdmin();
  const props = getPropertyStore();
  props.setProperties({
    [PROP.APP_NAME]: String(settings.appName || CONFIG.TITLE.DEFAULT),
    [PROP.SHEET_NAME]: String(settings.sheetName || CONFIG.SHEET.NAME),
    [PROP.START_ROW]: String(settings.startRow || CONFIG.SHEET.START_ROW)
  });
  return getAppSettings();
}
