/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Analytics.gs
 * Analytics builder: trends, breakdowns, and summary enrichments.
 * ============================================================
 */

function buildAnalytics_(items) {
  if (!Array.isArray(items) || !items.length) {
    return {
      total: 0,
      flagged: 0,
      normal: 0,
      sectors: [],
      offices: [],
      flaggedItems: [],
      trend: [],
      trendPrev: []
    };
  }

  const total = items.length;
  const flagged = items.filter(function (i) { return i.reviewStatus === 'due'; }).length;
  const normal = total - flagged;

  const sectorMap = {};
  const officeMap = {};
  const flaggedItems = [];
  const monthMap = {};
  const prevMonthMap = {};

  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');

  items.forEach(function (item) {
    const sector = String(item.sector || 'Unknown').trim();
    sectorMap[sector] = (sectorMap[sector] || 0) + 1;

    const office = String(item.responsibility || 'Unknown').trim();
    officeMap[office] = (officeMap[office] || 0) + 1;

    if (item.reviewStatus === 'due') {
      flaggedItems.push({
        id: item.id,
        sector: item.sector,
        reviewDate: item.reviewDate,
        row: item.row
      });
    }

    const entryDate = item.entryDate || '';
    if (entryDate && entryDate.length >= 7) {
      const monthKey = entryDate.substring(3, 10);
      monthMap[monthKey] = (monthMap[monthKey] || 0) + 1;
      if (monthKey === prevMonth) prevMonthMap[prevMonth] = (prevMonthMap[prevMonth] || 0) + 1;
    }
  });

  const sectors = Object.keys(sectorMap).sort().map(function (key) {
    return { sector: key, total: sectorMap[key] };
  });

  const offices = Object.keys(officeMap).sort().map(function (key) {
    return { office: key, total: officeMap[key] };
  });

  const trend = Object.keys(monthMap).sort().slice(-12).map(function (key) {
    return { key: key, value: monthMap[key] };
  });

  const trendPrev = Object.keys(prevMonthMap).sort().map(function (key) {
    return { key: key, value: prevMonthMap[key] };
  });

  return {
    total: total,
    flagged: flagged,
    normal: normal,
    sectors: sectors,
    offices: offices,
    flaggedItems: flaggedItems.slice(0, 100),
    trend: trend,
    trendPrev: trendPrev
  };
}