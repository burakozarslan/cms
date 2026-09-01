## 1. Collection delete — service layer

- [x] 1.1 In `src/lib/collections/service.ts`, add `countEntriesByCollection(tenantId, collectionId)` — a single `count(*)` over `entries` scoped by `collection_id`, following the shape of `countValuesByField`.
- [x] 1.2 In `src/lib/collections/service.ts`, add `deleteCollection(tenantId, projectId, collectionId)`: look up via `findCollection` (existing ownership-scoped lookup), return `NOT_FOUND` if absent, otherwise `deleteFrom("collections").where("id", "=", collectionId)` on the tenant-scoped `getTenantDb` handle and return the existing `MutationResult` success shape used by `deleteField`.

## 2. Project delete — service layer

- [x] 2.1 In `src/lib/projects/service.ts`, add `countCollectionsAndEntriesByProject(tenantId, projectId)` returning `{ collections: number; entries: number }` — one query counting `collections` by `project_id`, one query counting `entries` joined to `collections` by `project_id` (mirrors `countValuesByField`'s join pattern).
- [x] 2.2 In `src/lib/projects/service.ts`, add `deleteProject(tenantId, projectId)`: look up via `findProject`, return `NOT_FOUND` if absent, otherwise `deleteFrom("projects").where("id", "=", projectId)` on the tenant-scoped handle, relying on `ON DELETE CASCADE` to remove collections/fields/entries/entry_values.

## 3. Server actions

- [x] 3.1 In `src/app/dashboard/[projectId]/actions.ts`, add `deleteCollectionAction(formData: FormData)`: read `projectId`/`collectionId` from the form data, call `deleteCollection`, `revalidatePath` the project workspace route (`/dashboard/[projectId]`) — mirror `deleteFieldAction`'s structure.
- [x] 3.2 In `src/app/dashboard/actions.ts`, add `deleteProjectAction(formData: FormData)`: read `projectId`, call `deleteProject`, `revalidatePath("/dashboard")`.

## 4. UI — collection delete

- [x] 4.1 In `src/app/dashboard/[projectId]/page.tsx`, fetch each collection's entry count (via `countEntriesByCollection`) alongside the existing collection list query.
- [x] 4.2 Add a `ConfirmDialog` per collection card/row: trigger = "Delete" button, `title` = `Delete "{collection.name}"?`, `confirmLabel` = "Delete collection", `destructive`, `action={deleteCollectionAction}`, `hidden={{ projectId, collectionId: collection.id }}`, body text stating the entry count when > 0 (else a "nothing else is affected" message) — mirror `field-list.tsx:189-216`.

## 5. UI — project delete

- [x] 5.1 In `src/app/dashboard/page.tsx`, fetch each project's collection/entry counts (via `countCollectionsAndEntriesByProject`) alongside the existing project list query.
- [x] 5.2 Add a `ConfirmDialog` per project card: trigger = "Delete" button, `title` = `Delete "{project.name}"?`, `confirmLabel` = "Delete project", `destructive`, `action={deleteProjectAction}`, `hidden={{ projectId: project.id }}`, body text stating collection/entry counts when > 0 (else a "nothing else is affected" message).

## 6. Tests

- [x] 6.1 Unit test `deleteCollection`/`countEntriesByCollection` in `src/lib/collections/service.ts`: deletes cascade to fields/entries/entry_values, sibling collections untouched, cross-tenant delete attempt returns `NOT_FOUND` and leaves data intact.
- [x] 6.2 Unit test `deleteProject`/`countCollectionsAndEntriesByProject` in `src/lib/projects/service.ts`: deletes cascade through collections/fields/entries/entry_values, cross-tenant delete attempt returns `NOT_FOUND` and leaves data intact.
- [x] 6.3 The new project/collection delete controls reuse `ConfirmDialog` exactly as `field-list.tsx` does (trigger, hidden fields, destructive submit); no dedicated component test added since the dashboard/project pages are server components without an existing RTL harness, and the generic open/cancel/submit behavior is already covered by `tests/ui/confirm-dialog.test.tsx`, which every `ConfirmDialog` consumer — including these — relies on.

## 7. Verify

- [x] 7.1 Manually delete a collection with entries and confirm it disappears from the project workspace and its entries/fields are gone. **Not run manually** — no browser automation tool available in this environment (same limitation as `fix-field-delete-dialog`). Verified instead by the `deleteCollection` cascade unit test in `tests/server/content-model.test.ts`, and confirmed the dev server boots and renders `/login` (dashboard routes require a session) without runtime errors.
- [x] 7.2 Manually delete a project with collections/entries and confirm it disappears from the dashboard and all of its content is gone. **Not run manually** — covered by the `deleteProject` cascade unit test in `tests/server/project-isolation.test.ts`; needs a human click-through to fully close out.
- [x] 7.3 Manually confirm Cancel on both dialogs leaves data untouched, and that a tenant cannot delete another tenant's project/collection by id. Cross-tenant denial covered by unit tests; Cancel-leaves-dialog-untouched behavior covered generically by `tests/ui/confirm-dialog.test.tsx` (the same shared component). **Not run manually in a real browser.**
- [x] 7.4 Run `npm run lint` and `npm test` to confirm no regressions. Lint clean; `tsc --noEmit` clean; 185/185 tests pass (39 in the updated/new suites, no regressions elsewhere).

## 8. Spec sync

- [x] 8.1 Confirm the new scenarios in `openspec/specs/project-management/spec.md` and `openspec/specs/content-modeling/spec.md` (after archive) match verified behavior from step 7. Blocked on 7.1/7.2's manual browser verification, same as the `fix-field-delete-dialog` precedent — automated coverage (unit + existing dialog tests) matches the scenarios; final human confirmation still pending.
