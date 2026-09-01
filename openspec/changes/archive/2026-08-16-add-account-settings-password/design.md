## Context

See proposal.md - Why. Relevant existing state:
- `src/app/dashboard/layout.tsx` renders the header today: a `navbar-end` div with `{session.user.email}` and a sign-out `<form>`.
- `requireSession()` (`src/lib/auth/index.ts`) returns `{ user: { id, email, tenantId } }` and is the standard guard for protected pages/actions.
- `users` (root/identity table, not tenant-scoped) is accessed via `getRootDb()`; `authorize.ts` is the only existing caller.
- `src/lib/auth/password.ts` already exports `hashPassword`, `verifyPassword`, and `burnPasswordComparison` (bcryptjs, 12 rounds).
- The rename-project feature is the established three-layer convention: client form (`useActionState`) → `"use server"` action (calls `requireSession()`) → service function (zod `safeParse`, returns `{ok:true|false}`, does the DB call).
- Sessions are JWT-strategy NextAuth; there is no server-side session table, so there is no mechanism today to revoke a specific session or session set.

## Goals / Non-Goals

**Goals:**
- Ship a settings shell that can host more tabs later without a route/layout rewrite.
- Ship password change as the first tab, following existing form/action/service conventions.
- Keep the active browser session valid post-change (no forced re-login on the device that made the change).
- Add the header dropdown as the single entry point into settings.

**Non-Goals:**
- Session revocation across devices (would require a session-version or server-side session store — out of scope, called out explicitly in proposal.md).
- Rate limiting on the password-change action (noted as an existing gap across the codebase, not introduced or fixed here).
- Any settings tab beyond password (profile, preferences, etc.) — only the shell needs to anticipate them structurally.
- Password strength meter / complexity policy beyond the existing minimum-length rule already used at registration.

## Decisions

**Shell as nested layout with route-based tabs, not a single page with in-page sections.**
`src/app/dashboard/settings/layout.tsx` renders the sidebar/tab nav and wraps `children`; `src/app/dashboard/settings/password/page.tsx` is the first tab. Alternative considered: one `page.tsx` with stacked sections — rejected because it doesn't scale to multiple tabs without a later restructure, and the user explicitly chose the tabs/sidebar shape during exploration.

**Password change reuses the existing three-layer pattern (form → action → service), not a route handler.**
Matches `rename-project-form.tsx` / `dashboard/actions.ts` / `src/lib/projects/service.ts`. A new `src/lib/auth/change-password.ts` (or colocated under `src/lib/settings/`) service function: zod-validates `{currentPassword, newPassword}`, loads the user via `getRootDb()`, calls `verifyPassword(currentPassword, storedHash)`, and on match calls `hashPassword(newPassword)` and updates the row. Returns `{ok:false, error}` on any failure (wrong current password, validation failure) so the form can render a single, non-revealing error message — consistent with the login flow's generic-error behavior in `tenant-auth`.

**Session continuity via re-issuing the JWT after a successful change, not a full sign-in redirect.**
NextAuth v5's `session.update()` (client) or re-encoding the JWT in the `jwt` callback triggered by an `update` call is used to refresh the token backing the current session immediately after the service call succeeds, so the user isn't bounced to `/login`. Alternative considered: force sign-out + redirect to login post-change — rejected as unnecessarily disruptive for a same-device change, and the user confirmed "re-sign current session only" during exploration.

**No new session-version/db-revocation mechanism for other devices.**
Explicitly deferred. Building this properly (a `sessions` table or a `password_changed_at` claim checked on every request) is a bigger architectural addition than this feature warrants, and was explicitly scoped out during exploration. Flagged as a known follow-up, not silently dropped.

**Header changes from flat items to a dropdown.**
`navbar-end` in `dashboard/layout.tsx` wraps the existing `{email}` text as a dropdown trigger (FlyonUI dropdown component, matching existing design system — no new UI library). Dropdown contents: "Settings" link (`href="/dashboard/settings"`, or the password tab if no shell index page is desired) and the existing sign-out `<form>`, unchanged in behavior.

## Risks / Trade-offs

- **[Risk] Other-device sessions stay valid after a password change**, which is the opposite of most users' security expectation for a "somebody stole my password" scenario. → **Mitigation**: proposal.md and this design call it out explicitly as a known limitation; recommend as immediate follow-up work once a session-revocation mechanism exists, not silently shipped as if equivalent to full security.
- **[Risk] No rate limiting on the password-change action** means an attacker with a stolen session (e.g. via XSS) could brute-force nothing new (current password is required), but could still hammer the endpoint. → **Mitigation**: current-password requirement already bounds the blast radius to "attacker already has a valid session," which is a pre-existing trust boundary in this app; formal rate limiting remains a cross-cutting follow-up, not specific to this feature.
- **[Risk] Re-signing the JWT mid-session depends on NextAuth v5 beta's `session.update()` behavior**, which may have rough edges since the app is on a beta release. → **Mitigation**: verify behavior in the target NextAuth version during implementation; fall back to a full session refetch (redirect to same page after change) if `update()` proves unreliable, without changing the spec-level requirement (session must remain valid).

## Migration Plan

No data migration needed — `users.password_hash` already exists and is already populated for all users. Deployment is additive: new routes, new header markup, no changes to existing tables or existing auth flows (login/registration/logout untouched). Rollback is a straightforward revert of the added routes/components/action; no data cleanup required since no new columns or tables are introduced.
