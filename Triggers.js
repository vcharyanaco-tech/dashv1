/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Triggers.gs
 * ============================================================
 */


/* ============================================================
 * Create All Triggers
 * ============================================================
 */

/**
 * Installs the daily title-stamp and review-reminder triggers (idempotent:
 * removes first).
 */
function installTriggers() {

  removeTriggers();

  ScriptApp.newTrigger("dailyDateUpdate")
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();

  ScriptApp.newTrigger("sendReviewReminders")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

}


/* ============================================================
 * Remove Existing Triggers
 * ============================================================
 */

/**
 * Removes all dailyDateUpdate and sendReviewReminders triggers.
 */
function removeTriggers() {

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === "dailyDateUpdate" || handler === "sendReviewReminders") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

}


/* ============================================================
 * Reinstall
 * ============================================================
 */

/**
 * Removes and re-creates the daily triggers.
 */
function reinstallTriggers() {

  removeTriggers();

  installTriggers();

}


/* ============================================================
 * List Triggers
 * ============================================================
 */

/**
 * Logs all project triggers to the Apps Script console (diagnostic).
 */
function listTriggers() {

  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger){

    Logger.log(
      trigger.getHandlerFunction()
    );

  });

}


/* ============================================================
 * First Time Setup
 * ============================================================
 */

/**
 * One-time setup: installs triggers, stamps the title, and seeds the
 * bootstrap admin record. Run once from the Apps Script editor.
 */
function setupProject() {

  installTriggers();

  stampTitle_();

  try {
    ensureUserRecord_(ADMIN_USERS[0]);
  } catch (err) {}

  Logger.log("Dashboard setup completed.");

}