## Context

The widget registry (`src/lib/widgets/`) is the single source of truth for a widget type: `WidgetDefinition` supplies `configSchema` and `valueSchema(config)`, and `registry.ts` erases the config type into `ErasedWidget` so every consumer — field builder, entry form, save path — looks a widget up by its runtime `WidgetType` string. `WidgetType` in `types.ts` already carries a code comment reserving `richtext` for this exact change (see proposal.md - Why).

The entry form (`entry-form.tsx` + `value-input.tsx`) is a server component using native `<form action={...}>` + `useActionState`; `ValueInput`'s `switch (field.widget)` renders a plain server-rendered control per type and reads its posted value back via `name={valueInputName(field.id)}` on submit (`form.ts`'s `valueFromForm`). All six existing widgets post a plain string (or checkbox/`getAll`) that HTML forms produce natively. None of them mount any client JavaScript of their own — design decision 12 in `add-project-widgets` calls this out explicitly and names `richtext` as the first exception.

## Goals / Non-Goals

**Goals**
- `richtext` slots into the registry exactly like the other six: one module (`richtext.ts`), one entry in `widgets`/`widgetTypes`/`fieldWidgetSchema`, one `case` in `value-input.tsx`, one `case` in `widget-config-inputs.tsx`, one branch each in `configFromForm`/`valueFromForm`.
- The Lexical editor is a `"use client"` island that still participates in the existing native-`<form>` submission model — no client-side fetch, no separate save path, no form library introduced.
- Stored value round-trips losslessly through Lexical's own serialization (`EditorState.toJSON()` / `editor.parseEditorState()`), so re-opening an entry re-hydrates the exact document.

**Non-Goals**
- HTML rendering of the stored JSON (no public read API exists to render into — see proposal.md).
- Any toolbar/feature configurability (fixed feature set for this change).
- Tables, images, embeds, or any plugin requiring the (nonexistent) media pipeline.
- Rich diffing, collaborative editing, or version history of richtext content.

## Decisions

**1. Stored value is Lexical's own `EditorState` JSON, validated as opaque JSON — not re-derived into a custom schema.**

`richtextValueSchema` is `z.custom<SerializedEditorState>(...)` (or similarly permissive) rather than hand-modeling Lexical's node tree in Zod. Lexical's serialized shape is versioned and plugin-dependent (list nodes, link nodes, etc. each contribute their own node shape); re-specifying that shape in Zod would drift from whatever the installed `@lexical/*` packages actually produce and break on every Lexical upgrade. Structural correctness is Lexical's own responsibility — `editor.parseEditorState(json)` throws on a genuinely malformed tree, which is the enforcement point that matters. Zod's job here is narrower: reject non-objects, and (per decision 3) reject empty documents when the field is required.

*Alternative considered:* hand-write a Zod schema mirroring Lexical's `SerializedLexicalNode` tree. Rejected — high maintenance cost for validation Lexical already performs internally, for a value this change never queries or filters on.

**2. Config schema is empty (`z.strictObject({})`), identical in shape to `boolean`'s.**

The toolbar (bold, italic, underline, H1–H3, ordered/unordered lists, links) is fixed in code, not data, per the proposal's explicit "keep it simple" scope decision. An empty strict config schema keeps `richtext` mechanically indistinguishable from `boolean` at the registry level — no special-casing needed in `parseFieldConfig` or `fieldWidgetSchema`. `widget-config-inputs.tsx`'s `case "richtext"` renders an explanatory line with no inputs, same treatment `boolean` gets today.

*Alternative considered:* a `features: string[]` config letting each field enable/disable toolbar items, mirroring `select`'s `options[]` pattern. Rejected for this change — no requirement calls for it, and an empty schema is trivially extensible later (adding an optional key to a `strictObject` is backward compatible; no existing stored config needs to change).

**3. "Required" means "the document contains at least one non-whitespace character of plain text," not "the JSON is present."**

An empty Lexical document is not an empty JSON value — it's a valid `SerializedEditorState` with one empty paragraph node. `z.object({}).strict()`-style presence checks can't express "empty" for a tree. `valueSchema(config)` therefore uses Lexical's headless traversal (`$getRoot().getTextContent()` run against a headless editor built from the field's serialized state, or an equivalent plain-text extraction over the node tree) and applies `required` against the trimmed result's length, not against the JSON's presence. This is the only place richtext's validation differs qualitatively from a scalar widget's.

*Alternative considered:* treat any parseable JSON as satisfying `required` (i.e., only reject `null`/missing). Rejected — this would let a user "fill in" a required field by opening and immediately leaving the editor, which defeats the purpose of `required` from the author's point of view.

