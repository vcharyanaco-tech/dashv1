/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Reports.gs
 * ============================================================
 */

function getDashboardSummary() {
  const data = getData();
  const items = data.items || [];
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

function getSectorReport() {
  const sectors = getDashboardSummary().sectors;
  return Object.keys(sectors).sort().map(key => ({ sector: key, total: sectors[key] }));
}

function getFlaggedItemsReport() {
  return (getData().items || []).filter(item => item.flagged);
}

function getMonthlyTrend() {
  const trend = {};
  (getData().items || []).forEach(function (item) {
    if (!item || !item.entryDate) return;
    const key = String(item.entryDate).slice(0, 7);
    trend[key] = (trend[key] || 0) + 1;
  });
  return trend;
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

function exportToSpreadsheet() {
  requireViewer();
  const report = getPrintableReport();
  const ss = SpreadsheetApp.create('India Post Dashboard Report ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  const sheet = ss.getSheets()[0];
  sheet.setName('Report');
  sheet.appendRow(['ID', 'Sector', 'Description', 'Entry Date', 'Action', 'Responsibility', 'Review Date', 'Flagged']);
  report.items.forEach(row => {
    sheet.appendRow([row.id, row.sector, row.description, row.entryDate, row.action, row.responsibility, row.reviewDate, row.flagged ? 'YES' : 'NO']);
  });
  return { url: ss.getUrl(), id: ss.getId() };
}

function createPdfReport() {
  requireViewer();
  const template = HtmlService.createTemplateFromFile('ReportPdf');
  template.data = getPrintableReport();
  const html = template.evaluate().getContent();
  const blob = Utilities.newBlob(html, 'text/html', 'report.html');
  const pdf = blob.getAs('application/pdf').setName('IndiaPostDashboard_Report_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm') + '.pdf');
  const file = DriveApp.createFile(pdf);
  return { url: file.getUrl(), id: file.getId() };
}
