## Why

Projects and Collections can be created and deleted, but their names can never be changed afterward. A typo or an outdated name (e.g. renaming "Blog" to "Marketing Blog") currently forces users to delete and recreate the entity, which is destructive (loses all collections/fields/entries under a project) and disconnects any existing content from its original context. Users need a straightforward way to rename a Project or Collection without disturbing its id, slug, or associated data.

## What Changes

- Add `updateProject` to `src/lib/projects/service.ts`: validates the new name with the existing `projectNameSchema`, updates the `name` column only, and leaves `slug` untouched (slug remains derived from the name at creation time and is immutable thereafter, matching current behavior for all other entities).
- Add `updateCollection` to `src/lib/collections/service.ts`: same pattern, scoped by `project_id`, name-only update, slug untouched.
- Add `updateProjectAction` server action (`src/app/dashboard/actions.ts`) and `updateCollectionAction` server action (`src/app/dashboard/[projectId]/actions.ts`), following the existing `create*Action` conventions (tenant-scoped, redirects/revalidates on success, returns field errors on validation failure).
- Add a rename UI affordance to the project card (`src/app/dashboard/page.tsx`) and collection card (`src/app/dashboard/[projectId]/page.tsx`), next to the existing Delete button, using an inline edit form modeled on the dual-purpose create/edit pattern already used by `field-form.tsx`.
- No changes to slug generation, uniqueness constraints, or deletion behavior.

## Capabilities

### New Capabilities
(none — this extends existing capabilities' requirements)

### Modified Capabilities
- `project-management`: adds a requirement that a project's name can be updated after creation, with validation and tenant-scoped access control equivalent to creation.
- `content-modeling`: adds a requirement that a collection's name can be updated after creation, with validation and project-scoped access control equivalent to creation.

## Impact

- **Code**: `src/lib/projects/service.ts`, `src/lib/collections/service.ts`, `src/app/dashboard/actions.ts`, `src/app/dashboard/[projectId]/actions.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/[projectId]/page.tsx`. Likely a small new/shared form component for the inline rename UI.
- **Data**: No migration needed — reuses the existing `name` column on `projects` and `collections`. `slug`, `id`, and all foreign-key relationships (fields, entries, content) are untouched, so renaming is non-destructive and requires no data backfill.
- **APIs**: No public/external API surface changes — this is a dashboard UI + server action feature. If a REST endpoint for projects/collections exists, it stays additive (new `PATCH`/update handler), not breaking.
- **Tenant isolation**: Update operations must be scoped by `tenant_id` (projects) and `project_id` within the caller's tenant (collections), reusing the same lookup/ownership checks already applied in `create*`/`delete*` service functions.
</content>
