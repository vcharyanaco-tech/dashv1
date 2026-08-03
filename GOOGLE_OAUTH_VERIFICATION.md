# Google OAuth Verification — First-Try Guide

This guide walks through everything required so the **India Post Dashboard**
Google Apps Script project passes Google OAuth / app verification on the **first
submission**. It covers the parts that live in this repository (the public
compliance site in `docs/`, the manifest scopes, and the clasp config) plus the
Google Cloud Console steps that must match them.

> If you follow this guide top to bottom, the reviewer sees a verified domain,
> live and accurate Privacy/Terms/Data-deletion pages, minimal scopes with
> clear descriptions, and an app that matches its own policy. That is what makes
> a submission pass on the first attempt.

---

## 1. How the pieces fit together

```
docs/  (this folder)  ── published on GitHub Pages ──▶  public site
                                                        ├── https://<org>.github.io/<repo>/
                                                        ├── .../privacy.html
                                                        ├── .../terms.html
                                                        ├── .../data-deletion.html
                                                        └── .../googledb112fa8b7d5dd0c.html  (Search Console verification file)

appsscript.json       ── the OAuth scopes the app requests (already trimmed)
.clasp.json           ── skips subdirectories so docs/ is NOT pushed to Apps Script
GOOGLE_OAUTH_VERIFICATION.md  ── this guide
```

The `docs/` folder is the **public compliance website**. It is deliberately kept
out of the Apps Script push (`.clasp.json` → `"skipSubdirectories": true`) so the
site files never land in the script project.

---

## 2. Publish the docs/ site

The pages in `docs/` must be publicly reachable over HTTPS with no login. GitHub
Pages is the simplest option and already matches the Google verification file
hosted at `docs/googledb112fa8b7d5dd0c.html`.

1. Push this repository to GitHub (`https://github.com/vcharyanaco-tech/dashv1`).
2. **Repository → Settings → Pages**. The site must be published from the
   `docs/` folder. Choose one of these two ways:

   - **Option A (recommended, no manual setting): GitHub Actions.**
     A workflow (`.github/workflows/pages.yml`) already deploys `docs/`.
     In Pages settings set **Build and deployment → Source → GitHub Actions**,
     then push — the workflow uploads `docs/` to the site root automatically.
   - **Option B: Deploy from a branch.** Source → **Deploy from a branch**,
     Branch: `main`, folder: `/docs`.

   > The `docs/` folder must be the site root. If Pages serves the **repo root**
   > instead, the home page becomes the Apps Script dashboard shell
   > (`index.html`), which fails verification (see section 8).
3. Note the resulting URL. For a project repository it will be:
   `https://vcharyanaco-tech.github.io/dashv1/`
   (substitute the actual GitHub org/user and repo name).

   > **Custom domain (recommended for OAuth verification).** Google requires the
   > home page to sit on a domain you own, and `github.io` subdomains do not
   > satisfy that. Point your registered domain at this site instead:
   > - Set the Pages custom domain to `www.dashboardharyana.site` (this repo's
   >   `docs/CNAME` already contains it).
   > - At your registrar add a `CNAME` `www` →
   >   `vcharyanaco-tech.github.io`, plus four `A` records on `@` →
   >   `185.199.108.153`, `.109.`, `.110.`, `.111.`.
   > - Use `https://www.dashboardharyana.site/` everywhere below.
4. Verify these URLs open in an incognito window:
   - `https://<your-site>/`
   - `https://<your-site>/privacy.html`
   - `https://<your-site>/terms.html`
   - `https://<your-site>/data-deletion.html`
   - `https://<your-site>/support.html`
   - `https://<your-site>/googledb112fa8b7d5dd0c.html` → must display exactly
     `google-site-verification: googledb112fa8b7d5dd0c.html`
5. Confirm the home page (`https://<your-site>/`) is the compliance landing page
   (`docs/index.html`) — it must show the app name **"India Post Dashboard"** and
   a clear statement of the app's purpose. It also carries a
   `google-site-verification` meta tag and the Search Console HTML file, so the
   home page can be verified by either method.

> **First-try traps**
> - Pages 404 because the Pages source is `/` instead of `/docs` → use `/docs`.
> - The verification file is served from the wrong path (e.g.
>   `.../dashv1/docs/googledb...`) because Pages source is `/` → the file must be
>   reachable at the **site root** (`/googledb112fa8b7d5dd0c.html`).
> - The verification file content must be byte-for-byte
>   `google-site-verification: googledb112fa8b7d5dd0c.html` (already correct —
>   do not reformat it).

---

## 3. Verify the domain in Google Search Console

