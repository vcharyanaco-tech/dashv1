/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Reports.gs
 * ============================================================
 */

/**
 * Computes totals/flagged/normal counts and a per-sector breakdown.
 * @param {Object[]} items Display-ready record items.
 * @returns {{total: number, flagged: number, normal: number, sectors: Object}}
 */
function buildSummaryFromItems(items) {
  items = items || [];
  const summary = {
    total: items.length,
    flagged: items.filter(i => i.flagged).length,
    normal: items.filter(i => !i.flagged).length,
    sectors: {}
  };
  items.forEach(i => {
    const sector = i.sector || 'Unspecified';
    summary.sectors[sector] = (summary.sectors[sector] || 0) + 1;
  });
  return summary;
}

/**
 * Returns the aggregate dashboard summary.
 * @returns {Object} buildSummaryFromItems(getData().items).
 */
function getDashboardSummary() {
  return buildSummaryFromItems((getData().items) || []);
}

/**
 * Builds a sorted per-sector report from a summary object.
 * @param {Object} summary Result of buildSummaryFromItems.
 * @returns {Object[]} [{ sector, total }]
 */
function buildSectorReportFromSummary(summary) {
  const sectors = (summary && summary.sectors) || {};
  return Object.keys(sectors).sort().map(key => ({ sector: key, total: sectors[key] }));
}

/**
 * Returns the per-sector report sorted alphabetically.
 * @returns {Object[]} [{ sector, total }]
 */
/**
 * Filters items to the flagged (review-due) ones.
 * @param {Object[]} items Display-ready record items.
 * @returns {Object[]} Flagged items.
 */
function buildFlaggedItemsFromItems(items) {
  return (items || []).filter(item => item.flagged);
}

/**
 * Returns only the flagged (review-due) items.
 * @returns {Object[]} Flagged items.
 */
/**
 * Builds a { yyyy-MM: count } trend from item entry dates.
 * @param {Object[]} items Display-ready record items.
 * @returns {Object} Month -> count map.
 */
function buildMonthlyTrendFromItems(items) {
  const trend = {};
  (items || []).forEach(function (item) {
    if (!item || !item.entryDate) return;
    const key = String(item.entryDate).slice(0, 7);
    trend[key] = (trend[key] || 0) + 1;
  });
  return trend;
}

/**
 * Returns the monthly entry-count trend.
 * @returns {Object} Month -> count map.
 */
/**
 * Builds the printable report payload (title, timestamp, summary, items).
 * @returns {{title: string, generatedOn: Date, summary: Object, items: Object[]}}
 */
function getPrintableReport() {
  const data = getData();
  return {
    title: getTitle_(),
    generatedOn: new Date(),
    summary: getDashboardSummary(),
    items: data.items || []
  };
}

/**
 * Exports the dashboard report as an .xlsx and returns it as base64.
 * Uses Drive REST, DriveApp, spreadsheet blob, then an in-memory fallback.
 * @param {string} token Session token (login required).
 * @returns {{filename: string, base64: string}}
 */
function exportToSpreadsheet(token) {
  requireLogin_(token);
  const report = getPrintableReport();
  const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const ss = SpreadsheetApp.create('India Post Dashboard Report ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  try {
    const sheet = ss.getSheets()[0];
    sheet.setName('Report');
    sheet.appendRow(['ID', 'Sector', 'Description', 'Entry Date', 'Action', 'Responsibility', 'Review Date', 'Flagged']);
    report.items.forEach(row => {
      sheet.appendRow([row.id, row.sector, row.description, row.entryDate, row.action, row.responsibility, row.reviewDate, row.flagged ? 'YES' : 'NO']);
    });
    SpreadsheetApp.flush();

    let blob = null;

    // Fast path 1: Google Drive REST export endpoint (works when the script
    // has a Drive scope; otherwise this returns non-200 and we fall through).
    try {
      const exportUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(ss.getId()) + '/export?mimeType=' + encodeURIComponent(xlsxMime);
      const response = UrlFetchApp.fetch(exportUrl, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        blob = Utilities.newBlob(response.getContent(), xlsxMime, 'report.xlsx');
      }
    } catch (err) {
      blob = null;
    }

    // Fast path 2: DriveApp File conversion (drive.file scope).
    if (!blob) {
      try { blob = DriveApp.getFileById(ss.getId()).getAs(xlsxMime); } catch (err) { blob = null; }
    }

    // Fast path 3: spreadsheet blob conversion (spreadsheets scope only).
    if (!blob) {
      try { blob = ss.getBlob().getAs(xlsxMime); } catch (err) { blob = null; }
    }

    // Guaranteed fallback: build a valid .xlsx entirely in memory. This uses
    // only Utilities (no Drive scope), so it always succeeds.
    if (!blob) {
      try { blob = buildXlsxFromItems_(report.items); } catch (err) { blob = null; }
    }

    if (!blob) throw new Error('Could not convert the report to Excel format.');

    const filename = 'IndiaPostDashboard_Report_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm') + '.xlsx';
    blob.setName(filename);
    return { filename: filename, base64: Utilities.base64Encode(blob.getBytes()) };
  } finally {
    try { DriveApp.getFileById(ss.getId()).setTrashed(true); } catch (err) {}
  }
}

