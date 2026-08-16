## Why

There is currently no self-service way for a user to view account-level settings or change their password after registration — the only password-related flow in the system is the initial login check. Users who want or need to rotate their password (forgotten context, security hygiene, post-incident rotation) have no path to do so, and there is no header entry point for account-related actions at all beyond sign-out.

## What Changes

- Add a settings area under `dashboard/settings/` with a sidebar/tabs shell, structured so additional tabs (profile, preferences, etc.) can be added later without restructuring routes.
- Add a "Password" tab (`dashboard/settings/password`) with a form to change the account password, requiring the current password to be re-entered before a new one is accepted.
- On successful password change, re-sign the current session's JWT so the active session reflects the new credential state immediately, without requiring re-login.
  - **Explicitly out of scope**: invalidating other active sessions/devices. The system has no server-side session revocation store (JWT-only sessions); a change here would require a session-versioning mechanism, which this change does not introduce.
- Replace the flat `{email} + sign-out` layout in the dashboard header (`src/app/dashboard/layout.tsx`) with a dropdown triggered by the user's email, containing "Settings" (links to `dashboard/settings`) and "Sign out" (existing sign-out action, unchanged).
- Known gap, not addressed by this change: no rate limiting exists on password-change (or any) endpoints in this codebase today. Noted for future work, not blocking.

## Capabilities

### New Capabilities
- `account-settings`: Settings shell/navigation and the account password-change flow, including current-password verification and current-session re-signing on success.

### Modified Capabilities
(none — login, registration, and logout requirements in `tenant-auth` are unchanged; this change only adds a new authenticated action)

## Impact

- **New routes**: `src/app/dashboard/settings/layout.tsx` (or equivalent shell), `src/app/dashboard/settings/password/page.tsx`.
- **New code**: password-change form (client component, `useActionState`), a `"use server"` action in the settings area, and a service function (zod validation + `getRootDb()` lookup + `verifyPassword` + `hashPassword` + update), following the existing rename-project three-layer pattern.
- **Modified**: `src/app/dashboard/layout.tsx` — header `navbar-end` changes from flat email/sign-out to a dropdown.
- **Auth**: reuses existing `src/lib/auth/password.ts` (`verifyPassword`, `hashPassword`) and `requireSession()`; adds logic to re-issue the session JWT post-change (NextAuth JWT callback or session update call).
- **Data**: no schema changes — `users.password_hash` already exists and is root-scoped (`getRootDb()`), not tenant-scoped.
- **No breaking changes** to existing routes, APIs, or session shape.
