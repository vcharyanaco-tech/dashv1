# Deployment Guide

1. Open the Apps Script project linked to this workspace.
2. Confirm `appsscript.json` has:
   - `executeAs`: `USER_DEPLOYING`
   - `access`: `ANYONE_ANONYMOUS`
3. Deploy a new version via `clasp deploy -d "India Post Dashboard feature release"`.
4. Use the returned deployment ID to construct the web app URL:
   `https://script.google.com/macros/s/<deploymentId>/exec`
5. Visit the web app and test the dashboard.
6. Verify the `Audit Log` tab contains history entries and the `Reports` tab can export PDF/spreadsheet.
