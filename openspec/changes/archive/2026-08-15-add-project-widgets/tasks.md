## 1. Database Schema

- [x] 1.1 Write `db/migrations/002_content_model.ts` creating `collections` (with `title_field_id`, `schema_version`), `fields`, `entries`, `entry_values` per design.md — Migration Plan
- [x] 1.2 Add indexes: `collections(project_id)` + unique `(project_id, slug)`; `fields(collection_id)` + unique `(collection_id, key)`; `entries(collection_id)` + unique `(collection_id, slug)`; `entry_values` unique `(entry_id, field_id)` + index on `field_id`
- [x] 1.3 Set `entry_values.field_id` and `entry_values.entry_id` FKs to `ON DELETE CASCADE`; `collections.title_field_id` to `ON DELETE SET NULL` (resolve the circular-FK question from design.md — Open Questions)
- [x] 1.4 Add the four table interfaces to `src/lib/db/types.ts`, using the existing `TenantId` column type for `tenant_id`
- [x] 1.5 Add `collections`, `fields`, `entries`, `entry_values` to `TENANT_SCOPED_TABLES` in `src/lib/db/tables.ts` — same change as the migration, per AGENTS.md
- [x] 1.6 Write `down()` dropping in reverse FK order, and run migrate up/down/up against a throwaway database to confirm both directions work

## 2. Widget Registry

- [x] 2.1 Create `src/lib/widgets/` with a per-widget module exposing `configSchema`, `valueSchema(config)`, and display metadata (label, description, icon)
- [x] 2.2 Implement the six widget types — `string`, `text`, `select`, `number`, `boolean`, `datetime` — per the config/value table in proposal.md
- [x] 2.3 Compose the registry as a Zod discriminated union on `widget`; export a `widgetTypes` list for the type picker (richtext deliberately absent)
- [x] 2.4 Implement `parseFieldConfig(row)` that validates stored config on read and returns a distinguishable "misconfigured" result rather than throwing
- [x] 2.5 Implement `buildEntrySchema(fields)` composing a Zod object from field definitions, honouring `required` and each field's config
- [x] 2.6 Implement the schema cache: per-request memoization via React `cache()`, plus a process-local LRU keyed by `collection_id:schema_version` (design.md decision 6)
- [x] 2.7 Unit test each widget's `configSchema` and `valueSchema` — valid cases, boundary cases, and the rejections named in the specs (select options, number bounds/value type, datetime parseability, cross-type config)

## 3. Collections & Fields (service layer)

- [x] 3.1 `src/lib/collections/service.ts`: `listCollections(tenantId, projectId)`, `findCollection`, `createCollection` — slug via the existing `slugify`/`nextAvailableSlug` helpers, verifying the project belongs to the tenant
- [x] 3.2 `createField` — validate key format `^[a-z][a-z0-9_]*$`, validate config through the registry, append at last position, bump `schema_version`, all in one transaction
- [x] 3.3 `updateField` — allow `key`, `label`, `required`, `config`; reject any attempt to change `widget` (design.md decision 5); bump `schema_version`
- [x] 3.4 `reorderFields(collectionId, orderedFieldIds)` — reject the request if the id set does not exactly match the collection's fields; rewrite all positions and bump `schema_version` in one transaction
- [x] 3.5 `countFieldValues(fieldId)` for the delete confirmation, and `deleteField` performing the cascading hard delete
- [x] 3.6 `setTitleField(collectionId, fieldId)`, and `resolveTitleField(collection, fields)` implementing the fallback chain (designated → first string field by position → slug → placeholder)
- [x] 3.7 Ensure every function takes `tenantId` and queries through `getTenantDb`, and that parent containment (`collection.project_id === projectId`) is verified explicitly, not assumed from tenant scoping

## 4. Collection & Field Builder UI

