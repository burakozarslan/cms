## Context

The widget registry (`src/lib/widgets/`) is the single source of truth for a widget's config shape, value shape, config UI, and value UI (see `add-project-widgets`' design decision 1-3). Every widget shipped so far — `string`, `text`, `select`, `number`, `boolean`, `datetime`, `richtext` — validates its value with a pure `Zod` schema derived only from its own `config`; none of them needs a database read to decide whether a value is valid. `relationship` is the first widget whose validity depends on another table's current contents (does this entry id exist in that collection right now), and the first whose *deletion* story reaches across collections.

Storage is unchanged: `fields.config` and `entry_values.value` are already untyped JSON text columns (`add-project-widgets` design decision 2), so `relationship`'s config and value shapes are absorbed by the existing schema with no migration.

`collections.title_field_id` and its fallback chain (title field → first string field → slug → "Untitled") already exist for labelling entries in the entry list (`add-project-widgets` design decision 7); this change is the second consumer of that logic.

## Goals / Non-Goals

**Goals:**
- A `relationship` widget that fits the registry pattern with the minimum deviation the cross-collection existence check requires.
- Save-time referential validation against the target collection's actual entries.
- Delete-time warnings that make dangling references a known, chosen risk rather than a silent one — without blocking deletion.
- A usable picker UI with no new dependency and no new backend infrastructure (no search endpoint, no debounce).

**Non-Goals:**
- No public read API, and no implementation of the one-level-deep JSON expansion it will eventually need — this change only avoids a storage decision that would preclude it.
- No referential-integrity enforcement (blocking a delete because something references the target). Dangling references are tolerated by design (see Decision 3).
- No cross-project relationships.
- No draft/published filtering in the picker.
- No bidirectional/inverse relationship browsing (e.g. an "Author" entry listing the "Blog Post" entries that reference it). The stored data doesn't preclude adding this later — it is a reverse lookup by target — but nothing in this change surfaces it.

## Decisions

**1. `valueSchema` gains a DB-backed sibling; the registry's `WidgetDefinition` contract is not changed for every widget.**

Every other widget's `valueSchema(config): ZodType` is pure — it can be built and applied without touching the database. `relationship`'s existence check cannot be expressed that way without either (a) accepting async Zod refinements everywhere `valueSchema` is used (it isn't currently awaited anywhere in `entry-schema.ts`), or (b) giving `relationship` a second, optional hook that the save path calls after the synchronous schema passes.

Chosen: (b). `relationship`'s `valueSchema` still validates *shape* synchronously (a string, or an array of strings, depending on `multiple`) — it does not and cannot validate existence. A new async step in the entry-save path (not a `WidgetDefinition` field, since it is the only widget that needs it) resolves, once per save, which submitted ids exist in which target collections, and folds any misses into the same `fieldErrors` shape `validateEntryValues` already returns.

*Alternative considered:* make `valueSchema` async everywhere. Rejected — it would ripple through every other widget's tests and call sites for a capability only one widget needs, and `entry-schema.ts`'s `superRefine` is written synchronously today; keeping the sync/async boundary at one seam (the save action) is smaller.

**2. Existence is checked with one query per save, not one per relationship field.**

A save can touch several `relationship` fields, potentially targeting several collections, each with `multiple` holding several ids. The save path collects `(targetCollectionId → submitted ids)` across all of an entry's relationship fields first, then issues one `entries` query per distinct target collection (`WHERE collection_id = ? AND id IN (...)`), not one query per field or per id. Collection count per entry is small (bounded by field count), so this stays a handful of queries, consistent with the existing save path's cost.

**3. Dangling references are tolerated, not prevented — counted and warned about, not blocked.**

Entries and collections already hard-delete unconditionally (`add-project-collection-delete`); adding a hard block for "something references this" would be a new, larger behavior change than this widget justifies, and the codebase's existing posture (no soft delete, no undo, per that change's non-goals) argues against introducing the first blocking-delete anywhere in the app for this feature alone.

Instead: delete confirmations gain a count (Decision 4), and reads tolerate the dangling case the same way `parseFieldConfig` already tolerates a field whose config no longer matches its widget (`MisconfiguredField`) — the read path treats a relationship value pointing at a nonexistent entry, or a field whose `targetCollectionId` no longer exists, as an unresolvable-but-not-fatal state, distinguishing it from a genuinely malformed value (wrong shape) the same way `MisconfiguredField` distinguishes "unknown widget" from "config doesn't parse."

