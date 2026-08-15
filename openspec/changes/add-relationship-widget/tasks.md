## 1. Widget registry

- [ ] 1.1 Add `relationship` to `WidgetType` (`src/lib/widgets/types.ts`)
- [ ] 1.2 Create `src/lib/widgets/relationship.ts`: `relationshipConfigSchema` (`{ targetCollectionId: string, multiple?: boolean }`), `relationshipWidget: WidgetDefinition` with `valueSchema` validating shape only (string, or string[] when `multiple`) — no DB access here, per design decision 1
- [ ] 1.3 Register `relationshipWidget` in `src/lib/widgets/registry.ts`: `widgets`, `widgetTypes`, `fieldWidgetSchema`
- [ ] 1.4 Extract the entry list's title-resolution fallback chain (title field → first string field → slug → "Untitled") into a standalone function in `src/lib/collections/service.ts`, if not already standalone; update the entry list's existing call site to use it

## 2. Field configuration validation (same-project, no self-reference)

- [ ] 2.1 In the field create/update service function, when `widget === "relationship"`: look up `targetCollectionId`'s `project_id` and reject if it differs from the field's own collection's project (design decision 7)
- [ ] 2.2 Reject when `targetCollectionId` equals the field's own collection id (self-reference)
- [ ] 2.3 Reject when `targetCollectionId` does not resolve to an existing collection
- [ ] 2.4 Tests: same-project accepted, cross-project rejected, self-reference rejected, nonexistent target rejected

## 3. Save-time referential validation

- [ ] 3.1 In the entry-save path, after the existing synchronous `buildEntrySchema`/`validateEntryValues` pass, collect `(targetCollectionId → submitted ids)` across all `relationship` fields on the entry (design decision 1-2)
- [ ] 3.2 Issue one `entries` existence query per distinct target collection (`WHERE collection_id = ? AND id IN (...)`); fold any missing ids into the same `fieldErrors` shape `validateEntryValues` returns
- [ ] 3.3 Confirm the async step composes with the existing sync validation without changing `ValidateValuesResult`'s shape or the entry form's error rendering
- [ ] 3.4 Tests: reference to an entry in the target collection accepted; reference to an entry in a different collection rejected; reference to a nonexistent id rejected; multiple-mode with a mix of valid/invalid ids reports the invalid ones

## 4. Reading a relationship value (including dangling references)

- [ ] 4.1 Define how a `relationship` value that references a deleted entry, or a field whose `targetCollectionId` no longer resolves, is represented on read — distinguishable from `MisconfiguredField` (config doesn't parse) per design decision 3
- [ ] 4.2 Entry render path resolves each valid reference's display label via the extracted title-resolution function (task 1.4); unresolvable references render as a visibly broken/unresolvable state instead of throwing
- [ ] 4.3 Tests: valid reference resolves to the target's title; reference to a deleted entry renders as unresolvable without erroring; field whose target collection was deleted renders as unresolvable without erroring

## 5. Delete-time warnings

- [ ] 5.1 Add a count helper: relationship fields elsewhere targeting a given collection (`fields` where `widget = 'relationship' AND json_extract(config, '$.targetCollectionId') = ?`) — design decision 4
- [ ] 5.2 Wire that count into the existing collection-delete confirmation, alongside the current entry count; omit the relationship line when the count is zero
- [ ] 5.3 Add a count helper: other entries referencing a given entry through any `relationship` field, using `json_each` over `entry_values.value` normalized to an array (design decision 4) — first use of `json_extract`/`json_each` in this codebase, flag for review
- [ ] 5.4 Wire that count into a new entry-delete confirmation warning (entries currently delete without a warning at all — confirm this is being added, not modified)
- [ ] 5.5 Tests: collection-delete warning shows correct field count and omits it when zero; entry-delete warning shows correct referencing-entry count and omits it when zero; both deletions still proceed and complete once confirmed, leaving dangling references per section 4

## 6. Widget config UI

- [ ] 6.1 Add the `relationship` case to `widget-config-inputs.tsx`: a select of the project's other collections (excluding the field's own collection) for `targetCollectionId`, plus a `multiple` toggle — same conventions as the `select`/`number` cases
- [ ] 6.2 Surface config validation errors from section 2 in this form

## 7. Entry picker (value input)

- [ ] 7.1 New client-island component: on mount, fetch the target collection's entries (id + resolved title via task 1.4) through a server action, once
- [ ] 7.2 Client-side filter-as-you-type against the loaded list (design decision 6) — no debounce, no search endpoint
- [ ] 7.3 Single mode: combobox that becomes a selected chip with a clear control
- [ ] 7.4 Multiple mode: selected entries shown as removable chips above the search input
- [ ] 7.5 Add the `relationship` case to `value-input.tsx`, mounting this component with the field's `targetCollectionId`/`multiple` config
- [ ] 7.6 Render existing values (including any unresolvable ones per section 4) when the editor opens

## 8. End-to-end verification

- [ ] 8.1 Manual pass: create an Author collection and a Blog Post collection in one project, add a `relationship` field (single) on Blog Post targeting Author, create author entries, create a blog post referencing one, save, reopen, confirm the picker and display both work
- [ ] 8.2 Manual pass: add a `multiple` relationship field (e.g. Tags), confirm multi-select add/remove works end to end
- [ ] 8.3 Manual pass: delete a referenced author entry, confirm the warning count, confirm the blog post still opens afterward with the reference shown as unresolvable
- [ ] 8.4 Manual pass: delete the Author collection, confirm the warning count, confirm the blog post's relationship field is shown as unresolvable afterward
- [ ] 8.5 Run full test suite (`widget-registry.test.ts`, `widget-form.test.ts`, and new tests from sections 2-5) and confirm no regression in existing widget behavior
