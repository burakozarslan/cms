## Why

The sign-out server action currently lives inline in `src/app/dashboard/layout.tsx`, while every other dashboard server action (`createProjectAction`, `updateProjectAction`, `deleteProjectAction`) lives in `src/app/dashboard/actions.ts`. Sign-out already works end-to-end (NextAuth `signOut` wired to a `DropdownItem` in the dashboard header); this change only relocates it to the project's established actions convention so all dashboard server actions are discoverable in one place.

## What Changes

- Move `signOutAction` out of `src/app/dashboard/layout.tsx` and into `src/app/dashboard/actions.ts`, alongside the other dashboard server actions.
- Update `layout.tsx` to import `signOutAction` from `./actions` instead of defining it inline.
- No change to behavior, route, or UI — the `DropdownItem` in the dashboard header continues to render the same "Sign out" button and form.

## Capabilities

### New Capabilities
None — pure code relocation, no new behavior.

### Modified Capabilities
None — no requirement-level behavior changes. `skip_specs: true` is set in `.openspec.yaml`.

## Impact

- `src/app/dashboard/layout.tsx`: remove inline `signOutAction`, import it from `./actions`.
- `src/app/dashboard/actions.ts`: add `signOutAction`, importing `signOut` from `@/lib/auth`.
- No API, schema, or dependency changes. No migration or rollback considerations beyond a standard revert.