1. Open <https://search.google.com/search-console>.
2. **Add property → Domain** and enter `dashboardharyana.site` (verify with the
   DNS TXT record — this proves you own the registrable domain, which is what
   Google's OAuth check requires). A URL-prefix property for a `github.io` URL is
   **not** sufficient.
3. Choose either HTML verification method — both are already prepared in this repo:
   - **HTML file**: the file already exists at
     `docs/googledb112fa8b7d5dd0c.html` and will be served at the site root.
   - **HTML tag**: the meta tag is already in `docs/index.html`:
     `<meta name="google-site-verification" content="db112fa8b7d5dd0c">`.
4. Click **Verify**. Ownership must show **Verified** (not "Pending") before
   submitting for OAuth verification — this is the "home page is not registered
   to you" check.
5. The verification file and meta tag must stay in the repository permanently —
   removing them revokes ownership.

---

## 4. Link the Apps Script project to the Google Cloud project

1. Open the Apps Script project (`scriptId` is in `.clasp.json`) → **Project
   Settings**.
2. Under **Google Cloud Platform (GCP) project**, confirm the project number for
   `dashboard-504111` (see `.clasp.json` → `projectId`) is linked, or click
   "Change project" and select it.
3. Note: the OAuth consent screen is configured on the **GCP project**, not in
   Apps Script. All consent-screen values must match this repository.

---

## 5. Configure the OAuth consent screen

Open <https://console.cloud.google.com/apis/credentials/consent> for the linked
project and set:

| Field | Value |
| ----- | ----- |
| User type | **External** (even for internal use; Internal users can still be test users) |
| App name | `India Post Dashboard` (must match this repo and the site) |
| Support email | `vcharyanaco@gmail.com` (a real, monitored address) |
| App logo | A square logo, 120×120 px (recommended) |
| App domain | `dashboardharyana.site` (your published custom domain) |
| Application home page | `https://<your-site>/` |
| Application privacy policy link | `https://<your-site>/privacy.html` |
| Application terms of service link | `https://<your-site>/terms.html` |
| Authorized domains | The site domain (add it if prompted) |
| Developer contact information | A real, monitored email |

Then on the **Scopes / Data Access** tab add the scopes declared in
`appsscript.json`, each with a short user-facing description:

| Scope | Consent-screen description |
| ----- | -------------------------- |
| `https://www.googleapis.com/auth/userinfo.email` | See your primary Google Account email address |
| `https://www.googleapis.com/auth/spreadsheets` | See, edit, create, and delete your spreadsheets in Google Drive |
| `https://www.googleapis.com/auth/drive.file` | See, edit, create, and delete only the specific Google Drive files you use with this app |
| `https://www.googleapis.com/auth/script.scriptapp` | Manage the current script's processes and triggers |
| `https://www.googleapis.com/auth/script.send_mail` | Send email on your behalf |

> **Why these scopes only** — each maps to a real API call in the code:
> - `spreadsheets` → bound spreadsheet reads/writes + report workbook creation
>   (`code.js`, `Data.js`, `Reports.js`)
> - `drive.file` → document attachments and XLSX/PDF exports (`Documents.js`,
>   `Reports.js`)
> - `script.scriptapp` → password-reset URL + installable triggers (`Auth.js`,
>   `Triggers.js`)
> - `script.send_mail` → password-reset and scheduled report email (`Auth.js`,
>   `Reports.js`)
> - `userinfo.email` → identifies the signed-in user for roles/audit
> Do not add scopes that the app does not use; unnecessary scopes are a common
> rejection reason.

---

## 6. Add test users and test the flow

1. On the consent screen, add a few **test users** (their email addresses).
2. In an **incognito** window, sign in as a test user and exercise the
   application: login, view the dashboard, and (if your role allows) add/edit a
   record, attach a document, and trigger a password-reset email.
3. Confirm the consent screen shows the correct app name, logo, and scope
   descriptions — exactly as configured.

---

## 7. Submit for verification

1. On the consent screen, click **Publish app** → **Submit for verification**.
2. Complete the questionnaire honestly. The answers must match this repository:
   - **Do you use Google APIs?** Yes — Sheets, Drive, Gmail (send), ScriptApp.
   - **Does your app transfer data to third parties?** No.
   - **Separate privacy policy URL?** Yes — `https://<your-site>/privacy.html`.
   - **Is the app eligible for limited-use / internal use?** Answer truthfully
     based on your rollout.
3. Google may ask for a **short video (1–2 minutes)** showing the app using each
   scope. Record an incognito walk-through: login, dashboard, record edit, file
   attachment/export, and a password-reset email. Link it in the submission.
4. Provide your **support email** so Google can contact you about the review.

---

## 8. Common rejection reasons — and how this repo avoids them

| Rejection reason | What we did to avoid it |
| ---------------- | ----------------------- |
| Privacy policy URL missing / 404 / requires login | Public GitHub Pages site; no login; verified reachable URLs (section 2) |
| Privacy policy too short or vague | Full policy in `docs/privacy.html` covering collection, use, scopes, retention, deletion, sharing, security, contact, and Google's limited-use policy |
| No data deletion mechanism | Dedicated `docs/data-deletion.html` + a "Data Deletion" section in the privacy policy; in-app deletion + support-email process |
| Missing or one-line Terms of Service | Full terms in `docs/terms.html` |
| Scopes requested that the app doesn't use | `appsscript.json` trimmed to only used scopes (`userinfo.profile` removed) |
| App name / support email inconsistent | Branded "India Post Dashboard" and `vcharyanaco@gmail.com` consistently across the app, site, and this guide |
| Domain not verified | Search Console HTML-file verification file kept in `docs/` (section 3) |
| Policy doesn't match app behavior | Policy accurately describes Sheets/Drive/Gmail/ScriptApp usage and states data is not shared or sold |
| Support email not monitored | Use `vcharyanaco@gmail.com` and check it during the review window |
| **"Home page URL is not registered to you"** | Verify the exact URL prefix in Search Console until it shows **Verified** (section 3); the meta tag + HTML file are already in the repo |
| **"Home page does not explain the purpose of your app"** | Ensure Pages serves `docs/` (not the repo root dashboard shell), then confirm `https://<your-site>/` shows the landing page with the purpose section (section 2) |
| **"App name does not match your home page"** | The consent screen name **and** the home page both say **India Post Dashboard**; if the home page was the dashboard shell, fix the Pages source so the landing page is served (section 2) |

---

## 9. Timeline

- Consent-screen config and testing: done before submitting.
- Google typically reviews verification submissions within **3–5 business days**
  (sometimes longer). Watch the support email; respond promptly to any
  questions to keep the review on the first attempt.
