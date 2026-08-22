## 1. Relocate the sign-out action

- [x] 1.1 In `src/app/dashboard/actions.ts`, add `signOutAction` (importing `signOut` from `@/lib/auth`), matching the existing `signOutAction` body from `layout.tsx` (`await signOut({ redirectTo: "/login" })`).
- [x] 1.2 In `src/app/dashboard/layout.tsx`, remove the inline `signOutAction` function and the now-unused `signOut` import from `@/lib/auth`.
- [x] 1.3 In `src/app/dashboard/layout.tsx`, import `signOutAction` from `./actions` and reference it in the existing `<form action={signOutAction}>`.

## 2. Verify

- [x] 2.1 Confirm no other file imports `signOutAction` from `layout.tsx` (grep for `signOutAction`).
- [x] 2.2 Run the dashboard locally (or `npx tsc --noEmit`) and confirm the "Sign out" `DropdownItem` still signs the user out and redirects to `/login`.
