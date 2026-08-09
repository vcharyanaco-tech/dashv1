/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * DashboardService.gs
 * Dashboard read/transform service (presentation layer)
 * ============================================================
 */

/**
 * A review-date cell is "flagged" (review due) when its background is any
 * non-white, non-empty colour.
 * @param {string} background Background hex colour.
 * @returns {boolean}
 */
function isFlaggedBackground_(background) {
  if (!background) return false;
  const colour = String(background).toLowerCase();
  return colour !== "#ffffff" && colour !== "";
}

/**
 * A review-date cell is "done" when its background reads as green
 * (green channel dominant and clearly above red and blue).
 * @param {string} background Background hex colour.
 * @returns {boolean}
 */
function isReviewDoneBackground_(background) {
  if (!background) return false;
  const hex = String(background).replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return g >= 150 && g > r + 20 && g > b + 20;
}

/**
 * Maps row numbers to review status: 'done' | 'due' | ''.
 * Rows without a rowNumber (e.g. audit-derived fallback rows) are skipped.
 * A row is 'due' when its review-date cell is flagged by background colour OR
 * when its review date is tomorrow, today or already past (and not done).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The dashboard sheet.
 * @param {Object[]} rows Row specs from getSheetDataRows_.
 * @returns {Object} { rowNumber: status }
 */
function getReviewStatuses_(sheet, rows) {
  const out = {};

  if (!sheet || !rows || !rows.length) {
    return out;
  }

  let start = Infinity;
  let end = -Infinity;

  rows.forEach(function (rowSpec) {
    if (rowSpec && rowSpec.rowNumber) {
      start = Math.min(start, rowSpec.rowNumber);
      end = Math.max(end, rowSpec.rowNumber);
    }
  });

  if (start === Infinity || end < start) {
    return out;
  }

  // Fast path: when the row specs already carry reviewBg (supplied by the
  // Advanced Sheets read path), avoid a second background round-trip.
  if (rows.every(function (rs) { return rs && rs.reviewBg !== undefined; })) {
    rows.forEach(function (rowSpec) {
      if (!rowSpec || !rowSpec.rowNumber) return;
      const background = rowSpec.reviewBg;
      let status = isReviewDoneBackground_(background)
        ? "done"
        : (isFlaggedBackground_(background) ? "due" : "");
      if (status !== "done" && rowSpec.reviewDate) {
        const days = daysUntilDate_(rowSpec.reviewDate);
        if (days !== null && days <= 1) status = "due";
      }
      out[String(rowSpec.rowNumber)] = status;
    });
    return out;
  }

  try {
    const colors = sheet
      .getRange(start, COL.REVIEW_DATE, end - start + 1, 1)
      .getBackgrounds();

    rows.forEach(function (rowSpec) {
      if (rowSpec && rowSpec.rowNumber) {
        const background = colors[rowSpec.rowNumber - start][0];
        let status = isReviewDoneBackground_(background)
          ? "done"
          : (isFlaggedBackground_(background) ? "due" : "");
        if (status !== "done" && rowSpec.reviewDate) {
          const days = daysUntilDate_(rowSpec.reviewDate);
          if (days !== null && days <= 1) status = "due";
        }
        out[String(rowSpec.rowNumber)] = status;
      }
    });
  } catch (err) {}

  return out;
}

/**
 * Transforms raw sheet rows into display-ready items (formatted dates,
 * linkified/rich-text action HTML, review status flags).
 * @param {Object[]} rows Row specs from getSheetDataRows_.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The dashboard sheet.
 * @returns {Object[]} Display-ready items.
 */
function buildDashboardItems_(rows, sheet) {
  const statuses = getReviewStatuses_(sheet, rows);

  return rows.map(function (rowSpec) {
    let actionHtml = escHtml_(rowSpec.action);

    const reviewStatus = statuses[String(rowSpec.rowNumber)] || "";
    const flagged = reviewStatus === "due";

    const displayFields = (rowSpec.displayFields || []).map(function (field) {
      const label = String(field && field.label ? field.label : "").trim();
      const value = field && field.value !== undefined ? field.value : "";
      const normalizedLabel = label.toLowerCase();
      let formattedValue = value;

      if (normalizedLabel.indexOf("date") !== -1 && value !== "") {
        formattedValue = formatDate_(value);
      }

      let fieldHtml = "";
      if (normalizedLabel.indexOf("date") === -1) {
        if (field && field.html) {
          fieldHtml = field.html;
        } else if (looksLikeUrl_(formattedValue)) {
          fieldHtml = linkifyText_(formattedValue);
        }
      }

      if (normalizedLabel.indexOf("action") !== -1 && fieldHtml) {
        actionHtml = fieldHtml;
      }

      return {
        label: label,
        value: formattedValue,
        html: fieldHtml
      };
    });

    return {
      row: rowSpec.rowNumber,
      id: rowSpec.id,
      sector: rowSpec.sector,
      description: rowSpec.description,
      entryDate: formatDate_(rowSpec.entryDate),
      action: rowSpec.action,
      actionHtml: actionHtml,
      responsibility: rowSpec.responsibility,
      reviewDate: formatDate_(rowSpec.reviewDate),
      flagged: flagged,
      reviewStatus: reviewStatus,
      displayFields: displayFields,
      linkUrls: rowSpec.linkUrls || {},
      linkTexts: rowSpec.linkTexts || {}
    };
  });
}

const DashboardService = Object.freeze({
  buildItems: buildDashboardItems_,
  getReviewStatuses: getReviewStatuses_,
  isFlaggedBackground: isFlaggedBackground_,
  isReviewDoneBackground: isReviewDoneBackground_
});
