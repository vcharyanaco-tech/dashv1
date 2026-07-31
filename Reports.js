
/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Reports.gs
 * ============================================================
 */

/* Summary counts */
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
    const s = i.sector || "Unspecified";
    summary.sectors[s] = (summary.sectors[s] || 0) + 1;
  });

  return summary;
}

/* Sector report */
function getSectorReport() {
  const s = getDashboardSummary().sectors;
  return Object.keys(s).sort().map(k => ({
    sector: k,
    total: s[k]
  }));
}

/* Review due report */
function getFlaggedItemsReport() {
  return (getData().items || []).filter(r => r.flagged);
}

/* Printable report payload */
function getPrintableReport() {
  return {
    generatedOn: new Date(),
    title: getTitle_(),
    summary: getDashboardSummary(),
    items: getData().items || []
  };
}

/* Export data to a new spreadsheet */
function exportToSpreadsheet() {
  const report = getPrintableReport();
  const ss = SpreadsheetApp.create("Dashboard Report " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
  const sh = ss.getSheets()[0];
  sh.setName("Report");
  sh.appendRow(["ID","Sector","Description","Entry Date","Action","Responsibility","Review Date","Flagged"]);
  report.items.forEach(r=>{
    sh.appendRow([r.id,r.sector,r.description,r.entryDate,r.action,r.responsibility,r.reviewDate,r.flagged?"YES":"NO"]);
  });
  return {url:ss.getUrl(),id:ss.getId()};
}

/* Monthly counts by entry month */
function getMonthlyTrend() {
  const trend = {};
  (getData().items||[]).forEach(r=>{
    if(!r.entryDate) return;
    const key = String(r.entryDate).substring(0,7);
    trend[key]=(trend[key]||0)+1;
  });
  return trend;
}
