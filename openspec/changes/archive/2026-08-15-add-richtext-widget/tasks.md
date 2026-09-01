## 1. Dependencies

- [x] 1.1 Add `lexical`, `@lexical/react`, `@lexical/rich-text`, `@lexical/list`, `@lexical/link` to `package.json` and install. (Also added `@lexical/headless`, needed for server-side `parseEditorState` validation.)

## 2. Widget definition

- [x] 2.1 Create `src/lib/widgets/richtext.ts`: empty `richtextConfigSchema` (`z.strictObject({})`), `RichtextConfig` type, and `richtextWidget: WidgetDefinition<RichtextConfig>` with `type`, `label`, `description`, `icon`.
- [x] 2.2 Implement `valueSchema(config)`: validate the submitted value is a well-formed `SerializedEditorState` by round-tripping it through a headless Lexical editor's `parseEditorState`, rejecting anything that throws or isn't object-shaped.
- [x] 2.3 Implement the required-field check. **Adjusted from plan:** `valueSchema` has no access to `required` (it's a field-level concern applied externally via `isEmptyValue` in `entry-schema.ts`, which treats any non-nullish object — including an untouched Lexical document — as "present"). Added an optional `isEmpty(value, config)` hook to `WidgetDefinition` (`types.ts`), threaded through `registry.ts`'s `erase()`, and consumed by a new `fieldIsEmpty` helper in `entry-schema.ts` (falls back to the generic `isEmptyValue` when a widget doesn't define it). `richtextWidget.isEmpty` extracts plain text via `$getRoot().getTextContent()` and reports empty when it's blank/whitespace-only. This is the mechanism design.md decision 3 called for; the hook is the fitting-to-the-existing-call-site part it left implicit.

## 3. Registry wiring

- [x] 3.1 Add `richtext` to `WidgetType` in `src/lib/widgets/types.ts`, removing the comment that reserves it as future/absent.
- [x] 3.2 Register `richtextWidget` in the `widgets` map in `src/lib/widgets/registry.ts`.
- [x] 3.3 Add `"richtext"` to the `widgetTypes` array (registry.ts), updating the comment that currently notes richtext is deliberately excluded.
- [x] 3.4 Add a `richtext` branch to the `fieldWidgetSchema` discriminated union in `registry.ts`.

## 4. Form data translation

- [x] 4.1 Add a `case "richtext"` to `configFromForm` in `src/lib/widgets/form.ts` returning `{}`.
- [x] 4.2 Add a `case "richtext"` to `valueFromForm` in `form.ts`: read the hidden input's posted string and `JSON.parse` it (guarding a parse failure by passing the raw string through so the value schema's own validation produces the user-facing error, rather than throwing during form parsing).

## 5. Client editor component

- [x] 5.1 Create `src/app/dashboard/[projectId]/[collectionId]/richtext-editor.tsx` (`"use client"`): `LexicalComposer` configured with `RichTextPlugin`, `ListPlugin`, `LinkPlugin`, and the node types they register (`ListNode`, `ListItemNode`, `LinkNode`, heading nodes). Also added `HistoryPlugin` (undo/redo) — not in the original plan, but a `contentEditable`-based editor with no undo/redo is a baseline usability gap, not a toolbar feature; it adds no config surface or node type.
- [x] 5.2 Add a minimal toolbar: bold, italic, underline, heading level select (H1–H3/paragraph), ordered list, unordered list, link.
- [x] 5.3 Initialize editor state from the field's existing value. **Adjusted from plan:** passed the value's JSON string directly as `LexicalComposer`'s `initialConfig.editorState` (a documented accepted form that internally calls `parseEditorState` + `setEditorState`) rather than calling `parseEditorState` manually — simpler and avoids fighting the composer's own initialization lifecycle. Starts empty (default single paragraph) when no value is present.
- [x] 5.4 Wire an `OnChangePlugin` that serializes `editorState.toJSON()` into a hidden `<input type="hidden" name={valueInputName(field.id)}>` on every change, so the enclosing native `<form>` submission carries the current document with no other code path change.
- [x] 5.5 Render the field's `label`/`error` around the editor consistent with how other `@frontend/ui` inputs in `value-input.tsx` present label/required-marker/error text (reused the same `label-text`/`helper-text text-error` classes `Textarea` uses).

## 6. Entry editor and field builder wiring

- [x] 6.1 Add a `case "richtext"` to the `switch (field.widget)` in `src/app/dashboard/[projectId]/[collectionId]/value-input.tsx`, rendering `RichTextEditor`.
- [x] 6.2 Add a `case "richtext"` to the `switch (widget)` in `src/app/dashboard/[projectId]/[collectionId]/widget-config-inputs.tsx` — no inputs, same treatment as the existing `boolean` case (a short note that this widget has no configuration).
- [x] 6.3 Confirmed `field-form.tsx`'s `WidgetPicker` reads directly from `widgetTypes`/`widgetDefinition`, so `richtext` appears automatically with its label/description/icon. Updated a stale comment there that said richtext was deliberately absent from the picker.

## 7. Tests

- [x] 7.1 Unit test `richtextWidget.valueSchema`/`isEmpty` in `tests/server/widget-registry.test.ts`: accepts a well-formed serialized editor state; rejects malformed/non-document JSON; reports an untouched empty document as empty, a document with visible text as not empty, and a malformed value as *not* empty (structural problem, not absence).
- [x] 7.2 Unit test `configFromForm`/`valueFromForm` richtext branches in `tests/server/widget-form.test.ts`: parses the hidden input's JSON, reads a blank submission as absent, passes malformed JSON through for the value schema to reject.
- [x] 7.3 **Adjusted from plan:** a true typing-driven round trip isn't feasible under jsdom (Lexical's `contentEditable` relies on native input events jsdom doesn't simulate — confirmed by hand, see `tests/ui/richtext-editor.test.tsx`). Covered the round-trip guarantee at the level that's actually testable and meaningful: `tests/server/entries.test.ts` → "stores and reads back a document unchanged" exercises the real service layer end-to-end (create → validate → persist → read back), and `tests/ui/richtext-editor.test.tsx` → "re-hydrates an existing document" / "pre-fills the hidden input from an existing value" confirm the client editor's re-hydration and hidden-input sync independently. Together these cover the same guarantee the spec scenario describes without depending on jsdom's contentEditable gap.
- [x] 7.4 Integration tests in `tests/server/entries.test.ts` ("richtext values" describe block): required + untouched empty document is rejected naming the field; required + visible text is accepted; non-well-formed value is rejected; optional + untouched empty document stores no row (mirrors the existing optional-blank-field test for other widgets).
- [x] 7.5 Regression test in `tests/ui/richtext-editor.test.tsx` ("ValueInput — richtext dispatch"): a `richtext` field mounts the toolbar; a `string` field does not.

## 8. Verification

- [x] 8.1 Full test suite: 206/206 passing across 14 suites (up from 200/13 before this change — 6 new tests, no regressions). Also ran `tsc --noEmit`, `eslint .`, and `next build` project-wide — all clean.
- [x] 8.2 Manually verified against the running dev app (Playwright-driven, screenshots taken at each step, 3 repeated clean runs): registered, created a project/collection, added a `richtext` field (shows as "Rich text" in the picker alongside the other six types), opened the entry editor, typed and applied bold, an H2 heading, a bulleted list item, and a link — saved the entry, reloaded the page, and the formatting (including the link's `href`) matched exactly before and after reload. Zero browser console errors throughout. Found and fixed a real bug in the process: toolbar buttons didn't call `preventDefault()` on `mousedown`, so clicking them blurred the editor and dropped the selection before the format command ran — fixed in `richtext-editor.tsx` (`ToolbarButton`'s `onMouseDown`, plus a tracked last-selection fallback for the heading `<select>`, which can't avoid the native focus change).
