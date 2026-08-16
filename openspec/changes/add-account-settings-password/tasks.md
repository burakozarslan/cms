## 1. Settings shell

- [x] 1.1 Create `src/app/dashboard/settings/layout.tsx`: guard via `requireSession()`, render sidebar/tab nav (structured to accept future tabs), wrap `children`.
- [x] 1.2 Add a settings index route (`src/app/dashboard/settings/page.tsx`) that redirects to `dashboard/settings/password` (or renders it directly if no separate index is desired).

## 2. Password change - service layer

- [x] 2.1 Add zod schema for `{currentPassword, newPassword}` (reuse the minimum-length rule from registration).
- [x] 2.2 Implement `changePassword` service function (e.g. `src/lib/auth/change-password.ts`): loads user via `getRootDb()` using session `userId`, calls `verifyPassword(currentPassword, storedHash)`, rejects with `{ok:false, error}` on mismatch, else `hashPassword(newPassword)` and updates the row, returns `{ok:true}`.
- [x] 2.3 Unit test `changePassword`: correct current password succeeds and updates the hash; incorrect current password rejected without mutating the row; invalid new password rejected via zod.

## 3. Password change - action and form

- [x] 3.1 Add `"use server"` action (e.g. `src/app/dashboard/settings/password/actions.ts`) that calls `requireSession()`, delegates to `changePassword`, and on success triggers the session update (Decisions: re-sign JWT via NextAuth `session.update()` / `jwt` callback).
- [x] 3.2 Build `dashboard/settings/password/page.tsx` + client form component using `useActionState`, following `rename-project-form.tsx` conventions: current password field, new password field, inline error display, success confirmation.
- [x] 3.3 Verify the session remains valid immediately after a successful change (no forced redirect to login) — manual check plus, if feasible, an integration test asserting the session cookie/token still authenticates subsequent requests.

## 4. Header navigation

- [x] 4.1 In `src/app/dashboard/layout.tsx`, replace the flat `navbar-end` (`{email}` + sign-out form) with a FlyonUI dropdown triggered by the email.
- [x] 4.2 Add "Settings" item (links to `dashboard/settings`) and move the existing sign-out form/action into the dropdown as "Sign out", unchanged in behavior.

## 5. Verification

- [x] 5.1 Manual pass: unauthenticated request to `dashboard/settings/**` redirects to login (matches existing protected-route behavior). Covered by an automated test in `tests/server/dashboard-guard.test.ts`.
- [x] 5.2 Manual pass: header dropdown opens, "Settings" navigates correctly, "Sign out" still works. Verified against the running dev server: rendered markup shows the native `<details class="dropdown">` trigger containing a "Settings" link (`href="/dashboard/settings/password"`) and the unchanged sign-out `<form>`; `/dashboard/settings` and `/dashboard/settings/password` both resolve 200 for an authenticated session.
- [x] 5.3 Manual pass: change password with wrong current password shows a generic error and does not alter the stored hash; change with correct current password succeeds and a subsequent login with the new password works. Covered by `tests/server/change-password.test.ts` (incorrect password rejected without mutating the row; correct change updates the hash and the new password verifies while the old one no longer does).
- [x] 5.4 Confirm no regressions to existing `tenant-auth` login/registration/logout flows (unchanged, but exercised by existing tests/manual check). Full suite passes: 15 suites / 237 tests, including `login.test.ts` and `register.test.ts` unchanged.
