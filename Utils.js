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
    reviewDate: item && item.reviewDate !== undefined && item.reviewDate !== null ? item.reviewDate : "",
    links: item && item.links && typeof item.links === "object" ? item.links : {}
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

/* ============================================================
 * Advanced Sheets API read (fast bulk read path)
 *
 * Sheets.Spreadsheets.get with includeGridData returns raw cell data
 * (values, rich-text runs + links, and background colors) in ONE HTTP
 * round-trip, replacing the three classic calls getValues() +
 * getRichTextValues() + getBackgrounds(). Requires the "Google Sheets
 * API" advanced service (added in appsscript.json dependencies). Every
 * entry point degrades to the classic API when the service is missing.
 * ============================================================ */

/** Mirrors getPreferredHeaderRow_ but operates on the already-fetched advanced
 *  grid so the fast path never issues a second full-range getValues() read.
 * @param {Array<Object[]>} grid Row-major advanced cells (1-indexed).
 * @returns {number} Preferred header row number (1-based), or 1 when unknown.
 */
function preferredHeaderRowInGrid_(grid) {
  if (!grid || !grid.length) return 1;
  const values = grid.map(function (cells) {
    return (cells || []).map(function (c) { return c.value; });
  });
  const row3 = values[2] || [];
  if (row3.length && isLikelyHeaderRow_(row3)) return 3;
  for (let i = 0; i < values.length; i++) {
    if (isLikelyHeaderRow_(values[i])) return i + 1;
  }
  return 1;
}

/** Reads the whole data grid via the Advanced Sheets Service.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The dashboard sheet.
 * @returns {Array<Object[]>|null} row-major cells {value,runs,bg,hyperlink}
 *   for the data region, or null when the advanced service is unavailable
 *   or the read fails (caller then uses the classic API).
 */
function readGridDataAdvanced_(sheet) {
  if (!sheet || typeof Sheets === "undefined") return null;
  try {
    const ssId = getPreferredSpreadsheetId_();
    const name = sheet.getName();
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return null;

    // Fetch from row 1 in a single round-trip (title rows included); the
    // header row is detected from the grid by buildRowsFromAdvanced_, so this
    // fast path never issues a classic getDataRange() read.
    const resp = Sheets.Spreadsheets.get(ssId, {
      ranges: [name + "!A1:G" + lastRow],
      includeGridData: true,
      fields: "sheets.data.rowData.values(userEnteredValue,effectiveFormat.backgroundColor,textFormatRuns,hyperlink)"
    });
    const grid = resp && resp.sheets && resp.sheets[0] && resp.sheets[0].data && resp.sheets[0].data[0];
    if (!grid || !grid.rowData) return null;

    return grid.rowData.map(function (rowData) {
      const rowCells = rowData.values || [];
      return rowCells.map(function (cell) {
        const ev = cell.userEnteredValue || {};
        let value = "";
        if (ev.numberValue !== undefined) value = ev.numberValue;
        else if (ev.stringValue !== undefined) value = ev.stringValue;
        else if (ev.boolValue !== undefined) value = ev.boolValue;
        else if (ev.formulaValue !== undefined) value = ev.formulaValue;
        const bg = cell.effectiveFormat && cell.effectiveFormat.backgroundColor;
        return {
          value: value,
          runs: cell.textFormatRuns || [],
          bg: bg ? rgbToHex_(bg) : "#ffffff",
          hyperlink: cell.hyperlink || ""
        };
      });
    });
  } catch (err) {
    console.warn("Advanced Sheets read failed, falling back to classic API: " + err.message);
    return null;
  }
}

/** Converts a Sheets API {red,green,blue} (0..1 floats) to "#rrggbb". */
function rgbToHex_(c) {
  function to2(n) { return Math.round((n || 0) * 255).toString(16).padStart(2, "0"); }
  return "#" + to2(c.red) + to2(c.green) + to2(c.blue);
}

/** First hyperlink URL in a cell's runs ("" when plain text). */
function linkFromCell_(cell) {
  if (!cell) return "";
  if (cell.hyperlink) return String(cell.hyperlink);
  for (let i = 0; i < (cell.runs || []).length; i++) {
    const link = cell.runs[i].format && cell.runs[i].format.link;
    if (link && link.uri) return String(link.uri);
  }
  return "";
}

