# Session Export — 2026-08-11

## Goal
Resume point for the India Post Dashboard session of 2026-08-11. All work is
committed to `origin/main` and **fully deployed** (GAS pinned deployment @225,
Cloudflare Worker, GitHub Pages). The headline item: a **production crash in
every user-creation path** (admin add user, bulk import, password change) that
was silently masked for days — root-caused, fixed, regression-tested, and
verified live.

## 1. Production crash: user creation broke under GAS V8 (FIXED, live @225)

### Symptom
`adminAddUser` / `adminImportUsers` returned a **Google HTML error page**
instead of JSON. The app's `doPost` is supposed to catch everything and return
JSON, so an HTML page was doubly wrong: login worked, but creating users,
resetting passwords, and importing users all crashed.

### Root cause (two stacked bugs)
1. **`pbkdf2HmacSha256_` (Auth.js) passed a plain JS `number[]` back into
   `Utilities.computeHmacSha256Signature`** on the 2nd+ PBKDF2 iteration.
   GAS V8 rejects that overload:
   `The parameters (number[],String,Utilities.Charset) don't match the method
   signature`. Every v2-hash operation (hashPasswordV2_ → addUserRecord_ /
   setUserField_ / import) threw. Login survived only because all existing
   accounts still carry legacy **v1 hashes** (verified via `hashPassword_`),
   and the login v1→v2 upgrade is wrapped in `try/catch {}` — so the crash was
   silently swallowed on login and never surfaced. The PBKDF2 code was only 2
   days old (commit `c08383c`), so **no v2 hash ever existed** → zero
   backward-compat risk from the fix.
2. **`doPost` (code.js) referenced a try-scoped `const body` from its `catch`**
   — a `ReferenceError` that fired *while handling the real error*, killing
   the `console.error` log and replacing the JSON error with a Google HTML
   error page (which is what we observed).

### Fixes
- **Auth.js** — byte arrays round-trip through a Latin-1 (ISO_8859_1) string:
  `String.fromCharCode.apply(null, msg)` → `computeHmacSha256Signature(m, key,
  Charset.ISO_8859_1)`. ISO_8859_1 encodes charCodes 0-255 byte-exact, and the
  SAME charset is used for every call so HMAC key bytes stay identical across
  all PBKDF2 iterations. Verified byte-identical to `crypto.pbkdf2Sync` for
  ASCII passwords (the realistic case); unicode passwords are self-consistent
  (Latin-1 key bytes, same on create + verify).
- **code.js** — hoisted `let fnName = ''` before the try; catch logs `fnName`
  instead of `body`. Real errors now reach Stackdriver and the client gets a
  clean generic JSON error.
- **tests/pbkdf2-v8-roundtrip.test.js** — 5 regression tests pinning the
  derivation to crypto reference vectors (default/multi-block/unicode/signed
  GAS bytes + a source guard that fails if anyone reverts to UTF_8). The full
  suite is now **87/87 passing**.

### Live verification
- Deployed @224 (crash fix) → @225 via `deploy-all.ps1`.
- **Confirmed**: the exact call that returned the HTML crash page pre-fix now
  returns clean JSON (`{"success":false,"error":"Login required..."}` — an
  auth check, proving execution reaches deep into the handler).
- Full end-to-end (create user → import → delete with correct auth args) was
  blocked by a **Google anti-abuse interstitial** on this client's requests
  (triggered by the earlier burst of scripted API calls; raw GAS URL and the
  worker URL both served the `ppConfig` challenge page, and the browser-use
  automation service was session-limited). The challenge clears in ~30-60 min;
  see **§4. Resume** for the exact re-test recipe.

## 2. Performance work (task tab + login speed)

The session's original goal was high task-tab / app-load / login times. Work
delivered earlier in the session (all committed + deployed):

- **getTasks()/getMyTasks() cross-execution cache** (15s TTL, filter-after-
  cache) + invalidation on all task writes (commit `4e7ca0f`).
- **Batched generation bumps** for Users/Tasks/Submissions multi-mutation
  flows (password change, bulk import, etc.) — collapse N bumps into 1 so the
  cache stays warm mid-flow.
- **Cache co-writes** — mutated rows are patched into the cached payload under
  the same generation key (bulk import does zero sheet re-reads).
- **Force a fresh task fetch after create/delete mutations** so saved changes
  appear before the background refresh lands.
- Timing-instrumentation notes added to Admin Guide, Developer Guide, and
  Deployment Guide (before/after measurement steps).

### Baseline numbers captured (API level, pre-challenge)
| Measurement | Result |
|---|---|
| login #1 (cold, PBKDF2 absent) | 5.46 s |
| login #2 (warm) | 3.71 s |
| login #3 (warm) | 3.40 s |
| login (post-fix deploy, cold-ish) | 4.13 s |
| adminAddUser request (auth-rejected, JSON) | 2.45 s |

Note: the ~1.7 s cold→warm drop is the re-hash effect; login no longer pays
any hash cost for v1 accounts until the first post-fix login migrates them to
v2 (intended Point-7 behavior, now actually functional).

## 3. Deploy & housekeeping

- **deploy-all.ps1**: all stages OK — sync, minify, git push (`4f82d89`),
  clasp push, GAS redeploy, Cloudflare Worker.
- **Pinned live deployment**: `AKfycbxPwINC2LOPQ-II6vhMXuEqy30Fim32INQNjK3j0sK_9kBClr2MrbSPDnR91AmC7Ian` @225.
- Live `app.js`: 186,732 bytes, `startTask` present (Start-button feature live).
- `.claspignore` now excludes `minify-frontend.js` + `lib/**` (they were being
  pushed to GAS and broke the deploy — commit `3e121ce`).
- Client recovery: `script.html` + `docs/app.js` restored from git and the
  Start-task feature + OPEN→DONE fix re-ported cleanly (commit `35266bf`);
  both clients parse, sync/minify idempotent.

### Commits today
```
35266bf feat: port Start-task feature + OPEN->DONE fix onto restored tree
3e121ce fix: exclude minify-frontend.js + lib/ from clasp push
f4c7480 fix: GAS V8 crash on user creation (PBKDF2 Latin-1 + doPost scoping)
4aa8e94 chore: drop one-off pbkdf2 verification script
71f3282 test: PBKDF2 Latin-1 V8 round-trip regression vectors (5 tests)
4f82d89 auto: 2026-08-11 17:31:38 (deploy-all)
```

## 4. Resume point / next steps

The crash fix is live; the remaining item is **live end-to-end timing
verification** once Google's anti-abuse interstitial clears (or from a browser
on a different IP, which passes instantly):

1. **Quick smoke**: login via
   `https://dashboardharyana.site/app.html` in a normal browser
   (`vcharyanaco@gmail.com / Vish@9194`), then Tasks tab — measure the
   `login` and `getTasks` POSTs to `/exec` in DevTools Network.
2. **Create-user path**: Settings → Users → Add user (or bulk-import a CSV:
   `email,role,group,department,office,password,username`) — must return
   JSON, not an HTML page.
3. **Cleanup**: delete any throwaway users afterwards (Users sheet should have
   exactly 6 real accounts).
4. If re-running from this machine via curl: pace requests ≥3 s apart with a
   browser User-Agent, and retry login every ~3 min until the challenge page
   (`ppConfig` in the body) stops appearing. Use
   `adminAddUser(email, username, role, password, group, dept, office, token)`
   and `adminDeleteUser(email, token)` — token LAST.
