/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Reports.gs
 * ============================================================
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

function getDashboardSummary() {
  return buildSummaryFromItems((getData().items) || []);
}

function buildSectorReportFromSummary(summary) {
  const sectors = (summary && summary.sectors) || {};
  return Object.keys(sectors).sort().map(key => ({ sector: key, total: sectors[key] }));
}

function getSectorReport() {
  return buildSectorReportFromSummary(getDashboardSummary());
}

function buildFlaggedItemsFromItems(items) {
  return (items || []).filter(item => item.flagged);
}

function getFlaggedItemsReport() {
  return buildFlaggedItemsFromItems((getData().items) || []);
}

function buildMonthlyTrendFromItems(items) {
  const trend = {};
  (items || []).forEach(function (item) {
    if (!item || !item.entryDate) return;
    const key = String(item.entryDate).slice(0, 7);
    trend[key] = (trend[key] || 0) + 1;
  });
  return trend;
}

function getMonthlyTrend() {
  return buildMonthlyTrendFromItems((getData().items) || []);
}

function getPrintableReport() {
  const data = getData();
  return {
    title: getTitle_(),
    generatedOn: new Date(),
    summary: getDashboardSummary(),
    items: data.items || []
  };
}

function exportToSpreadsheet(token) {
  requireLogin_(token);
  const report = getPrintableReport();
  const ss = SpreadsheetApp.create('India Post Dashboard Report ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  try {
    const sheet = ss.getSheets()[0];
    sheet.setName('Report');
    sheet.appendRow(['ID', 'Sector', 'Description', 'Entry Date', 'Action', 'Responsibility', 'Review Date', 'Flagged']);
    report.items.forEach(row => {
      sheet.appendRow([row.id, row.sector, row.description, row.entryDate, row.action, row.responsibility, row.reviewDate, row.flagged ? 'YES' : 'NO']);
    });

    const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    let blob = null;

    // Preferred: Google Drive REST export endpoint. This is the only path that
    // reliably produces a real .xlsx from a Google Sheets file.
    try {
      const exportUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(ss.getId()) + '/export?mimeType=' + encodeURIComponent(xlsxMime);
      const response = UrlFetchApp.fetch(exportUrl, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        blob = Utilities.newBlob(response.getContent(), xlsxMime, 'report.xlsx');
      } else {
        console.log('Drive export failed: ' + response.getResponseCode() + ' ' + response.getContentText());
      }
    } catch (err) {
      console.log('Drive export error: ' + (err && err.message ? err.message : err));
      blob = null;
    }

    if (!blob) {
      try { blob = DriveApp.getFileById(ss.getId()).getAs(xlsxMime); } catch (err) { blob = null; }
    }
    if (!blob) {
      try { blob = ss.getAs(xlsxMime); } catch (err) { blob = null; }
    }
    if (!blob) throw new Error('Could not convert the report to Excel format.');

    const filename = 'IndiaPostDashboard_Report_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm') + '.xlsx';
    blob.setName(filename);
    return { filename: filename, base64: Utilities.base64Encode(blob.getBytes()) };
  } finally {
    try { DriveApp.getFileById(ss.getId()).setTrashed(true); } catch (err) {}
  }
}

function createPdfReport(token) {
  requireLogin_(token);
  const template = HtmlService.createTemplateFromFile('ReportPdf');
  template.data = getPrintableReport();
  const html = template.evaluate().getContent();
  const blob = Utilities.newBlob(html, 'text/html', 'report.html');
  const pdf = blob.getAs('application/pdf').setName('IndiaPostDashboard_Report_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm') + '.pdf');
  return { filename: pdf.getName(), base64: Utilities.base64Encode(pdf.getBytes()) };
}
