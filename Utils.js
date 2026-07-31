/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Utils.gs
 * Common Utility Functions
 * ============================================================
 */


/* ============================================================
 * Spreadsheet Helpers
 * ============================================================ */

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_() {
  return getSpreadsheet_().getSheetByName(CONFIG.SHEET.NAME);
}

function getDataRange_() {
  const sheet = getSheet_();

  const lastRow = sheet.getLastRow();

  if (lastRow < CONFIG.SHEET.START_ROW) {
    return null;
  }

  return sheet.getRange(
    CONFIG.SHEET.START_ROW,
    1,
    lastRow - CONFIG.SHEET.START_ROW + 1,
    CONFIG.SHEET.NUM_COLS
  );
}


/* ============================================================
 * Data Helpers
 * ============================================================ */

function getAllRows_() {

  const range = getDataRange_();

  if (!range) return [];

  return range.getValues();

}

function writeRows_(rows) {

  const sheet = getSheet_();

  if (!rows.length) return;

  sheet
    .getRange(
      CONFIG.SHEET.START_ROW,
      1,
      rows.length,
      CONFIG.SHEET.NUM_COLS
    )
    .setValues(rows);

}


/* ============================================================
 * Lock Helpers
 * ============================================================ */

function runWithLock_(callback) {

  const lock = LockService.getDocumentLock();

  lock.waitLock(CONFIG.LOCK.WAIT_TIME);

  try {

    return callback();

  } finally {

    lock.releaseLock();

  }

}


/* ============================================================
 * Cache Helpers
 * ============================================================ */

function getCache_() {
  return CacheService.getScriptCache();
}

function cacheGet_(key) {

  if (!CONFIG.CACHE.ENABLED) return null;

  const value = getCache_().get(key);

  if (!value) return null;

  return JSON.parse(value);

}

function cachePut_(key, value) {

  if (!CONFIG.CACHE.ENABLED) return;

  getCache_().put(
    key,
    JSON.stringify(value),
    CONFIG.CACHE.TTL
  );

}

function cacheRemove_(key) {

  getCache_().remove(key);

}


/* ============================================================
 * Property Helpers
 * ============================================================ */

function getProperty_(key) {

  return PropertiesService
    .getScriptProperties()
    .getProperty(key);

}

function setProperty_(key, value) {

  PropertiesService
    .getScriptProperties()
    .setProperty(key, value);

}

function deleteProperty_(key) {

  PropertiesService
    .getScriptProperties()
    .deleteProperty(key);

}


/* ============================================================
 * Date Helpers
 * ============================================================ */

function formatDate_(value) {

  if (value === null || value === undefined || value === "") return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    if (isNaN(value.getTime())) return "";
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      DATE_FORMAT.DISPLAY
    );
  }

  return String(value).trim();

}

function today_() {

  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    DATE_FORMAT.DISPLAY
  );

}

function now_() {

  return new Date();

}


/* ============================================================
 * Color Helpers
 * ============================================================ */

function flagColor_() {

  return CONFIG.COLORS.FLAG;

}

function normalColor_() {

  return CONFIG.COLORS.NORMAL;

}


/* ============================================================
 * Validation Helpers
 * ============================================================ */

function isBlank_(value) {

  return value === "" ||
         value === null ||
         value === undefined;

}

function isNumber_(value) {

  return !isNaN(value);

}

function isDate_(value) {

  return Object.prototype.toString.call(value) === "[object Date]";

}


/* ============================================================
 * Response Helpers
 * ============================================================ */

function success_(message, data) {

  return {
    success: true,
    message: message || "",
    data: data || null
  };

}

function failure_(message) {

  return {
    success: false,
    message: message || "Unknown Error"
  };

}


/* ============================================================
 * Logging
 * ============================================================ */

function log_(message, object) {

  if (object === undefined) {

    console.log(message);

  } else {

    console.log(
      message,
      JSON.stringify(object, null, 2)
    );

  }

}


/* ============================================================
 * ID Generator
 * ============================================================ */

function uuid_() {

  return Utilities.getUuid();

}


/* ============================================================
 * JSON Helpers
 * ============================================================ */

function clone_(obj) {

  return JSON.parse(JSON.stringify(obj));

}