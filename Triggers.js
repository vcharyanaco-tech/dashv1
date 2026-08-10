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

  // Daily audit-log archival (runs after the review reminders so it has a
  // quiet window; moves entries older than 90 days to the Audit Archive sheet
  // in bounded batches — see archiveAuditLog in Audit.js).
  ScriptApp.newTrigger("archiveAuditLog")
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .create();

  // Keep-warm: a lightweight execution every 5 minutes prevents the GAS
  // container from idling out, so the first user request after a lull (login,
  // getAppData) does not pay the multi-second cold-start penalty.
  ScriptApp.newTrigger("warmup")
    .timeBased()
    .everyMinutes(5)
    .create();

}

/**
 * Keep-warm handler for the every-5-minutes trigger above. Deliberately
 * touches the same services the request path uses (script cache + properties)
 * so the execution environment stays warm; never throws.
 */
function warmup() {
  try { CacheService.getScriptCache().get('warmup'); } catch (err) {}
  try { PropertiesService.getScriptProperties().getProperty('warmup'); } catch (err) {}
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
    if (handler === "dailyDateUpdate" || handler === "sendReviewReminders" || handler === "archiveAuditLog" || handler === "warmup") {
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