/** Concatenated display text of a cell's linked runs ("" when none). */
function linkTextFromCell_(cell) {
  if (!cell) return "";
  if (cell.hyperlink) return String(cell.value == null ? "" : cell.value);
  let out = "";
  for (let i = 0; i < (cell.runs || []).length; i++) {
    if (cell.runs[i].format && cell.runs[i].format.link) {
      out += String(cell.runs[i].text || "");
    }
  }
  return out;
}

/** Rebuilds the display HTML for a cell from its raw value + runs,
 *  mirroring richToHtml_ (links, colors, bold/italic/underline). */
function cellHtmlFromRuns_(cell) {
  const value = cell ? cell.value : "";
  const plain = String(value == null ? "" : value);
  const runs = (cell && cell.runs) || [];
  if (!runs.length) return linkifyText_(plain);
  let out = "";
  for (let i = 0; i < runs.length; i++) {
    const t = String(runs[i].text || "");
    if (t === "") continue;
    const fmt = runs[i].format || {};
    const tf = fmt.textFormat || {};
    const css = [];
    if (tf.foregroundColor) {
      css.push("color:" + rgbToHex_(tf.foregroundColor));
    }
    if (tf.bold) css.push("font-weight:700");
    if (tf.italic) css.push("font-style:italic");
    if (tf.underline) css.push("text-decoration:underline");
    let body = escHtml_(t);
    const url = (fmt.link && fmt.link.uri) || "";
    if (url) {
      const au = absUrl_(url);
      if (au) body = '<a href="' + escHtml_(au) + '" target="_blank" rel="noopener noreferrer" data-embed="1">' + body + '</a>';
    }
    out += css.length ? '<span style="' + css.join(";") + '">' + body + '</span>' : body;
  }
  return out || linkifyText_(plain);
}

/** Builds row specs from the advanced grid snapshot (same shape as the
 *  classic getSheetDataRows_ output: rowNumber, fields, linkUrls/linkTexts). */
function buildRowsFromAdvanced_(grid, sheet) {
  const headerRow = preferredHeaderRowInGrid_(grid);
  const startRow = headerRow > 0 ? headerRow + 1 : CONFIG.SHEET.START_ROW;
  const headerCells = grid[headerRow - 1] || [];
  const headerValues = headerCells.map(function (c) { return String(c.value || ""); });
  const fieldMap = buildFieldMap_(headerValues);
  const fieldIndexByKey = Object.keys(fieldMap).reduce(function (acc, key) {
    acc[fieldMap[key]] = key;
    return acc;
  }, {});

  const rows = [];
  for (let index = startRow; index <= grid.length; index++) {
    const cells = grid[index - 1] || [];
    const normalizedRow = cells.map(function (c) { return c.value; });
    const hasContent = normalizedRow.some(function (value) {
      return String(value || "").trim() !== "";
    });
    if (!hasContent) continue;

    const linkUrls = {};
    const linkTexts = {};
    const displayFields = [];
    headerValues.forEach(function (label, headerIndex) {
      const clean = String(label || "").trim();
      if (!clean) return;
      const cell = cells[headerIndex] || { value: "", runs: [], bg: "#ffffff" };
      const url = linkFromCell_(cell);
      const linkText = linkTextFromCell_(cell);
      if (url && fieldIndexByKey[headerIndex] !== undefined) {
        linkUrls[fieldIndexByKey[headerIndex]] = url;
        if (linkText) linkTexts[fieldIndexByKey[headerIndex]] = linkText;
      }
      displayFields.push({
        label: clean,
        value: cell.value,
        html: url ? cellHtmlFromRuns_(cell) : "",
        linkUrl: url
      });
    });

    rows.push({
      rowNumber: index,
      id: getFieldValue_(fieldMap, normalizedRow, "id", 0),
      sector: getFieldValue_(fieldMap, normalizedRow, "sector", 1),
      description: getFieldValue_(fieldMap, normalizedRow, "description", 2),
      entryDate: getFieldValue_(fieldMap, normalizedRow, "entryDate", 3),
      action: getFieldValue_(fieldMap, normalizedRow, "action", 4),
      responsibility: getFieldValue_(fieldMap, normalizedRow, "responsibility", 5),
      reviewDate: getFieldValue_(fieldMap, normalizedRow, "reviewDate", 6),
      displayFields: displayFields,
      linkUrls: linkUrls,
      linkTexts: linkTexts,
      reviewBg: cells[6] ? cells[6].bg : "#ffffff"
    });
  }
  return rows;
}