**4. No `maxLength`-equivalent validation in this change.**

Per proposal.md, length limits on a node tree have no obviously-correct definition yet (character count of extracted plain text? serialized JSON byte size? node count?), and no requirement calls for one. Deferred rather than guessed; `richtextConfigSchema` staying empty (decision 2) means adding a length option later is additive.

**5. The client editor syncs into a hidden `<input type="hidden">` on every change; form submission stays native.**

`RichTextEditor` (`"use client"`, new file) wraps `LexicalComposer` + `RichTextPlugin` + `ListPlugin` + `LinkPlugin`, and on `OnChangePlugin`'s change callback serializes `editorState.toJSON()` into a `<input type="hidden" name={valueInputName(field.id)} value={json} />` it controls. This is what lets the entry form stay a native `<form action={...}>` posting to a server action — `value-input.tsx`'s `case "richtext"` mounts the island, but the *submission* path is unchanged: `form.ts`'s `valueFromForm` gets a `case "richtext"` that `JSON.parse`s the hidden input's string value (mirroring how `number`'s case already special-cases parsing), rather than the plain-string `default` branch every scalar widget currently falls through to.

*Alternative considered:* give the richtext island its own submit handling (`onSubmit` intercept, `fetch` to a dedicated endpoint). Rejected — it would fork the save path (validation, error display, redirect-after-save) that every other widget shares through `entry-form.tsx`'s single `useActionState`, for no benefit; the hidden-input approach keeps richtext a drop-in participant in that one save path.

**6. Editing an existing value re-hydrates via `editor.parseEditorState(storedJson)` on mount, not by reconstructing DOM from scratch.**

The stored `SerializedEditorState` is Lexical's own format, so mounting the editor with an existing value is `parseEditorState` on the initial config — no custom deserializer to write or keep in sync with the toolbar's feature set.

## Risks / Trade-offs

- [Risk] `SerializedEditorState`'s shape depends on which `@lexical/*` plugins are installed; adding or removing a plugin later (e.g. a future table plugin) changes what shape old stored values can contain, and old documents won't retroactively gain the new node types. → *Mitigation:* accepted as inherent to "the widget's feature set is fixed in code" (decision 2) — a future change that grows the toolbar is additive to what a document *can* contain, never subtractive, so old documents keep parsing.
- [Risk] The permissive `z.custom` value schema (decision 1) means a malformed-but-JSON-shaped value could be stored and only fail when `editor.parseEditorState` is later called against it (at next edit, not at save time). → *Mitigation:* `valueSchema` calls `editor.parseEditorState` (via a headless editor instance) during validation itself, not just plain-text extraction — so structural validity is checked at save time, matching every other widget's save-time guarantee.
- [Risk] This is the first widget requiring client JS beyond what the entry form already ships; bundle size grows for any page rendering a `richtext` field's editor. → *Mitigation:* the editor island is only mounted for fields that are actually `richtext`-typed, so pages/collections with no richtext field pay nothing new — consistent with "one more island" (add-project-widgets decision 12).
- [Trade-off] No HTML output in this change means a richtext field's content is not yet visible anywhere outside the field builder/entry editor (no public read API exists). → *Accepted*, per proposal.md — this change is scoped to authoring, matching how `entries.status` was stored with no consumer yet in `add-project-widgets` (decision 9 there).

## Migration Plan

No database migration — `fields.widget` has no CHECK constraint and `config`/`value` are already generic JSON columns (per `add-project-widgets` decisions 2–3), so `richtext` requires zero DDL.

Deploy steps:
1. Add `lexical`, `@lexical/react`, `@lexical/rich-text`, `@lexical/list`, `@lexical/link` to `package.json`.
2. Add `src/lib/widgets/richtext.ts`; register it in `registry.ts` (`widgets`, `widgetTypes`, `fieldWidgetSchema`).
3. Add branches in `form.ts` (`configFromForm`, `valueFromForm`).
4. Add the `RichTextEditor` client component and wire its `case` into `value-input.tsx`.
5. Add the (near-empty) config case in `widget-config-inputs.tsx`.

Rollback is reverting the code change — there is no migration to run `down()` on, and no existing data is touched. If `richtext` fields have already been created and populated in the window before a rollback, rolling back leaves those `fields`/`entry_values` rows in the database (harmless — `parseFieldConfig` already treats an unrecognized `widget` string as a `MisconfiguredField` rather than crashing, per `add-project-widgets` decision 2's read-time parsing).

## Open Questions

None — the toolbar scope, storage format, and validation semantics were resolved during discovery (see proposal.md) rather than left open.
