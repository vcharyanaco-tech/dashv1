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

function normalizeItemForSheet_(item) {
  return {
    id: item && item.id !== undefined && item.id !== null ? item.id : "",
    sector: item && item.sector !== undefined && item.sector !== null ? item.sector : "",
    description: item && item.description !== undefined && item.description !== null ? item.description : "",
    entryDate: item && item.entryDate !== undefined && item.entryDate !== null ? item.entryDate : "",
    action: item && item.action !== undefined && item.action !== null ? item.action : "",
    responsibility: item && item.responsibility !== undefined && item.responsibility !== null ? item.responsibility : "",
    reviewDate: item && item.reviewDate !== undefined && item.reviewDate !== null ? item.reviewDate : ""
  };
}

function normalizeHeaderValue_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isLikelyHeaderRow_(row) {
  const normalized = (row || []).map(function (value) {
    return normalizeHeaderValue_(value);
  });

  const hits = normalized.filter(function (value) {
    return value === "id" ||
      value === "sector" ||
      value === "description" ||
      value === "entrydate" ||
      value === "entry" ||
      value === "action" ||
      value === "responsibility" ||
      value === "responsible" ||
      value === "reviewdate" ||
      value === "review" ||
      value === "due" ||
      value === "date";
  }).length;

  return hits >= 2;
}

function findHeaderRow_(sheet) {
  if (!sheet) {
    return 0;
  }

  const values = sheet.getDataRange().getValues();

  for (let index = 0; index < values.length; index++) {
    if (isLikelyHeaderRow_(values[index])) {
      return index + 1;
    }
  }

  return 0;
}

function getPreferredHeaderRow_(sheet) {
  if (!sheet) {
    return 0;
  }

  const values = sheet.getDataRange().getValues();
  const row3 = values[2] || [];

  if (row3.length && isLikelyHeaderRow_(row3)) {
    return 3;
  }

  return findHeaderRow_(sheet);
}

function getHeaderValues_(sheet) {
  if (!sheet) {
    return [];
  }

  const headerRow = getPreferredHeaderRow_(sheet);
  const values = sheet.getDataRange().getValues();
  return headerRow > 0 ? (values[headerRow - 1] || []) : [];
}

function buildFieldMap_(headers) {
  const map = {};

  headers.forEach(function (header, index) {
    const normalized = normalizeHeaderValue_(header);

    if (!normalized) {
      return;
    }

    if (normalized === "id" || normalized.indexOf("id") !== -1) {
      map.id = index;
    } else if (normalized === "sector" || normalized.indexOf("sector") !== -1) {
      map.sector = index;
    } else if (normalized === "description" || normalized.indexOf("description") !== -1) {
      map.description = index;
    } else if (normalized === "entrydate" || normalized.indexOf("entrydate") !== -1 || normalized.indexOf("entry") !== -1) {
      map.entryDate = index;
    } else if (normalized === "action" || normalized.indexOf("action") !== -1) {
      map.action = index;
    } else if (normalized === "responsibility" || normalized.indexOf("responsibility") !== -1 || normalized.indexOf("responsible") !== -1) {
      map.responsibility = index;
    } else if (normalized === "reviewdate" || normalized.indexOf("reviewdate") !== -1 || normalized.indexOf("review") !== -1 || normalized.indexOf("due") !== -1) {
      map.reviewDate = index;
    }
  });

  return map;
}

function getDataStartRow_(sheet) {
  const headerRow = getPreferredHeaderRow_(sheet);
  return headerRow > 0 ? headerRow + 1 : CONFIG.SHEET.START_ROW;
}

function getFieldValue_(fieldMap, row, fieldName, fallbackIndex) {
  if (!row) {
    return "";
  }

  const index = fieldMap[fieldName];

  if (index !== undefined && index < row.length) {
    return row[index];
  }

  if (fallbackIndex !== undefined && fallbackIndex < row.length) {
    return row[fallbackIndex];
  }

  return "";
}

function ensureSheetStructure_(sheet) {
  if (!sheet) {
    return null;
  }

  return sheet;
}

function getSheetDataRows_(sheet) {
  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    return [];
  }

  const headerRow = getPreferredHeaderRow_(sheet);
  const startRow = headerRow > 0 ? headerRow + 1 : 1;
  const headerValues = getHeaderValues_(sheet);
  const fieldMap = headerValues.length ? buildFieldMap_(headerValues) : {};

  return values.slice(startRow - 1).reduce(function (rows, row, index) {
    const normalizedRow = (row || []).slice(0, CONFIG.SHEET.NUM_COLS);
    const hasContent = normalizedRow.some(function (value) {
      return String(value || "").trim() !== "";
    });

    if (!hasContent) {
      return rows;
    }

    const rowNumber = startRow + index;

    rows.push({
      rowNumber: rowNumber,
      id: getFieldValue_(fieldMap, normalizedRow, "id", 0),
      sector: getFieldValue_(fieldMap, normalizedRow, "sector", 1),
      description: getFieldValue_(fieldMap, normalizedRow, "description", 2),
      entryDate: getFieldValue_(fieldMap, normalizedRow, "entryDate", 3),
      action: getFieldValue_(fieldMap, normalizedRow, "action", 4),
      responsibility: getFieldValue_(fieldMap, normalizedRow, "responsibility", 5),
      reviewDate: getFieldValue_(fieldMap, normalizedRow, "reviewDate", 6)
    });

    return rows;
  }, []);
}