function getSheetDataRows_(sheet) {
  if (!sheet) {
    return [];
  }

  // Fast path: one Advanced Sheets call for values + rich-text runs + colors
  // (falls back to classic API when the advanced service is unavailable).
  const advanced = readGridDataAdvanced_(sheet);
  if (advanced) {
    const rows = buildRowsFromAdvanced_(advanced, sheet);
    if (rows && rows.length) return rows;
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let richValues = null;
  try { richValues = dataRange.getRichTextValues(); } catch (err) { richValues = null; }

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
    const fieldIndexByKey = Object.keys(fieldMap).reduce(function (acc, key) {
      acc[fieldMap[key]] = key;
      return acc;
    }, {});
    const linkUrls = {};
    const linkTexts = {};
    const displayFields = (headerValues || []).reduce(function (fields, header, headerIndex) {
      const label = String(header || "").trim();
      if (!label) {
        return fields;
      }

      const value = normalizedRow[headerIndex] !== undefined ? normalizedRow[headerIndex] : "";

      let html = "";
      let linkUrl = "";
      let linkText = "";
      const richValue = (richValues[rowNumber - 1] || [])[headerIndex];
      if (richValue) {
        try {
          html = richToHtml_(richValue, String(value === null || value === undefined ? "" : value));
        } catch (err) {
          html = "";
        }
        try {
          linkUrl = extractLinkUrl_(richValue);
        } catch (err2) {
          linkUrl = "";
        }
        try {
          linkText = extractLinkText_(richValue);
        } catch (err2b) {
          linkText = "";
        }
      }
      if (linkUrl && fieldIndexByKey[headerIndex] !== undefined) {
        linkUrls[fieldIndexByKey[headerIndex]] = linkUrl;
        if (linkText) linkTexts[fieldIndexByKey[headerIndex]] = linkText;
      }

      fields.push({
        label: label,
        value: value,
        html: html,
        linkUrl: linkUrl
      });

      return fields;
    }, []);

    rows.push({
      rowNumber: rowNumber,
      id: getFieldValue_(fieldMap, normalizedRow, "id", 0),
      sector: getFieldValue_(fieldMap, normalizedRow, "sector", 1),
      description: getFieldValue_(fieldMap, normalizedRow, "description", 2),
      entryDate: getFieldValue_(fieldMap, normalizedRow, "entryDate", 3),
      action: getFieldValue_(fieldMap, normalizedRow, "action", 4),
      responsibility: getFieldValue_(fieldMap, normalizedRow, "responsibility", 5),
      reviewDate: getFieldValue_(fieldMap, normalizedRow, "reviewDate", 6),
      displayFields: displayFields,
      linkUrls: linkUrls,
      linkTexts: linkTexts
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
function getPreferredSpreadsheetId_() {
  return SOURCE_SPREADSHEET_ID;
}
/**
 * Debug helper: returns the configured spreadsheet id and url.
 * @returns {{spreadsheetId: string, url: string}}
 */
/**
 * Debug helper: binds the active spreadsheet into script properties.
 * @returns {{success: boolean, spreadsheetId?: string, url?: string, message?: string}}
 */
let __spreadsheetCache__ = null;

function getSpreadsheet_() {
  if (__spreadsheetCache__) return __spreadsheetCache__;

  const spreadsheetId = getPreferredSpreadsheetId_();

  if (!spreadsheetId) {
    return null;
  }

  try {
    __spreadsheetCache__ = SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    __spreadsheetCache__ = null;
  }
  return __spreadsheetCache__;
}


/**
 * Run this function once in the Apps Script editor as the deploying user
 * to force the OAuth consent flow and pre-authorize the script's scopes.
 */
/**
 * Debug helper: resolves the bound spreadsheet and returns its id/url.
 * Run once from the Apps Script editor to force OAuth consent.
 * Calls MailApp.sendEmail (to the deploying user) so that the
 * script.send_mail scope declared in appsscript.json is actually exercised;
 * only an actual sendEmail call triggers Google's authorization prompt.
 * @returns {{success: boolean, spreadsheetId?: string, url?: string, message?: string}}
 */
function preauthorize() {
  try {
    const ss = getSpreadsheet_();
    let mailScopeReady = false;
    try {
      MailApp.sendEmail({
        to: Session.getEffectiveUser().getEmail(),
        subject: 'Dashboard OAuth authorization test',
        body: 'This confirms MailApp.sendEmail authorization is working for the dashboard script.'
      });
      mailScopeReady = true;
    } catch (e) {
      mailScopeReady = false;
    }
    return {
      success: !!ss,
      spreadsheetId: ss ? ss.getId() : "",
      url: ss ? ss.getUrl() : "",
      mailScopeReady: mailScopeReady
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  }
}

/**
 * Sends a plain-text email via MailApp. Never throws: returns false on
 * failure so callers can keep auditing/notifying regardless.
 * @param {string} to Recipient email.
 * @param {string} subject Email subject.
 * @param {string} body Plain-text body.
 * @returns {boolean} True if MailApp accepted the send.
 */
function sendMail_(to, subject, body) {
  to = primaryEmail_(to);
  if (!to || !isValidEmail_(to)) return false;
  if (!subject) return false;
  try {
    MailApp.sendEmail({
      to: to,
      subject: String(subject),
      body: String(body || '')
    });
    return true;
  } catch (err) {
    return false;
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

/* ============================================================
 * Lock Helpers
 * ============================================================ */

function runWithLock_(callback) {

  const lock = LockService.getScriptLock();

  lock.waitLock(CONFIG.LOCK.WAIT_TIME);

  try {

    return callback();

  } finally {

    lock.releaseLock();

  }

}


/* ============================================================
 * Property Helpers
 * ============================================================ */

/* ============================================================
 * Read Cache Helpers
 *
 * Chunked CacheService storage for the getData() payload so that
 * repeated reads (page loads, refreshes, PDF/summary builders) do
 * not re-read the sheet / rich text / backgrounds every time.
 * Every write path calls invalidateDataCache_() after mutating the
 * data sheet; all helpers are no-ops or safe fallsbacks when the
 * cache is disabled or quota-limited.
 * ============================================================ */

const __DATA_CACHE_PREFIX__ = "dashv1:data:v1:";

/* A generation number stored in Script Properties. Bumped only on structural
 * changes (add/delete/renumber) which shift every ID — any cached payload is
 * unrecoverable. Cache keys embed the generation, so bumping it instantly
 * orphans every old slice without a removeAll() loop. Content edits use the
 * surgical patchCachedDataRow_() instead, which rewrites just one record. */
const __DATA_GEN_PROP__ = "dashv1:dataGen";

function dataGeneration_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const g = parseInt(props.getProperty(__DATA_GEN_PROP__) || "1", 10);
    return isFinite(g) && g > 0 ? g : 1;
  } catch (err) { return 1; }
}

function bumpDataGeneration_() {
  try {
    PropertiesService.getScriptProperties().setProperty(__DATA_GEN_PROP__, String(dataGeneration_() + 1));
  } catch (err) {}
}

const __DATA_CACHE_CHUNK_SIZE__ = 90000;

const __DATA_CACHE_MAX_CHUNKS__ = 20;

function __dataCacheBaseKey_() {
  return __DATA_CACHE_PREFIX__ + dataGeneration_() + ":" + today_();
}

function __dataCacheChunkKey_(base, index) {
  return base + ":c" + index;
}

function __dataCacheIndexKey_(base) {
  return base + ":n";
}

function getCachedData_() {
  if (!CONFIG.CACHE.ENABLED) return null;

  try {
    const cache = CacheService.getScriptCache();
    const base = __dataCacheBaseKey_();
    const index = cache.get(__dataCacheIndexKey_(base));

    if (!index) return null;

    const count = parseInt(index, 10);
    if (!isFinite(count) || count < 1 || count > __DATA_CACHE_MAX_CHUNKS__) {
      return null;
    }

    const chunkKeys = [];
    for (let i = 0; i < count; i++) {
      chunkKeys.push(__dataCacheChunkKey_(base, i));
    }

    const chunks = cache.getAll(chunkKeys) || {};
    let json = "";

    for (let i = 0; i < count; i++) {
      const chunk = chunks[__dataCacheChunkKey_(base, i)];
      if (chunk === undefined || chunk === null) return null;
      json += chunk;
    }

    if (!json) return null;
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function putCachedData_(payload) {
  if (!CONFIG.CACHE.ENABLED) return;

  try {
    const cache = CacheService.getScriptCache();
    const base = __dataCacheBaseKey_();
    const json = JSON.stringify(payload);

    if (!json) return;

    const chunks = [];
    for (let i = 0; i < json.length; i += __DATA_CACHE_CHUNK_SIZE__) {
      chunks.push(json.substring(i, i + __DATA_CACHE_CHUNK_SIZE__));
      if (chunks.length > __DATA_CACHE_MAX_CHUNKS__) {
        cache.remove(__dataCacheIndexKey_(base));
        return;
      }
    }

    const keyed = {};
    chunks.forEach(function (chunk, index) {
      keyed[__dataCacheChunkKey_(base, index)] = chunk;
    });

    cache.putAll(keyed, Math.max(1, CONFIG.CACHE.TTL));
    cache.put(__dataCacheIndexKey_(base), String(chunks.length), Math.max(1, CONFIG.CACHE.TTL));
  } catch (err) {
    invalidateDataCache_();
  }
}

function invalidateDataCache_() {
  if (!CONFIG.CACHE.ENABLED) return;

  try {
    const cache = CacheService.getScriptCache();
    const base = __dataCacheBaseKey_();
    const index = cache.get(__dataCacheIndexKey_(base));
    const count = index ? parseInt(index, 10) : 0;

    const keys = [];
    if (isFinite(count) && count > 0 && count <= __DATA_CACHE_MAX_CHUNKS__) {
      for (let i = 0; i < count; i++) {
        keys.push(__dataCacheChunkKey_(base, i));
      }
    } else {
      for (let i = 0; i < __DATA_CACHE_MAX_CHUNKS__; i++) {
        keys.push(__dataCacheChunkKey_(base, i));
      }
    }

    keys.push(__dataCacheIndexKey_(base));
    cache.removeAll(keys);
  } catch (err) {
    // ignore
  }
}

/**
 * Builds a full display row spec for a single physical row, mirroring the
 * classic getSheetDataRows_ logic (rich text HTML + linkUrls/linkTexts) so a
 * surgical cache patch does not strip hyperlinks or rich-text formatting.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The dashboard sheet.
 * @param {number} row Physical row number.
 * @returns {Object|null} A row spec, or null when the row is empty/invalid.
 */
function buildRowSpecForRow_(sheet, row) {
  if (!sheet || !row) return null;
  try {
    const headerRow = getPreferredHeaderRow_(sheet);
    const startRow = headerRow > 0 ? headerRow + 1 : 1;
    const headerValues = getHeaderValues_(sheet);
    const fieldMap = headerValues.length ? buildFieldMap_(headerValues) : {};
    const fieldIndexByKey = Object.keys(fieldMap).reduce(function (acc, key) {
      acc[fieldMap[key]] = key;
      return acc;
    }, {});

    const range = sheet.getRange(row, 1, 1, CONFIG.SHEET.NUM_COLS);
    const values = range.getValues()[0];
    let richRow = null;
    try { richRow = range.getRichTextValues()[0]; } catch (err) { richRow = null; }

    const normalizedRow = (values || []).slice(0, CONFIG.SHEET.NUM_COLS);
    if (!normalizedRow.some(function (v) { return String(v || "").trim() !== ""; })) return null;

    const linkUrls = {};
    const linkTexts = {};
    const displayFields = (headerValues || []).reduce(function (fields, header, headerIndex) {
      const label = String(header || "").trim();
      if (!label) return fields;
      const value = normalizedRow[headerIndex] !== undefined ? normalizedRow[headerIndex] : "";
      let html = "";
      let linkUrl = "";
      let linkText = "";
      const richValue = richRow ? richRow[headerIndex] : null;
      if (richValue) {
        try { html = richToHtml_(richValue, String(value === null || value === undefined ? "" : value)); } catch (err) { html = ""; }
        try { linkUrl = extractLinkUrl_(richValue); } catch (err2) { linkUrl = ""; }
        try { linkText = extractLinkText_(richValue); } catch (err2b) { linkText = ""; }
      }
      if (linkUrl && fieldIndexByKey[headerIndex] !== undefined) {
        linkUrls[fieldIndexByKey[headerIndex]] = linkUrl;
        if (linkText) linkTexts[fieldIndexByKey[headerIndex]] = linkText;
      }
      fields.push({ label: label, value: value, html: html, linkUrl: linkUrl });
      return fields;
    }, []);

    return {
      rowNumber: row,
      id: getFieldValue_(fieldMap, normalizedRow, "id", 0),
      sector: getFieldValue_(fieldMap, normalizedRow, "sector", 1),
      description: getFieldValue_(fieldMap, normalizedRow, "description", 2),
      entryDate: getFieldValue_(fieldMap, normalizedRow, "entryDate", 3),
      action: getFieldValue_(fieldMap, normalizedRow, "action", 4),
      responsibility: getFieldValue_(fieldMap, normalizedRow, "responsibility", 5),
      reviewDate: getFieldValue_(fieldMap, normalizedRow, "reviewDate", 6),
      displayFields: displayFields,
      linkUrls: linkUrls,
      linkTexts: linkTexts
    };
  } catch (err) {
    return null;
  }
}

/**
 * Surgically refreshes exactly one record inside the cached getData() payload.
 * Reads ONE sheet row, rebuilds ONE item, splices it into the cached items
 * array, then re-chunks + re-puts the cache. The other N-1 records are never
 * re-read from the sheet — a single update becomes O(1 row) instead of a full
 * sheet read + rebuild. Falls back to a full invalidate if anything fails.
 * @param {number} row The physical sheet row to refresh.
 */
function patchCachedDataRow_(row) {
  if (!CONFIG.CACHE.ENABLED) return;

  const cached = getCachedData_();
  if (!cached || !cached.items) return;

  try {
    const sheet = getSheet_();
    const rowSpec = buildRowSpecForRow_(sheet, row);
    if (!rowSpec) { invalidateDataCache_(); return; }

    const built = DashboardService.buildItems([rowSpec], sheet);
    const item = built && built[0];
    if (!item) { invalidateDataCache_(); return; }

    let replaced = false;
    cached.items = (cached.items || []).map(function (it) {
      if (Number(it.row) === Number(row)) { replaced = true; return item; }
      return it;
    });
    if (!replaced) cached.items.push(item);

    // Derived scoped payloads recompute in memory from the patched array.
    if (cached.summary) cached.summary = buildSummaryFromItems(cached.items || []);
    if (cached.analytics) cached.analytics = buildAnalytics_(cached.items || []);

    putCachedData_(cached);
  } catch (err) {
    invalidateDataCache_();
  }
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

/* Parses a display date string ("dd.MM.yyyy") or Date into a Date.
   Returns null when unparseable. */
function parseDisplayDate_(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return isNaN(value.getTime()) ? null : value;
  }
  const m = String(value).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

/* Whole days from today (script timezone) to the given display date.
   Returns 1 for tomorrow, 0 for today, -1 for yesterday, null when unparseable. */
function daysUntilDate_(value) {
  const d = parseDisplayDate_(value);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target - today) / 86400000);
}

/* Adds whole days to a Date, preserving the time-of-day components. */
function addDays_(date, days) {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

function now_() {

  return new Date();

}


/* ============================================================
 * Color Helpers
 * ============================================================ */
/* ============================================================
 * Validation Helpers
 * ============================================================ */
/* ============================================================
 * Response Helpers
 * ============================================================ */

/* ============================================================
 * Logging
 * ============================================================ */

/* ============================================================
 * ID Generator
 * ============================================================ */

/* ============================================================
 * JSON Helpers
 * ============================================================ */