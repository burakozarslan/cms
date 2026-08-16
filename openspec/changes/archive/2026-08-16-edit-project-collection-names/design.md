## Context

Projects and Collections each have `create*`, `find*`, `list*`, and `delete*` service functions but no `update*` — see proposal.md for why this gap needs closing. The closest existing precedent is `updateField` (`src/lib/collections/service.ts:390-469`): parse with a Zod schema → load the existing row (tenant/parent-scoped) → run a transaction that updates only the changed columns → translate unique-constraint errors into field errors → return the fresh row. Name validation already exists and is reused unchanged: `projectNameSchema` (`src/lib/projects/service.ts:9-15`) and `collectionNameSchema` (`src/lib/collections/service.ts:51-57`), both trim + 1–80 chars.

Slugs are generated once at creation (`slugify` + `nextAvailableSlug`, `src/lib/projects/slug.ts`) and are never touched by any existing update path — `updateField`'s key rename doesn't regenerate anything derived from it either. `name` is not part of any unique index; only `slug` is (`projects_tenant_slug_unique`, `collections_project_slug_unique`).

## Goals / Non-Goals

**Goals:**
- Let a tenant rename a project they own, and a collection within a project they own.
- Reuse the existing name validation, tenant/parent scoping, and transaction conventions already established by `create*` and `updateField`.
- Keep the change additive: no schema migration, no slug behavior change, no impact on deletion or creation flows.

**Non-Goals:**
- Regenerating or editing the slug. It stays whatever was generated at creation, consistent with how field keys already behave after label/key edits.
- Enforcing name uniqueness. None exists today (only slugs are unique), and renaming does not need to introduce it.
- A generic "settings" page for projects/collections. The rename affordance is scoped to the existing card/list UI.

## Decisions

**Slug stays immutable on rename.** Alternative considered: regenerate the slug from the new name. Rejected because routes and foreign keys (`project_id`, `collection_id`) key off `id`, not slug, so a slug change buys nothing observable and would require re-running collision detection against siblings — extra complexity with no corresponding requirement. This mirrors the existing precedent that field renames never touch the field's `key`-derived identity implicitly.

**Service functions mirror `updateField`'s shape.** `updateProject(tenantId, projectId, input)` and `updateCollection(tenantId, projectId, collectionId, input)` each: parse `{ name }` with the existing name schema, load the existing row scoped by tenant (and by `project_id` for collections), update only the `name` column in a single statement (no transaction needed — it's a single-column, single-table write, unlike `updateField` which also bumps `schema_version`), and return the refreshed row. Not-found/not-owned collapses to the same `NOT_FOUND`-style result already used by other `find*`/`delete*` functions, so a tenant cannot distinguish "doesn't exist" from "not yours."

**Server actions follow the `create*Action` naming and error-return convention.** `updateProjectAction` in `src/app/dashboard/actions.ts` and `updateCollectionAction` in `src/app/dashboard/[projectId]/actions.ts`, each taking the id(s) plus form data, calling the service function, revalidating the relevant list path on success, and returning the same field-error shape `create*Action` already returns on failure (so existing form-error rendering can be reused).

**UI: inline rename, not a separate page.** Add an "Edit"/"Rename" toggle button next to the existing Delete button on project cards (`src/app/dashboard/page.tsx:60-100`) and collection cards (`src/app/dashboard/[projectId]/page.tsx:88-150`), following the toggle-to-inline-form pattern already used by `field-list.tsx:185-236` for fields. Clicking it swaps the name display for a small form (text input + Save/Cancel) that posts to the update action; no modal, no route change. This keeps the change confined to two existing files' render logic rather than introducing a new page or dialog pattern.

## Risks / Trade-offs

- [Renaming a project/collection to an empty or whitespace-only value] → Rejected before hitting the database by the existing `projectNameSchema`/`collectionNameSchema`, same as at creation.
- [A rename request racing a delete of the same project/collection] → The update's row lookup is scoped by tenant/project and re-checked immediately before the write; if the row is gone, it returns the same not-found result `delete*` already returns for a missing/foreign id, so the UI shows a normal error rather than corrupting state.
- [Confusing "rename" with "re-slug" from a user's perspective, since the URL-visible slug won't change] → Out of scope per the Decisions section above; the existing create flow already establishes that slugs are a one-time-generated identifier separate from the display name, so this doesn't introduce a new mental model.
</content>
