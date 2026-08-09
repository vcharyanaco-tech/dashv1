# Runbook: Rotating the Bootstrap Admin Password

> **Applies to:** India Post Dashboard (`dashv1`)
> **Last verified against:** commit `ea4d114` (Auth.js `bootstrapAdminPassword_` /
> `setAdminBootstrapPassword` / `changePassword` / `adminResetPassword` /
> `sessionEmail_`).

## ⚠️ Two things to understand first

1. **`ADMIN_BOOTSTRAP_PASSWORD` is only read once** — when the bootstrap admin
   record is **first created** (`ensureUserRecord_` → `bootstrapAdminPassword_`
   in `Auth.js`). After that, the admin's real login password lives in the
   **Users sheet** as a PBKDF2 hash. **Rotating the Script Property alone does
   NOT change the admin's login password**, and it does **not** invalidate
   sessions.
2. **Session invalidation is triggered by password/role/email changes**, via
   `bumpSessionEpoch_(email)`. It is called by `changePassword`,
   `adminResetPassword`, and `adminUpdateUser` (role/email change). The epoch
   check in `sessionEmail_` invalidates every session minted before the bump.

So a real "rotation" has two parts — **A** (rotate the live password + kill
sessions) and **B** (optionally refresh the bootstrap fallback for future
fresh setups).

---

## Part A — Rotate the actual admin password (this is what logs people out)

Pick **A1** (self-service, you know the current password) or **A2** (admin
reset, you don't / forcing from outside).

### A1. Self-service change (recommended)

Dashboard: **Settings → Change password** (uses
`ApiService.changePassword(current, new)` → server `changePassword`).

Under the hood it:
- verifies your current password,
- re-hashes with PBKDF2 (`hashPasswordV2_`, 10k iterations, fresh salt),
- clears `mustChange` / reset tokens,
- **calls `bumpSessionEpoch_(email)`** → every other session for that user is
  now invalid (they get "Login required"),
- writes a `CHANGE_PASSWORD` audit entry and sends a notification.

From the browser console (alternative):
```js
ApiService.changePassword('<current>', '<NewPassw0rd!>')
```

### A2. Admin reset (you're a different admin, or forcing a reset)

Dashboard: **Settings → Users → Reset password** (uses
`ApiService.adminResetPassword(email, newPassword)`).

Under the hood it: re-hashes, **bumps the session epoch** (kills all of that
user's sessions), clears `mustChange`/reset tokens, audits
`USER_RESET_PASSWORD`, and notifies the user.

From the console:
```js
ApiService.adminResetPassword('vcharyanaco@gmail.com', '<NewPassw0rd!>')
```

> Both A1 and A2 are rate-limited (`PASSWORD_CHANGE_MAX: 10 / 15 min`,
> `ADMIN_USER_MAX: 20 / 60 s`) and both require a valid session token, which
> the client appends automatically.

---

## Part B — Set/refresh `ADMIN_BOOTSTRAP_PASSWORD` Script Property (optional)

Only relevant if the Users sheet is ever wiped/recreated or you deploy a brand
new copy of the script (where `ensureUserRecord_` will run again). **Not needed
for a routine password rotation.**

### B1. Via the API (admin-gated setter)

```js
// console, while logged in as admin:
ApiService.setAdminBootstrapPassword('<NewPassw0rd!>')
```

Server: `setAdminBootstrapPassword(password, token)` → `requireAdmin_`,
validates min-8 via `validatePassword_`, stores in Script Properties, never
echoes it back. Returns `{ok: true}` or `{ok: false, message}`.

### B2. Directly in the Apps Script editor

Open the script project and run a one-off (or use the editor's debug console):
```js
PropertiesService.getScriptProperties()
  .setProperty('ADMIN_BOOTSTRAP_PASSWORD', '<NewPassw0rd!>');
```
Or use the editor UI: **Project Settings ⚙ → Script Properties → Add** → key
`ADMIN_BOOTSTRAP_PASSWORD`.

> ⚠️ If the property is **unset** at first-run time, `bootstrapAdminPassword_`
> generates a random `Bp…` password, persists it, and emails it to the admin.
> If you ever see a random password in Script Properties you didn't set, that
> is what happened — use it once, then run Part A to set a known one.

---

## Part C — Invalidate remaining sessions (belt & braces)

Sessions also self-expire after 6 hours (`SESSION_TTL_SECONDS: 21600`). After
Part A the epoch bump already invalidates them; to be certain nothing lingers:

- Ask the user to sign out (destroys the token), or
- (Optional, admin) trigger any role/email touch via `adminUpdateUser` — it
  also bumps the epoch, or
- Wait for the 6h TTL.

There is no "kill all sessions for user X" endpoint by design — the epoch bump
on password change is the mechanism, and it is already done in Part A.

---

## Part D — Verify

1. **Old password fails:** Sign out, try the old password → expect
   `Invalid email, username or password.` (5 failures → 15-min lockout, so do
   not brute-force test).
2. **New password works:** Sign in with the new password → expect
   `success: true`, `mustChange: false`.
3. **Old sessions are dead:** On a device still logged in before Part A,
   refresh → expect a "Login required" / re-login flow (epoch mismatch in
   `sessionEmail_`).
4. **Audit trail:** **Audit tab** → expect `CHANGE_PASSWORD` (A1) or
   `USER_RESET_PASSWORD` (A2) and `LOGIN` entries.
5. **No regression:** after signing in, Dashboard, Tasks, and Notifications all
   load (counts endpoints and everything else are token-scoped, unaffected).

---

## Quick reference — key code locations (`dashv1/Auth.js`)

| Concern | Function | Line |
|---|---|---|
| Reads the property / generates fallback | `bootstrapAdminPassword_` | 18 |
| Admin setter | `setAdminBootstrapPassword` | 32 |
| First-run record creation | `ensureUserRecord_` | 528 |
| Session epoch check | `sessionEmail_` / `bumpSessionEpoch_` | 610 / 597 |
| Self password change (+epoch bump) | `changePassword` | 992 |
| Admin reset (+epoch bump) | `adminResetPassword` | 1455 |
