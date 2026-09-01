## Why

Tenants can create projects and collections but have no way to remove them. Once created, a project or collection is permanent — a mistaken or unwanted create can never be undone from the UI, and there's no way to clean up dead projects or unused collections as content models evolve.

## What Changes

- Add a delete action for projects, reachable from the project dashboard (`src/app/dashboard/page.tsx`), owner-only, requiring confirmation before it runs.
- Add a delete action for collections, reachable from a project's collection list (`src/app/dashboard/[projectId]/page.tsx`), owner-only, requiring confirmation before it runs.
- Both deletes are destructive and cascade: deleting a project permanently removes its collections, fields, entries, and entry values; deleting a collection permanently removes its fields, entries, and entry values. The confirmation dialog states what will be lost (counts of collections/entries affected), following the existing field-delete pattern (`src/frontend/ui/confirm-dialog.tsx`, `deleteFieldAction`).
- Add `deleteProject` to `src/lib/projects/service.ts` and `deleteCollection` to `src/lib/collections/service.ts`, plus corresponding server actions (`deleteProjectAction`, `deleteCollectionAction`) and count helpers to power the confirmation warning (e.g. `countCollectionsByProject`, `countEntriesByProject`, `countEntriesByCollection`).
- **BREAKING**: none — this is a purely additive capability (no existing API/behavior removed or changed for non-deleted records).

## Capabilities

### New Capabilities
(none — delete is a new requirement on existing capabilities, not a new capability)

### Modified Capabilities
- `project-management`: adds a requirement that an authenticated tenant can delete a project they own, with confirmation and cascading removal of its contents.
- `content-modeling`: adds a requirement that an authenticated tenant can delete a collection they own, with confirmation and cascading removal of its fields, entries, and values.

## Impact

- **Code**: `src/lib/projects/service.ts`, `src/lib/collections/service.ts`, `src/app/dashboard/actions.ts`, `src/app/dashboard/[projectId]/actions.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/[projectId]/page.tsx`. Reuses `src/frontend/ui/confirm-dialog.tsx` — no new UI component needed.
- **Data / migrations**: none — `projects.tenant_id`, `collections.project_id`, `fields`/`entries`/`entry_values` FKs already declare `onDelete("cascade")` (`db/migrations/001_initial.ts`, `002_content_model.ts`). No schema change; must confirm the SQLite connection enables `PRAGMA foreign_keys = ON` so cascade actually fires, otherwise cascade must be done in application code within a transaction.
- **Tenant isolation**: delete actions must scope lookups by `tenant_id` (via the existing tenant-aware query wrapper) so a tenant can never delete another tenant's project or collection, mirroring the existing ownership checks used for project/collection reads.
- **Performance/indexing**: existing unique indexes on `(tenant_id, slug)` and `(project_id, slug)` are unaffected; delete is a single cascading operation keyed by primary key/FK indexes already in place, no new indexes required.
- **Rollback**: hard delete is irreversible by design (matches the existing field-delete precedent); rollback plan is standard code revert only — there is no soft-delete/undo in scope for this change.