function getAuditDerivedRows_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return [];

    // find audit sheet
    let audit = ss.getSheetByName('Audit Log');
    if (!audit) {
      const sheets = ss.getSheets();
      for (let i = 0; i < sheets.length; i++) {
        if ((sheets[i].getName() || '').toLowerCase().indexOf('audit') !== -1) {
          audit = sheets[i];
          break;
        }
      }
    }

    if (!audit) return [];

    const lastRow = audit.getLastRow();
    if (lastRow < 2) return [];

    const values = audit.getRange(2, 1, lastRow - 1, Math.max(5, audit.getLastColumn())).getValues();
    const rows = [];

    values.forEach(function (r, idx) {
      const action = String(r[2] || '').toLowerCase();
      const details = r[4] || '';

      if (action === 'add' || action === 'added' || (details && String(details).trim().charAt(0) === '{')) {
        try {
          const obj = typeof details === 'string' ? JSON.parse(details) : details;
          rows.push({
            rowNumber: 0,
            id: obj.id || obj.ID || idx + 1,
            sector: obj.sector || obj.Sector || '',
            description: obj.description || obj.Description || '',
            entryDate: obj.entryDate || obj.EntryDate || '',
            action: obj.action || obj.Action || '',
            responsibility: obj.responsibility || obj.Responsibility || '',
            reviewDate: obj.reviewDate || obj.ReviewDate || ''
          });
        } catch (err) {
          // ignore parse errors
        }
      }
    });

    return rows;
  } catch (err) {
    return [];
  }
}

const SOURCE_SPREADSHEET_ID = "1xQaysoLjDIqNa5X_QnvA5FWp7J6lMr5r6lzLGalm-y8";

function getSourceSpreadsheetId_() {
  return SOURCE_SPREADSHEET_ID;
}

function getPreferredSpreadsheetId_() {
  return SOURCE_SPREADSHEET_ID;
}

function bindSpreadsheet_(spreadsheetId) {
  const id = String(spreadsheetId || "").trim();

  if (!id) {
    return null;
  }

  PropertiesService
    .getScriptProperties()
    .setProperty("SPREADSHEET_ID", id);

  try {
    return SpreadsheetApp.openById(id);
  } catch (err) {
    return null;
  }
}

function getBoundSpreadsheetId_() {
  return String(
    PropertiesService
      .getScriptProperties()
      .getProperty("SPREADSHEET_ID") || ""
  ).trim();
}

function getSpreadsheetBindingInfo() {
  const id = getPreferredSpreadsheetId_();

  if (!id) {
    return {
      spreadsheetId: "",
      url: ""
    };
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(id);

    return {
      spreadsheetId: id,
      url: spreadsheet ? spreadsheet.getUrl() : ""
    };
  } catch (err) {
    return {
      spreadsheetId: id,
      url: ""
    };
  }
}

function bindCurrentSpreadsheet() {
  try {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    if (!activeSpreadsheet) {
      return {
        success: false,
        message: "No active spreadsheet is available."
      };
    }

    const id = activeSpreadsheet.getId();
    PropertiesService
      .getScriptProperties()
      .setProperty("SPREADSHEET_ID", id);

    return {
      success: true,
      spreadsheetId: id,
      url: activeSpreadsheet.getUrl()
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  }
}

function getSpreadsheet_() {
  const spreadsheetId = getPreferredSpreadsheetId_();

  if (!spreadsheetId) {
    return null;
  }

  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    return null;
  }
}


/**
 * Run this function once in the Apps Script editor as the deploying user
 * to force the OAuth consent flow and pre-authorize the script's scopes.
 */
function preauthorize() {
  try {
    const ss = getSpreadsheet_();
    return {
      success: !!ss,
      spreadsheetId: ss ? ss.getId() : "",
      url: ss ? ss.getUrl() : ""
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  }
}

function inspectBoundSheet_() {
  const spreadsheet = getSpreadsheet_();
  const sheets = spreadsheet.getSheets();
  const summary = [];

  sheets.forEach(function (sheet) {
    const data = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 8), Math.min(sheet.getLastColumn(), 8)).getValues();

    summary.push({
      name: sheet.getName(),
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn(),
      preview: data
    });
  });

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    activeSheetName: spreadsheet.getActiveSheet().getName(),
    sheets: summary
  };
}

function getSheet_() {
  const ss = getSpreadsheet_();

  if (!ss) {
    return null;
  }

  const sheets = ss.getSheets();
  let sheet = null;

  for (let index = 0; index < sheets.length; index++) {
    const candidate = sheets[index];
    if (candidate.getName().toLowerCase() === String(CONFIG.SHEET.NAME || "").toLowerCase()) {
      sheet = candidate;
      break;
    }
  }

  if (!sheet) {
    let bestSheet = null;
    let bestScore = -1;

    sheets.forEach(function (candidate) {
      const headerRow = findHeaderRow_(candidate);
      const lastRow = candidate.getLastRow();
      const dataRows = Math.max(0, lastRow - (headerRow > 0 ? headerRow : 1) + 1);
      let score = 0;

      if (headerRow > 0) {
        score += 40;
      }

      if (dataRows > 0) {
        score += Math.min(dataRows, 10);
      }

      if (candidate.getLastRow() > 1 || candidate.getLastColumn() > 1) {
        score += 5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestSheet = candidate;
      }
    });

    if (bestSheet && bestScore >= 5) {
      sheet = bestSheet;
    }
  }

  if (!sheet) {
    sheet = ss.getActiveSheet();
  }

  return ensureSheetStructure_(sheet);
}

function getDataRange_() {
  const sheet = getSheet_();
  const startRow = getDataStartRow_(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return null;
  }

  return sheet.getRange(
    startRow,
    1,
    lastRow - startRow + 1,
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

  const startRow = getDataStartRow_(sheet);

  sheet
    .getRange(
      startRow,
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