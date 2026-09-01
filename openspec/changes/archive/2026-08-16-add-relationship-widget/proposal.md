## Why

Content types need to reference each other — a Blog Post has an Author, a Blog Post has Tags — and today the widget system has no way to express "this field's value is another entry." Every existing widget stores a self-contained scalar or list; there is no way to model a relationship between two collections without stuffing a free-text id into a `string` field and hoping it stays correct. This adds a `relationship` widget so a field can reference one or more entries in another collection of the same project, laying the storage groundwork for a future public API to embed the referenced entry's data.

## What Changes

- Add `relationship` as a new widget type: `WidgetType`, the registry, `fieldWidgetSchema`, `widgetTypes`, following the existing `select`/`richtext` pattern.
- Config: `{ targetCollectionId, multiple? }`. Target collection must belong to the same project as the field's own collection; a collection targeting itself is rejected.
- Value: a bare entry-id string in single mode, an array of entry-id strings in multiple mode (mirrors `select`). Save-time validation confirms referenced ids exist as entries in the target collection.
- Extract the entry list's existing title-resolution logic (title field → first string field → slug → "Untitled") into a reusable function, and use it to label referenced entries in the picker and wherever a relationship value is displayed.
- New client-island picker in the entry editor: loads the target collection's entries once, filters client-side as the tenant types, single mode shows a clearable chip, multiple mode shows removable chips.
- New widget-config inputs: pick `targetCollectionId` from the project's other collections, toggle `multiple`.
- Deleting an entry gains a new warning: how many other entries reference it through a relationship field.
- Deleting a collection's existing warning gains a second count: how many relationship fields elsewhere target this collection.
- Dangling references (deleted entry, or a field whose target collection was deleted) are not blocked against — they surface as an unresolvable/broken reference on read, in the same spirit as the existing misconfigured-field handling. No new restriction on deleting entries or collections.

## Capabilities

### New Capabilities
- `relationship-widget`: the `relationship` widget type itself — config shape, value shape, save-time reference validation, the entry picker, and how a reference is displayed.

### Modified Capabilities
- `content-modeling`: widget type list gains `relationship`; the collection-delete warning gains a relationship-field count; field configuration validation gains the same-project / no-self-reference rule for `relationship`.
- `content-entries`: entry editor renders the relationship picker for `relationship` fields; entry-delete warning gains a referencing-entries count; submitted relationship values are validated against the target collection's actual entries.

## Impact

- `src/lib/widgets/`: new `relationship.ts`; `types.ts`, `registry.ts` gain the new type.
- `src/lib/widgets/entry-schema.ts` or a new module: save-time existence check against the target collection's entries (a DB read, not pure Zod, unlike every prior widget's `valueSchema`).
- `src/lib/collections/service.ts`: title-resolution extraction; new count queries — fields targeting a collection (cheap, `fields` table only), entries referencing a given entry (reaches into `entry_values.value` JSON via SQLite `json_each`/`json_extract` — new territory for this codebase).
- `src/app/dashboard/[projectId]/[collectionId]/`: `value-input.tsx`, `widget-config-inputs.tsx`, new picker client component, `entry-form.tsx`/delete-confirmation wiring for the new warning counts.
- No migration: `fields.config` and `entry_values.value` are already untyped JSON text columns: existing columns absorb the new shapes.
- No public API is added or changed by this work; the one-level-deep embed behavior it sets up for a future API is a storage-contract concern only.