- [x] 4.1 Replace the placeholder card in `src/app/dashboard/[projectId]/page.tsx` with the collections list plus empty state
- [x] 4.2 Create-collection form + server action, following the existing `create-project-form.tsx` pattern
- [x] 4.3 `/dashboard/[projectId]/[collectionId]` — the field builder: ordered field list, add-field flow, per-field edit
- [x] 4.4 Widget type picker (six types) driving a per-widget config form rendered from the registry
- [x] 4.5 Drag reordering — settle the library question in design.md — Open Questions; keyboard-operable; optimistic client update, server response authoritative
- [x] 4.6 Delete-field confirmation dialog stating the affected entry count
- [x] 4.7 Title-field designation control on the collection
- [x] 4.8 Add any needed `@frontend/ui` wrappers (select, textarea, toggle, datetime input, dialog, drag handle) — query the FlyonUI MCP first, wrap FlyonUI rather than importing it directly outside `@frontend/ui`

## 5. Entries (service layer)

- [x] 5.1 `src/lib/entries/service.ts`: `listEntries(tenantId, collectionId)` resolving display titles with a single join on `title_field_id` — no per-entry query (design.md decision 7)
- [x] 5.2 `findEntry` returning the entry plus its values pivoted by `field_id`, verifying the entry belongs to the addressed collection
- [x] 5.3 `createEntry` — validate values through `buildEntrySchema`, generate the slug from the resolved title value with fallback, default status `draft`, write entry + values in one transaction
- [x] 5.4 `updateEntry` — re-derive the schema from *current* field definitions, validate, write changed values, leave the slug untouched, update `updated_at`
- [x] 5.5 Reject values keyed to fields outside the collection, before any write
- [x] 5.6 `deleteEntry` — hard delete cascading to `entry_values`
- [x] 5.7 `setEntryStatus` validating against `draft | published`

## 6. Entry UI

- [x] 6.1 `/dashboard/[projectId]/[collectionId]` entry list — labelled rows, status indicator, empty state prompting first entry
- [x] 6.2 `/dashboard/[projectId]/[collectionId]/[entryId]` entry editor rendering inputs from the registry in field order
- [x] 6.3 Value input components for the six widgets, server-rendered with client islands only where interactivity requires it (design.md decision 12)
- [x] 6.4 Save action surfacing per-field validation errors returned by the server
- [x] 6.5 Publish/unpublish control and delete-entry confirmation

## 7. Tests

- [x] 7.1 Unit: widget config and value schemas (covered by 2.7 — verify every spec scenario in `content-modeling` "Widget configuration is validated" has a test)
- [x] 7.2 Unit: key format validation, duplicate key rejected within a collection, same key allowed across collections
- [x] 7.3 Unit: widget type immutable after creation
- [x] 7.4 Unit: reorder is atomic, rejects foreign field ids, and persists the submitted order
- [x] 7.5 Unit: renaming a field's key or label leaves all stored values intact
- [x] 7.6 Unit: deleting a field deletes exactly its values, leaves sibling values intact, and nulls `title_field_id` when it was the title field
- [x] 7.7 Unit: server-side value validation rejects out-of-bounds numbers, unknown select options, fractional integers, unparseable datetimes, and missing required values
- [x] 7.8 Unit: validation uses current field definitions, not those in effect when the editor loaded
- [x] 7.9 Unit: a newly required field leaves existing entries readable but blocks their next save
- [x] 7.10 Unit: slug derived from title, disambiguated on collision, stable across title edits, falls back when no usable title
- [x] 7.11 Integration: entry list query count is independent of entry count (the N+1 guard)
- [x] 7.12 Integration: tenant A cannot read, edit, or delete tenant B's collection, field, or entry by id substitution
- [x] 7.13 Integration: containment is enforced — an entry addressed under the wrong collection, and a collection under the wrong project, are both refused even within one tenant
- [x] 7.14 Integration: `tenant_id` supplied in a form field or query string is ignored in favour of the session's
- [x] 7.15 Test asserting every tenant-owned table in migration 002 appears in `TENANT_SCOPED_TABLES`
- [x] 7.16 Run focused tests for this change, then the full suite, before marking complete
