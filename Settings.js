/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Settings.gs
 * Global configuration and constants
 * ============================================================
 */

/* ------------------------------------------------------------------
 * Spreadsheet Configuration
 * ------------------------------------------------------------------ */

const CONFIG = Object.freeze({

  SHEET: {
    NAME: 'Sheet1',
    START_ROW: 4,
    NUM_COLS: 7
  },

  TITLE: {
    DEFAULT: 'Circle Office Haryana Dashboard',
    DATE_FORMAT: 'dd.MM.yyyy'
  },

  COLORS: {
    FLAG: '#ffab00',
    NORMAL: '#ffffff',
    BORDER: '#d9d9d9'
  },

  CACHE: {
    ENABLED: true,
    TTL: 300
  },

  LOCK: {
    WAIT_TIME: 30000
  }

});


/* ------------------------------------------------------------------
 * Column Numbers
 * ------------------------------------------------------------------ */

const COL = Object.freeze({

  ID: 1,
  SECTOR: 2,
  DESCRIPTION: 3,
  ENTRY_DATE: 4,
  ACTION: 5,
  RESPONSIBILITY: 6,
  REVIEW_DATE: 7

});


/* ------------------------------------------------------------------
 * Validation Lists
 * ------------------------------------------------------------------ */

const LISTS = Object.freeze({

  SECTORS: [

  ],

  RESPONSIBILITY: [

  ]

});


/* ------------------------------------------------------------------
 * Date Formats
 * ------------------------------------------------------------------ */

const DATE_FORMAT = Object.freeze({

  DISPLAY: 'dd.MM.yyyy',
  SHEET: 'dd.MM.yyyy',
  FILE: 'yyyyMMdd'

});


/* ------------------------------------------------------------------
 * Script Property Keys
 * ------------------------------------------------------------------ */

const PROP = Object.freeze({

  VERSION: 'APP_VERSION',
  LAST_BACKUP: 'LAST_BACKUP',
  LAST_SYNC: 'LAST_SYNC'

});


/* ------------------------------------------------------------------
 * Utility Getters
 * ------------------------------------------------------------------ */

function getConfig() {
  return CONFIG;
}

function getSheetName() {
  return CONFIG.SHEET.NAME;
}

function getStartRow() {
  return CONFIG.SHEET.START_ROW;
}

function getColumnCount() {
  return CONFIG.SHEET.NUM_COLS;
}

function getFlagColor() {
  return CONFIG.COLORS.FLAG;
}

function getNormalColor() {
  return CONFIG.COLORS.NORMAL;
}

function getBorderColor() {
  return CONFIG.COLORS.BORDER;
}

function getDateFormat() {
  return CONFIG.TITLE.DATE_FORMAT;
}

function getTimeZone() {
  return Session.getScriptTimeZone();
}

function getProperties() {
  return PropertiesService.getScriptProperties();
}


/* ------------------------------------------------------------------
 * Application Information
 * ------------------------------------------------------------------ */

const APP = Object.freeze({

  NAME: 'Circle Office Haryana Dashboard',

  

 

  

});