*Alternative considered:* block the delete (approach C from the earlier discovery conversation). Rejected per that conversation — it needs the same cross-collection query machinery as the warning does, but additionally changes a previously-unconditional operation into one that can fail for reasons the tenant deleting an *entry* may not even know exist (a relationship field on a collection they aren't looking at).

**4. Two different count queries, deliberately not unified.**

- **Collection-delete warning** ("M relationship fields elsewhere target this collection"): `SELECT COUNT(*) FROM fields WHERE widget = 'relationship' AND json_extract(config, '$.targetCollectionId') = ?`. Pure `fields`-table scan, no `entry_values` involved — cheap, same shape as the existing field-delete value count.
- **Entry-delete warning** ("N other entries reference this one"): must look inside `entry_values.value`, which holds either a bare JSON string (single mode) or a JSON array (multiple mode). SQLite's `json_each` handles both without knowing which mode a given row used: `SELECT COUNT(DISTINCT ev.entry_id) FROM entry_values ev JOIN fields f ON f.id = ev.field_id AND f.widget = 'relationship' JOIN json_each(CASE WHEN json_type(ev.value) = 'array' THEN ev.value ELSE json_array(json(ev.value)) END) je ON je.value = ?`. The `json(ev.value)` wrap on the non-array branch matters: `ev.value` is itself JSON-encoded text (e.g. `"author-1"`, quotes included), so passing it straight to `json_array()` would double-encode it into a one-element array containing the literal string `"author-1"` (quotes and all) instead of `author-1`. This is the first use of `json_extract`/`json_each` in the codebase — the original content-model design explicitly deferred it ("no `json_extract` indexes, no FTS5 yet"). It's justified here because there is no alternative representation to query against (the value's shape is exactly the thing being searched), and it runs only on-demand when a delete confirmation is opened, not on every read.

These stay two separate queries/helpers rather than one generalized "what references X" function, because they search different columns for different things (a config field vs. a value payload) and are triggered by different actions.

**5. Title resolution is extracted, not reimplemented.**

The entry list's title-fallback chain becomes a standalone function in `src/lib/collections/service.ts` (or wherever it currently lives inline), taking a collection's fields/title-field-id and a value set, returning the resolved label. The picker and any relationship-value display call it directly. No parallel "resolve a relationship label" logic is written.

**6. The picker loads once per field, filters client-side; no new search infrastructure.**

On mount, the picker fetches the target collection's entries (id + resolved title, via Decision 5) through a server action, once. Typing filters the already-loaded list in the browser. This mirrors the app's existing bias against building infrastructure ahead of demonstrated need (no pagination, no fractional indexing elsewhere per `add-project-widgets`' decision 10 rationale) and needs no debounce, no search endpoint, and no new dependency. It is a real scaling limit — a target collection with thousands of entries loads all of them upfront — accepted for the same reason those other simplifications were: nothing in this system currently operates at that scale, and the seam to swap in server-side search later is confined to this one component.

*Alternative considered:* server-side search-as-you-type (new route, debounced client). Rejected as premature infrastructure for the same reason the field-reorder design rejected fractional indexing before it was needed.

**7. Same-project, no-self-reference are config-validation rules, enforced where `select`'s option-uniqueness rule already lives — in `configSchema`'s `.refine()` / the field-creation service call, not the database.**

`targetCollectionId` has no FK in `fields.config` (it's JSON) — same reasoning as every other config value in this table (`add-project-widgets` decision 3: no dynamic DDL, correctness lives in Zod plus the service layer). The same-project check needs a DB read (to look up the candidate collection's `project_id`), so it happens in the field-create/update service function, not in the widget's synchronous `configSchema` — mirroring how `select`'s pure `.refine()` differs from checks that need a database round trip.

## Risks / Trade-offs

- [Risk] Dangling references are possible by design (Decision 3) — a tenant can delete an entry or collection that other content depends on, after only a warning. → *Mitigation:* the warning states a concrete count so the decision is informed; the read path never crashes on a dangling reference (Decision 3); this matches the app's existing no-soft-delete posture rather than introducing a new one.
- [Risk] `json_each` over `entry_values.value` (Decision 4) is a full scan of relationship-widget rows, not an indexed lookup — cost grows with the number of relationship values in the tenant's data. → *Mitigation:* runs only when an entry-delete confirmation is opened (on demand, not on every read/list), and entry counts at this app's current scale keep it cheap; revisit with an index or denormalized reference table if that stops being true.
- [Risk] The async existence-check step (Decision 1/2) is a second validation phase the save path didn't previously need, and a bug there could let an invalid reference through or wrongly reject a valid one. → *Mitigation:* it plugs into the exact same `fieldErrors` shape `validateEntryValues` already returns, so the entry form's existing error rendering needs no changes; covered by the same table-testing style as the other widgets' `valueSchema` tests plus new save-path integration tests.
- [Trade-off] The picker loads a target collection's entries in full (Decision 6) — acceptable now, a real limit later. → *Mitigation:* isolated to one component; swapping in server-side search touches nothing else (config shape, value shape, and delete warnings are all independent of how the picker sources its list).
