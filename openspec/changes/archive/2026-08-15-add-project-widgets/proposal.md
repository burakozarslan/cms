## Why

A project today is an empty silo. `src/app/dashboard/[projectId]/page.tsx` renders a placeholder card that says "Content types and fields arrive in a later change" — this is that change.

Tenants need to define the *shape* of their content (a "Blog Post" has a title, a body, a publish date, a published flag) and then author content against that shape. Following the Decap/Netlify CMS vocabulary the project has adopted, the field-level building block is a **widget**: a field's input type, its configuration, and the value shape it produces.

Widgets are the gate on nearly everything downstream. Media/Cloudinary is a widget. Relations are a widget. The public read API serializes widget values. Getting the widget registry and the value-storage model right now is what keeps those later changes additive.

## What Changes

Introduces the full content model — schema layer and content layer — for a project:

```
tenants ──< projects ──< collections ──< fields
                              │            ▲  │
                    title_field_id ────────┘  │ on delete cascade
                              └──< entries ──< entry_values
```

- **Collections** (`collections`): named content types within a project, slug unique per project. A collection designates one of its fields as the display title.
- **Fields** (`fields`): ordered, drag-reorderable field definitions on a collection. Each has a machine `key`, a human `label`, a `widget` type, a `required` flag, and a JSON `config` blob whose shape is determined by the widget type.
- **Entries** (`entries`): content records in a collection, each with its own slug (unique per collection) and a `draft`/`published` status.
- **Entry values** (`entry_values`): one row per (entry, field), value stored as JSON, cascading on field delete.
- **Widget registry**: a single Zod discriminated union — keyed on widget type — supplying, per widget: a config schema, a value-schema factory (`config -> ZodType`), a config-form component, and a value-input component.

Six widget types ship in this change:

| Widget | Config | Value |
|---|---|---|
| `string` | `maxLength?` | string |
| `text` | `rows?`, `maxLength?` | string |
| `select` | `options[]`, `multiple?` | string \| string[] |
| `number` | `min?`, `max?`, `step?`, `valueType: "string"\|"int"\|"float"` | string \| number |
| `boolean` | — | boolean |
| `datetime` | `dateOnly?`, `format?` | ISO 8601 string |

- **BREAKING**: none. Additive schema and new routes only; the placeholder card on the project page is replaced by the collections list.

Explicitly out of scope (deferred to later changes):

- **`richtext`** — the Lexical-based editor. Deferred deliberately: it is client-only, pulls ~80KB of new dependencies (`lexical`, `@lexical/react`, `@lexical/rich-text`, and friends), and carries its own serialization decision (`EditorState` JSON vs. HTML). Because `config` and `value` are already JSON columns and `fields.widget` carries no CHECK constraint, adding it later is one registry entry and **zero migrations**.
- Media/Cloudinary widget, relation/reference widget, list/object (nested) widgets.
- Public read API for entries, and FTS5 search over entry values.
- Per-entry revision history, scheduled publishing, localization.
- Roles/permissions — any authenticated member of the tenant may edit any collection in it.

## Capabilities

### New Capabilities

- `content-modeling`: Defining collections and their fields within a project — widget types, per-widget configuration, machine key vs. display label, ordering, the designated title field, and the destructive-delete rules for fields.
- `content-entries`: Authoring content against a collection — creating, listing, editing, and deleting entries; server-side validation of values against the collection's current field definitions; draft/published status; entry slugs.

### Modified Capabilities

- `project-management`: the project workspace gains a collections list in place of the placeholder card. No existing requirement changes; no delta spec is emitted for it.
- `tenant-data-access`: no requirement change, but all four new tables are registered in `TENANT_SCOPED_TABLES` in the same migration, per the standing invariant.

## Impact

**New code**
- `db/migrations/002_content_model.ts`
- `src/lib/db/types.ts`, `src/lib/db/tables.ts` — four new table interfaces; `TENANT_SCOPED_TABLES` grows to six entries
- `src/lib/widgets/` — the registry: per-widget config schema, value-schema factory, and metadata
- `src/lib/collections/service.ts`, `src/lib/entries/service.ts`
- `src/app/dashboard/[projectId]/` — collections list, collection editor (field builder), entry list, entry editor; server actions alongside
- `src/frontend/ui/` — additions needed by the field builder and value inputs (select, textarea, toggle/switch, datetime input, drag handle), wrapping FlyonUI per the `@frontend/ui` boundary rule

**New dependencies**
- One drag-and-drop library for field reordering (`@dnd-kit/core` + `@dnd-kit/sortable`, or HTML5 drag events with no dependency — see design.md Open Questions). No other new runtime dependencies; notably, no Lexical in this change.

**Database & indexing (multi-tenant performance)**
- Four tables, each carrying `tenant_id` and each registered as tenant-scoped.
- Indexes: `collections(project_id)`, unique `collections(project_id, slug)`; `fields(collection_id)`, unique `fields(collection_id, key)`; `entries(collection_id)`, unique `entries(collection_id, slug)`; `entry_values(entry_id)`, unique `entry_values(entry_id, field_id)`, plus `entry_values(field_id)` to keep the cascade delete and the title-value lookup cheap.
- The entry list needs each entry's *title value*, which lives in `entry_values`, not on `entries`. That is a single join filtered on `collections.title_field_id` — **not** a per-row lookup. Avoiding an N+1 here is an explicit implementation requirement, and is covered by a task.
- No functional/`json_extract` indexes in this change: nothing filters or sorts by arbitrary widget value yet. When the public read API arrives, FTS5 over text-bearing values is the intended route, per the standing invariant against per-tenant functional indexes.

**Runtime Zod schema caching**
Validators are derived from field definitions on every entry save and every entry render, so a naive implementation re-reads `fields` per request. Field definitions are loaded once per request via React's `cache()`, and the derived Zod schema is memoized in an in-memory LRU keyed by `collection_id` + a schema version. `collections.schema_version` is bumped whenever any of its fields is created, updated, reordered, or deleted, which makes cache invalidation a key change rather than an eviction call. See design.md decision 6.

**Tenant isolation boundary**
- `projectId`, `collectionId`, and `entryId` all arrive from the URL and are all untrusted. Every lookup runs through `getTenantDb(session.user.tenantId)`, so a cross-tenant id returns no row and falls through to `notFound()` — existence and ownership stay the same check, exactly as `findProject` does today.
- Parent-child containment is also verified, not assumed: an entry id must belong to the addressed collection, which must belong to the addressed project. Tenant scoping alone does not prevent one tenant from addressing their *own* entry under the wrong collection's URL.
- `tenant_id` is never read from a form field, param, or header.

**Cloudinary / credential encryption**
Not applicable to this change — no third-party credentials are stored or transmitted. The media widget that will require it is explicitly out of scope.

**Rollback & data migration**
- Forward migration is purely additive; no existing table is altered and no existing row is touched, so deploying it cannot break the current app.
- `down()` drops `entry_values`, `entries`, `fields`, `collections` in FK order. Because nothing predating this change reads these tables, rollback is the `down()` plus reverting the feature branch — with the ordinary caveat that rolling back **destroys all authored content**, which is why the rollback path must be exercised against a throwaway database, not production.
- No JSON payload migration is needed: `config` and `value` are new columns with no legacy shapes to convert. The first payload migration will come with a future widget config change, which is why every stored `config` is parsed through the registry on read rather than trusted — an unknown or malformed config surfaces as a clear error rather than a crash.