function xlsxColLetter_(index) {
  let letters = '';
  while (index > 0) {
    const rem = (index - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    index = Math.floor((index - 1) / 26);
  }
  return letters;
}

function xlsxEscape_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function buildXlsxFromItems_(items) {
  const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const headers = ['ID', 'Sector', 'Description', 'Entry Date', 'Action', 'Responsibility', 'Review Date', 'Flagged'];
  const rows = [headers].concat((items || []).map(function (row) {
    return [
      row.id, row.sector, row.description, row.entryDate,
      row.action, row.responsibility, row.reviewDate,
      row.flagged ? 'YES' : 'NO'
    ];
  }));

  let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach(function (row, rIdx) {
    const rowNum = rIdx + 1;
    sheetXml += '<row r="' + rowNum + '">';
    row.forEach(function (value, cIdx) {
      sheetXml += '<c r="' + xlsxColLetter_(cIdx + 1) + rowNum + '" t="inlineStr"><is><t xml:space="preserve">' + xlsxEscape_(value) + '</t></is></c>';
    });
    sheetXml += '</row>';
  });
  sheetXml += '</sheetData></worksheet>';

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>';

  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const coreProps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:creator>India Post Dashboard</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created>' +
    '</cp:coreProperties>';

  const appProps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>India Post Dashboard</Application>' +
    '</Properties>';

  const parts = [
    Utilities.newBlob(contentTypes, 'application/xml', '[Content_Types].xml'),
    Utilities.newBlob(rootRels, 'application/xml', '_rels/.rels'),
    Utilities.newBlob(workbookXml, 'application/xml', 'xl/workbook.xml'),
    Utilities.newBlob(workbookRels, 'application/xml', 'xl/_rels/workbook.xml.rels'),
    Utilities.newBlob(sheetXml, 'application/xml', 'xl/worksheets/sheet1.xml'),
    Utilities.newBlob(stylesXml, 'application/xml', 'xl/styles.xml'),
    Utilities.newBlob(coreProps, 'application/xml', 'docProps/core.xml'),
    Utilities.newBlob(appProps, 'application/xml', 'docProps/app.xml')
  ];

  return Utilities.zip(parts, 'report.xlsx').setContentType(xlsxMime);
}

/**
 * Renders the printable report to PDF and returns it as base64.
 * @param {string} token Session token (login required).
 * @returns {{filename: string, base64: string}}
 */
function createPdfReport(token) {
  requireLogin_(token);
  const template = HtmlService.createTemplateFromFile('ReportPdf');
  template.data = getPrintableReport();
  const html = template.evaluate().getContent();
  const blob = Utilities.newBlob(html, 'text/html', 'report.html');
  const pdf = blob.getAs('application/pdf').setName('IndiaPostDashboard_Report_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm') + '.pdf');
  return { filename: pdf.getName(), base64: Utilities.base64Encode(pdf.getBytes()) };
}

const REPORT_TEMPLATES = Object.freeze({
  SUMMARY: { key: 'summary', label: 'Summary', description: 'Total, flagged, normal counts and sector breakdown' },
  DETAILED: { key: 'detailed', label: 'Detailed', description: 'All record fields with review status' },
  FLAGGED: { key: 'flagged', label: 'Flagged only', description: 'Only records with review due' }
});

function getReportTemplates() {
  return Object.keys(REPORT_TEMPLATES).map(function (key) {
    const t = REPORT_TEMPLATES[key];
    return { key: t.key, label: t.label, description: t.description };
  });
}

function getReportData(token, templateKey) {
  requireLogin_(token);
  const data = getData();
  const items = data.items || [];
  const key = String(templateKey || 'summary').toLowerCase();
  let filtered = items;
  if (key === 'flagged') filtered = items.filter(function (i) { return i.flagged; });
  const summary = buildSummaryFromItems(filtered);
  return {
    title: getTitle_(),
    generatedOn: new Date(),
    template: key,
    summary: summary,
    items: filtered
  };
}

/**
 * Emails the dashboard report as a PDF attachment.
 * Uses MailApp, which requires the `script.send_mail` OAuth scope.
 * @param {string} token Session token (login required).
 * @param {string} recipient Recipient email address.
 * @param {string} templateKey Optional report template (summary|detailed|flagged).
 * @returns {{success: boolean, sentTo: string, template: string}}
 */
function emailReport(token, recipient, templateKey) {
  requireLogin_(token);
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    throw new Error('A valid recipient email is required.');
  }
  const key = String(templateKey || 'summary').toLowerCase();
  const report = getReportData(token, key);
  const pdf = createPdfReport(token);
  const templateLabel = (REPORT_TEMPLATES[key.toUpperCase()] || REPORT_TEMPLATES.SUMMARY).label;
  const subject = report.title + ' — ' + templateLabel + ' report';
  const body = 'Please find attached the ' + templateLabel + ' report generated on ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm') + '.\n\n' +
    'Summary: ' + report.summary.total + ' total, ' + report.summary.flagged + ' flagged, ' +
    report.summary.normal + ' normal.';
  const pdfBlob = Utilities.newBlob(Utilities.base64Decode(pdf.base64), 'application/pdf', pdf.filename);
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: body,
    attachments: [pdfBlob]
  });
  return { success: true, sentTo: recipient, template: key };
}
