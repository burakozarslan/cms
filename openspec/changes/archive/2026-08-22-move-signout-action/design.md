## Context

See proposal.md - Why. `signOutAction` is currently defined inline in `src/app/dashboard/layout.tsx` (a `"use server"` function wrapping `signOut` from `@/lib/auth`). `src/app/dashboard/actions.ts` already holds the other dashboard server actions (`createProjectAction`, `updateProjectAction`, `deleteProjectAction`), each following the pattern: `requireSession()` → redirect to `/login` if absent → perform the action.

## Goals / Non-Goals

**Goals:**
- Relocate `signOutAction` into `src/app/dashboard/actions.ts` so all dashboard server actions live in one file.
- Preserve exact current behavior: calling `signOut({ redirectTo: "/login" })` from NextAuth.

**Non-Goals:**
- No change to the sign-out UX, the `DropdownItem`/`Button` markup, or the dashboard header layout.
- No session-guard added to `signOutAction` — signing out doesn't require reading `session.user.tenantId` the way the other actions do, so it doesn't need the `requireSession()` check they use.

## Decisions

- **Move, don't wrap**: cut `signOutAction` from `layout.tsx` and paste it into `actions.ts` as a named export, then import it in `layout.tsx`. Considered leaving a re-export shim in `layout.tsx` for backward compatibility, but nothing else imports it from there, so a shim would be dead code.
- **Placement in actions.ts**: add it after the existing action exports (append at the end) rather than reordering the file, to keep the diff minimal.

## Risks / Trade-offs

- [Something else in the app imports `signOutAction` from `layout.tsx`] → Mitigation: grep confirms it's only referenced within `layout.tsx` itself before this change.
