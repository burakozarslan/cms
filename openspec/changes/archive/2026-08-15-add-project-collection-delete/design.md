## Context

See proposal.md - Why / What Changes for motivation and scope.

Relevant existing state:
- `db/migrations/001_initial.ts` / `002_content_model.ts`: `collections.project_id` → `projects.id` `onDelete("cascade")`; `fields.collection_id`, `entries.collection_id` → `collections.id` `onDelete("cascade")`; `entry_values.entry_id`, `entry_values.field_id` → `onDelete("cascade")`; `collections.title_field_id` → `fields.id` `onDelete("set null")`.
- `src/lib/db/client.ts:24` already calls `database.pragma("foreign_keys = ON")` on every connection, so SQLite enforces these cascades natively — deletion does not need to walk child tables by hand.
- `src/lib/db/client.ts` exposes `getTenantDb(tenantId)`, wrapped by `TenantScopePlugin`, which is the only sanctioned way to touch tenant-owned tables from server actions.
- The field-delete precedent (`src/lib/collections/service.ts` `deleteField`, `countFieldValues`; `src/app/dashboard/[projectId]/[collectionId]/actions.ts` `deleteFieldAction`; `src/frontend/ui/confirm-dialog.tsx` `ConfirmDialog`; usage in `field-list.tsx:189-216`) is the exact shape to replicate: a service function that re-checks ownership before deleting, a count helper to power the warning text, a thin server action wrapping the service call plus `revalidatePath`, and a `ConfirmDialog` trigger with `hidden` fields carrying the ids.

## Goals / Non-Goals

**Goals:**
- Delete a project or collection in one confirmed action, relying on DB-level `ON DELETE CASCADE` rather than manually deleting child rows table-by-table.
- Keep the confirmation warning accurate (counts of collections/entries that will be lost) without N+1 queries.
- Reuse `ConfirmDialog` and the `deleteField` service/action shape as-is — no new dialog component, no new action-wiring pattern.

**Non-Goals:**
- Soft delete, trash/undo, or any recovery window — matches the existing hard-delete precedent for fields and entries.
- Archiving or exporting a project/collection's data before deletion.
- Bulk delete (multi-select) of projects or collections.

## Decisions

**Decision: Rely on SQLite `ON DELETE CASCADE` for the actual data removal; service functions only re-verify ownership and compute warning counts.**
The schema already cascades project → collections → fields/entries → entry_values, and the connection already runs with `foreign_keys = ON`. `deleteProject`/`deleteCollection` therefore reduce to: look up the row scoped by `tenantId` (reusing `findProject`/`findCollection` — absence means "not found or not owned," identical to the existing read-path check), then `deleteFrom(...).where("id", "=", id)` inside the tenant-scoped `getTenantDb` handle. No transaction spanning multiple `deleteFrom` calls is needed since one statement plus the DB's own cascade does the whole job atomically.
- *Alternative considered*: delete child rows explicitly in a `db.transaction()` (collections → fields/entries → entry_values) before deleting the parent, mirroring an app that couldn't trust FK cascade. Rejected — the FK pragma is already on globally, cascade is already relied upon for `title_field_id` (`set null`) and `deleteField`'s own field→entry_values cascade, and adding manual cascade logic would duplicate the schema's own guarantee and could drift from it over time.

**Decision: Add two count helpers — `countCollectionsAndEntriesByProject` and `countEntriesByCollection` — rather than reusing `countFieldValues`'s per-item pattern.**
The project-delete warning needs two numbers (collection count, entry count across all of the project's collections) in one round trip; the collection-delete warning needs one (entry count). Both follow `countValuesByField`'s grouped-query shape (`src/lib/collections/service.ts:474-514`): a single `selectFrom` with `innerJoin`/`where` scoped by the parent id, no loop over children.
- *Alternative considered*: compute counts client-side by calling `listCollections`/`listEntries` and taking `.length`. Rejected — pulls full rows over the wire just to count them, and diverges from the `countFieldValues` precedent of a dedicated `count(*)` query.

**Decision: `deleteProjectAction` and `deleteCollectionAction` follow `deleteFieldAction`'s exact shape** (`src/app/dashboard/[projectId]/[collectionId]/actions.ts:130`): read ids from `FormData`, call the service function, `revalidatePath` on the parent list route, return `void`. Placed in `src/app/dashboard/actions.ts` (project delete) and `src/app/dashboard/[projectId]/actions.ts` (collection delete) — colocated with the existing `createProjectAction`/`createCollectionAction` in the same files, not a new actions module.

**Decision: Confirmation copy states counts, matching `deleteField`'s "values in N entries" phrasing** — e.g. project: "This will permanently delete N collections and M entries. This cannot be undone." / collection: "This will permanently delete M entries. This cannot be undone." When counts are zero, the dialog still requires confirmation but omits the affected-content claim (per the "Empty project deletes without a content warning" scenario), same branching `field-list.tsx:200-214` already does for `valueCount === 0`.

## Risks / Trade-offs

- [Cascade delete on a large project (many collections/entries/entry_values) runs as one big SQLite operation with no progress feedback] → acceptable for this app's expected scale (matches the existing unbounded `deleteField` cascade); no pagination/background-job infra exists elsewhere to justify adding one here.
- [Two new count queries per delete-dialog render add DB round trips to already-loaded list pages] → each dialog is only rendered when its trigger is present (one row = one dialog, same as field rows today), and counts are simple indexed `count(*)`/`group by` queries, consistent with existing `countValuesByField` cost.
- [Hard delete is irreversible — a slipped confirm destroys a project's entire content model] → mitigated only by the existing `ConfirmDialog` UX (explicit trigger, explicit destructive submit button, Cancel is a real no-op per the `fix-field-delete-dialog` change); no further mitigation (e.g. type-to-confirm) is in scope, matching the bar set by field/entry delete today.
