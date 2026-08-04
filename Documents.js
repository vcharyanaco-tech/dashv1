/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Documents.gs
 * Document management: attachments linked to records via Drive.
 * ============================================================
 */

const DOC_SHEET_HEADERS = ['Id', 'RecordRow', 'RecordId', 'FileName', 'DriveFileId', 'MimeType', 'Size', 'UploadedBy', 'UploadedAt'];

const DOC_COL = Object.freeze({
  ID: 1,
  RECORD_ROW: 2,
  RECORD_ID: 3,
  FILE_NAME: 4,
  DRIVE_FILE_ID: 5,
  MIME_TYPE: 6,
  SIZE: 7,
  UPLOADED_BY: 8,
  UPLOADED_AT: 9
});

function documentsSheet_() {
  const ss = getSpreadsheet_();
  if (!ss) return null;
  let sh = ss.getSheetByName(CONFIG.DOCUMENTS.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.DOCUMENTS.SHEET_NAME);
    sh.getRange(1, 1, 1, DOC_SHEET_HEADERS.length).setValues([DOC_SHEET_HEADERS]);
    try { sh.setFrozenRows(1); } catch (err) {}
  }
  try { sh.hideSheet(); } catch (err) {}
  return sh;
}

function docRecordFromRow_(row) {
  return {
    id: String(row[0] || ''),
    recordRow: Number(row[1]) || 0,
    recordId: String(row[2] || ''),
    fileName: String(row[3] || ''),
    driveFileId: String(row[4] || ''),
    mimeType: String(row[5] || ''),
    size: Number(row[6]) || 0,
    uploadedBy: String(row[7] || '').toLowerCase(),
    uploadedAt: row[8] ? new Date(row[8]).getTime() : 0
  };
}

function getRecordDocuments_(recordRow) {
  const sh = documentsSheet_();
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, DOC_SHEET_HEADERS.length).getValues();
  return data.filter(function (row) { return Number(row[1]) === recordRow; }).map(docRecordFromRow_);
}

function addDocument_(recordRow, recordId, fileName, driveFileId, mimeType, size, uploadedBy) {
  const sh = documentsSheet_();
  if (!sh) throw new Error('Documents sheet unavailable.');
  const id = Utilities.getUuid();
  const now = new Date();
  sh.appendRow([id, recordRow, recordId, fileName, driveFileId, mimeType, size, uploadedBy, now]);
  return { id: id, recordRow: recordRow, fileName: fileName, driveFileId: driveFileId };
}

function deleteDocument_(docId) {
  const sh = documentsSheet_();
  if (!sh) return false;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;
  const data = sh.getRange(2, 1, lastRow - 1, DOC_SHEET_HEADERS.length).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(docId)) {
      const fileId = String(data[i][4] || '');
      if (fileId) {
        try { DriveApp.getFileById(fileId).setTrashed(true); } catch (err) {}
      }
      sh.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function uploadDocumentToDrive_(fileBytes, fileName, mimeType) {
  const blob = Utilities.newBlob(fileBytes, mimeType || 'application/octet-stream', fileName);
  const file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  return { driveFileId: file.getId(), url: file.getUrl(), size: blob.getBytes().length };
}

function getRecordDocuments(recordRow, token) {
  requireLogin_(token);
  return getRecordDocuments_(Number(recordRow) || 0);
}

function uploadDocument(recordRow, recordId, fileName, base64, mimeType, token) {
  const user = requireLogin_(token);
  const bytes = Utilities.base64Decode(base64);
  const drive = uploadDocumentToDrive_(bytes, fileName, mimeType);
  const doc = addDocument_(Number(recordRow) || 0, String(recordId || ''), String(fileName || ''), drive.driveFileId, String(mimeType || ''), drive.size, user.email);
  try { notifyStaff_(NOTIFICATION_TYPES.RECORD, 'Document added', 'Document "' + String(fileName || '') + '" was added to record #' + (Number(recordRow) || 0) + ' by ' + user.email + '.', '', user.email); } catch (err) {}
  return doc;
}

function deleteDocument(docId, token) {
  const user = requireLogin_(token);
  const ok = deleteDocument_(String(docId));
  if (!ok) throw new Error('Document not found.');
  try { notifyStaff_(NOTIFICATION_TYPES.RECORD, 'Document removed', 'A document (' + String(docId) + ') was removed by ' + user.email + '.', '', user.email); } catch (err) {}
  return { success: true };
}
