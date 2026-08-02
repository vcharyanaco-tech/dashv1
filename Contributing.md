# Contributing

Thanks for helping with the India Post Dashboard. This document explains how to
contribute safely to a codebase that is deployed directly to a Google Apps Script
project.

## Workflow

1. Create a feature branch from `main`:
   ```powershell
   git checkout -b feature/your-change
   ```
2. Make focused changes (see [Developer Guide](Developer%20Guide.md) for the
   layout and verification steps).
3. Run the local checks below.
4. Commit with a concise, descriptive message (imperative mood, see conventions).
5. Push and open a pull request against `main`.

> The repository is the source of truth. `clasp push -f` uploads the working
> directory to Apps Script, so **only** commit intended files.

## Local checks (required before commit)

- **JavaScript syntax** — Apps Script files are V8 JavaScript. Extract the inline
  `<script>` block from `script.html` and run:
  ```powershell
  node --check <extracted-file.js>
  ```
  (Do the same for any edited `.js` file that is not a plain script, e.g. if you
  edited `script.html`.)
- **DOM wiring** — confirm every `getEl(...)` ID in `script.html` exists in
  `index.html`, and every inline `onclick="fn(...)"` handler is a defined function.
- **Server-side syntax** — `clasp push` also catches syntax errors; run it before
  deploying.

## Conventions

- Keep server code split by concern in the existing modules (`Auth.js`,
  `Data.js`, `Audit.js`, `Reports.js`, `Submissions.js`, `Settings.js`,
  `Triggers.js`, `Utils.js`, `code.js`) — do not add a new top-level file unless
  it clearly needs its own module.
- Every mutation should run inside `runWithLock_(...)` and every protected
  endpoint must start with `requireLogin_(token)` / `requireEditor_(token)` /
  `requireAdmin_(token)`.
- The client calls server functions with `google.script.run` and always passes the
  session token as the trailing argument.
- Never hard-code per-user access checks in the client — the server must enforce
  authorization; the UI only hides what the user cannot do.
- All destructive actions should write an audit entry via `logAudit_(...)`.
- Do not add explanatory comments to code unless they add real value (the existing
  code is intentionally comment-light).
- Preserve the existing style: `function` declarations, `const`/`let`, no new
  build tooling or dependencies.

## Commit conventions

- Imperative present tense, no trailing period, max ~70 chars.
- Prefix with the affected area when it helps, e.g. `Audit: ...`, `Export: ...`,
  `UI: ...`, `Docs: ...`.
- One logical change per commit. Docs-only changes are welcome (`Docs: ...`).

## Testing notes

There is no automated test runner. The app is verified by:

- `node --check` on extracted client JS,
- the DOM/ID audit described above,
- pushing to Apps Script and deploying, then exercising the live app
  (see [Deployment Guide](Deployment%20Guide.md)).

If you add a new server function, call it from the client, push, deploy, and
verify it against the live deployment before opening the PR.

## Issues

Report bugs as GitHub issues with: what you did, what happened, expected behaviour,
and whether the issue reproduces on the live URL or only locally.
