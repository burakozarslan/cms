## Why

`src/lib/widgets/types.ts` has carried a reserved-but-unimplemented `richtext` slot since `add-project-widgets`, with a comment explaining exactly why it was deferred: it's client-only, it pulls in Lexical, and it carries its own serialization decision. That change shipped six scalar-valued widgets; every one of them is an ordinary server-renderable form control. Tenants authoring long-form content (blog bodies, page copy) are stuck with the plain `text` widget — a bare `<textarea>` with no formatting — because nothing richer exists yet. This change fills the reserved slot.

## What Changes

- Adds a seventh widget type, `richtext`, backed by [Lexical](https://lexical.dev/) (`lexical` + `@lexical/react` + `@lexical/rich-text` + `@lexical/list` + `@lexical/link`).
- Stored value is the Lexical `EditorState` serialized via `getEditorState().toJSON()` — a structured node tree, not a scalar. This is the first widget whose `entry_values.value` is a JSON tree rather than a string/number/boolean.
- Config is fixed and effectively empty (`z.strictObject({})`, mirroring `boolean`): toolbar is bold, italic, underline, headings (H1–H3), ordered/unordered lists, and links — not configurable per field in this change.
- No `maxLength`/length validation on the value (no plain-text-length semantic is defined for a node tree yet); "required" is satisfied by a non-empty-document check.
- Editing UI is the first **client-only** widget in the registry: a `"use client"` Lexical component mounted from `value-input.tsx`'s switch, matching the "one more island" integration path anticipated in `add-project-widgets`' design.md decision 12.
- No image/media plugin, no table plugin — explicitly excluded (see Impact).
- No HTML rendering/serialization of stored content — there is still no public read API in this codebase, so turning the stored JSON into HTML is out of scope and deferred to whichever change adds that API.
- **BREAKING**: none. Purely additive: one new widget type, one new registry entry, two new `switch` cases in existing files.

## Capabilities

### New Capabilities

- `richtext-widget`: Defining and authoring `richtext` fields — the fixed Lexical toolbar surface, the config schema (empty), the stored value shape (Lexical JSON `EditorState`), and non-empty validation for required fields.

### Modified Capabilities

- `content-modeling`: the widget type enum gains `richtext`; field-builder config UI gains a (near-empty) config panel for it. No other requirement in `content-modeling` changes — the field CRUD, ordering, and title-field rules are untouched.
- `content-entries`: entry values gain a widget whose stored value is a JSON tree rather than a scalar; the "server-side validation of values against the collection's current field definitions" requirement now needs a JSON-tree branch, not just scalar branches.

## Impact

**New code**
- `src/lib/widgets/richtext.ts` — widget definition (config schema, value schema, metadata), following the exact shape of `boolean.ts`/`text.ts`.
- `src/lib/widgets/registry.ts` — new entry in the `widgets` map, `widgetTypes` array, and `fieldWidgetSchema` discriminated union.
- `src/lib/widgets/form.ts` — `configFromForm`/`valueFromForm` branches for `richtext` (config is trivial; value passes the client-produced JSON through, validated).
- `src/app/dashboard/[projectId]/[collectionId]/value-input.tsx` — new `case "richtext"`, rendering a new `"use client"` Lexical editor component (new file, e.g. `richtext-editor.tsx`) instead of the plain server-rendered controls the other six cases use.
- `src/app/dashboard/[projectId]/[collectionId]/widget-config-inputs.tsx` — new `case "richtext"` (likely a short explanatory line, no actual inputs, since config is empty — same treatment as `boolean`).

**New dependencies**
- `lexical`, `@lexical/react`, `@lexical/rich-text`, `@lexical/list`, `@lexical/link`. No table plugin (`@lexical/table`), no image/upload plugin — there is no asset/media pipeline in this codebase yet (media widget is explicitly out of scope per `add-project-widgets`' proposal), so images stay out of scope here too.

**Database & indexing**
- No schema migration. Per the standing invariant from `add-project-widgets` (decision 3 / proposal note), `fields.widget` has no CHECK constraint and `config`/`value` are already generic JSON columns, so this widget requires zero DDL changes and no new tables.
- No functional/`json_extract` indexes — nothing filters or sorts on richtext content in this change (no public read API exists to search against).

**Runtime Zod schema caching**
- No change to the caching mechanism (`collections.schema_version` + in-memory LRU, per `add-project-widgets` decision 6). `richtext`'s value schema is just another branch registered the same way the other six are; the existing per-`collection_id`+`schema_version` cache key already covers it.

**Tenant isolation boundary**
- No change. `richtext` values flow through the same `entry_values` table, same tenant-scoped Kysely lookups, same field-belongs-to-collection-belongs-to-project containment checks as every other widget's value. No new endpoint, no new id in a URL.

**Cloudinary / credential encryption**
- Not applicable — this widget stores no media, transmits no third-party credentials, and touches no Cloudinary configuration.

**Rollback & data migration**
- Forward change is purely additive code (new widget module + two switch cases + one dependency bump); nothing existing is altered. Rollback is reverting the code change — there is no migration to run `down()` on.
- No JSON payload migration: `richtext` values are new rows with a shape only this change defines; no prior data exists to convert. If the fixed toolbar set ever grows (e.g. adding tables later), that future change would need to consider forward-compatibility of already-stored `EditorState` JSON, but that is out of scope here.
