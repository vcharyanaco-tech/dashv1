/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Audit.gs
 * ============================================================
 */

const AUDIT_SHEET = "Audit Log";


/* ============================================================
 * Get Audit Sheet
 * ============================================================
 */

function getAuditSheet_() {

  const ss = SpreadsheetApp.getActive();

  let sheet = ss.getSheetByName(AUDIT_SHEET);

  if (!sheet) {

    sheet = ss.insertSheet(AUDIT_SHEET);

    sheet.appendRow([
      "Timestamp",
      "User",
      "Action",
      "Record ID",
      "Details"
    ]);

    sheet.getRange(1,1,1,5)
      .setFontWeight("bold");

  }

  return sheet;

}


/* ============================================================
 * Generic Audit Logger
 * ============================================================
 */

function logAudit_(action,id,details) {

  try {

    const sheet = getAuditSheet_();

    sheet.appendRow([

      new Date(),

      getCurrentUser(),

      action,

      id || "",

      typeof details === "string"
        ? details
        : JSON.stringify(details)

    ]);

  }

  catch(err){

    Logger.log(err);

  }

}


/* ============================================================
 * Add
 * ============================================================
 */

function auditAdd_(item){

  logAudit_(

    "ADD",

    item.id,

    item

  );

}


/* ============================================================
 * Update
 * ============================================================
 */

function auditUpdate_(oldItem,newItem){

  logAudit_(

    "UPDATE",

    newItem.id,

    {

      before: oldItem,

      after: newItem

    }

  );

}


/* ============================================================
 * Delete
 * ============================================================
 */

function auditDelete_(item){

  logAudit_(

    "DELETE",

    item.id,

    item

  );

}


/* ============================================================
 * Error
 * ============================================================
 */

function auditError_(functionName,error){

  logAudit_(

    "ERROR",

    "",

    {

      function:functionName,

      message:error.message,

      stack:error.stack

    }

  );

}


/* ============================================================
 * Login
 * ============================================================
 */

function auditLogin_(){

  logAudit_(

    "LOGIN",

    "",

    {

      user:getCurrentUser()

    }

  );

}


/* ============================================================
 * Logout
 * ============================================================
 */

function auditLogout_(){

  logAudit_(

    "LOGOUT",

    "",

    {

      user:getCurrentUser()

    }

  );

}


/* ============================================================
 * Trigger Test
 * ============================================================
 */

function testAudit(){

  auditAdd_({

    id:1,

    sector:"Testing",

    description:"Audit Test"

  });

}