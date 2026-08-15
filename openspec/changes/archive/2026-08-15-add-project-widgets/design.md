## Context

The tenant/auth/project foundation is in place: `getTenantDb(tenantId)` + `TenantScopePlugin` make tenant isolation automatic for any table registered in `TENANT_SCOPED_TABLES`, and `/dashboard/[projectId]` renders a placeholder where content belongs. `openspec/config.yaml` fixes two invariants this change must satisfy: custom fields never trigger dynamic DDL (all dynamic data lives in validated JSON columns), and all custom field reads/writes pass through Zod validators derived from tenant field definitions.

This change picks the content model those invariants imply. See proposal.md for scope.

## Goals / Non-Goals

**Goals**
- A widget registry that is the single source of truth for a widget type's config shape, value shape, config UI, and value UI — so adding a widget type is one registry entry, not a migration plus edits in six files.
- A storage model where deleting a field cleanly deletes its values, and renaming a field's key or label touches no stored value.
- End-to-end verifiability: a widget defined in the field builder can be filled in on an entry and read back, in this change.

**Non-Goals**
- The richtext/Lexical editor (deferred by design; see proposal.md).
- Querying, filtering, or full-text search over entry values — no `json_extract` indexes, no FTS5 yet.
- A public read API for entries.
- Field-type migration (changing a field's widget after values exist) — prohibited outright, see decision 5.

## Decisions

**1. Layered model — collection → field → entry → value — not flat "widgets on a project".**

A widget is the input type of a *field*, and a field is part of a *collection*'s schema; values belong to *entries*. The flat alternative (a project owns widgets, each holding one value) is a per-project settings editor, not a CMS — and it is not a subset of the layered model. In the flat model `value` is a column on the widget row; in the layered model the field row is schema and carries no value at all. Building flat first would mean moving every value out and inventing entries later.

*Alternative considered:* ship the schema layer only (collections + fields), entries in a follow-up. Rejected: the widget registry is the hard part and it is the same work either way, but split across two changes each widget gets half-written twice and the design cannot be verified until the second change. The seam is clean if scope pressure demands it later.

**2. One polymorphic `fields` table with a JSON `config` column — not a table per widget type.**

`fields(id, tenant_id, collection_id, key, label, widget, required, position, config, created_at)`. Config shape varies wildly by type (`select` needs `options[]`, `number` needs `min`/`max`/`valueType`, `boolean` needs nothing), and this is exactly the "dynamic JSON columns + definitions metadata table, no dynamic DDL" strategy `config.yaml` mandates.

The cost is that SQLite cannot stop a `select` field from storing `{min: 3}` — correctness lives entirely in Zod. That is accepted, and mitigated by parsing `config` through the registry on *read* as well as write, so a malformed row surfaces immediately rather than corrupting a render.

*Alternative considered:* `widget_string`, `widget_number`, … per-type tables. Rejected — seven tables, seven `TENANT_SCOPED_TABLES` entries, and ordering fields across types becomes a union query.

**3. No CHECK constraint on `fields.widget`.**

SQLite cannot alter a CHECK constraint without rebuilding the table. A constraint there would turn "add the richtext widget" from a registry entry into a migration — defeating the whole point of decision 2. The permitted widget set is enforced by Zod at every write, and unknown widget values are handled explicitly on read.

**4. Entry values as one row per (entry, field), not one JSON blob per entry.**

`entry_values(id, tenant_id, entry_id, field_id, value)` with `UNIQUE(entry_id, field_id)` and `field_id` FK `ON DELETE CASCADE`.

This buys three things directly:
- **Hard-deleting a field deletes its values for free**, via the foreign key — the required behavior, with no application bookkeeping. Under the blob model, deleting a field means rewriting every entry's JSON in a transaction, or tolerating orphaned keys the read path must filter out.
- **Values are keyed by `field_id`, not by key string**, so renaming a field's `key` is a pure metadata change — nothing stored moves. Under the blob model a key rename rewrites every entry.
- Per-field indexing stays available later without a data migration.

The cost is N rows per entry and a pivot to reconstruct one entry. At the entry counts this system targets, and given writes are `delete`-then-`insert` for the changed set inside a transaction, that is cheap. The one place it demands care is the entry *list* — see decision 7.

*Alternative considered:* `entries(…, data JSON)`. Rejected on the field-delete semantics above.

**5. `fields.widget` is immutable after creation; `key` and `label` are not.**

Changing a widget type once values exist has no correct answer — `string` → `number` on `"hello"` is undefined behavior wearing a migration's clothes. The field builder offers delete-and-recreate instead, with the same value-loss confirmation as any field delete.

`key` (machine, `^[a-z][a-z0-9_]*$`, unique per collection) and `label` (display, free text) are separate columns and both stay editable, since decision 4 makes a rename free.

**6. Zod validators are derived from field definitions, cached per collection, invalidated by a `schema_version` bump.**

Both entry rendering and entry saving need a Zod schema built from the collection's current fields. Naively that is a `fields` read plus a schema build per request.

- Field definitions are loaded once per request through React's `cache()`.
- The derived schema is memoized in a process-local LRU keyed by `` `${collection_id}:${schema_version}` ``.
- `collections.schema_version` is an integer bumped in the same transaction as any field create/update/reorder/delete.

Keying on the version makes invalidation a cache *miss* rather than an eviction call — no cross-process invalidation problem, and a stale entry is unreachable rather than wrong. This matters most in multi-process deployments, where an eviction-based cache would need a message bus to stay correct.

**7. Entry lists resolve the display title with one join, not one query per row.**

`collections.title_field_id` (nullable FK → `fields`, `ON DELETE SET NULL`) designates the field whose value labels an entry. The entry list joins `entry_values` once on `(entry_id IN …, field_id = title_field_id)`. Fallback chain when `title_field_id` is null or the value is empty: first `string` field by position → entry slug → "Untitled".

This is the most likely N+1 in the change, so it gets an explicit test asserting a bounded query count.

**8. Entry slugs are generated from the title value and stay stable across title edits.**

`entries.slug`, unique per collection, generated at creation from the title field's value via the existing `slugify` / `nextAvailableSlug` helpers in `src/lib/projects/slug.ts` — reused, not reimplemented. Editing the title afterwards does not silently re-slug; a slug change is an explicit action. Entries created with no usable title fall back to a short generated slug (`entry-<n>`).

**9. `entries.status` is `draft | published` from day one, default `draft`.**

One column now versus a migration plus a rethink of every list query later. This change stores and toggles status; it does not yet act on it, because there is no public read surface to hide drafts from. The requirement it establishes is that the column is authoritative when that surface arrives.

**10. Field ordering: integer `position`, rewritten wholesale in one transaction.**

On drop, the client sends the full ordered array of field ids for the collection; the server rewrites every `position` in a single transaction (and bumps `schema_version`). Idempotent, no rebalancing, no fractional-index drift, and a lost or duplicated request cannot corrupt the order. Field counts per collection are small enough that the write amplification is irrelevant. The client applies the reorder optimistically; the server response is authoritative.

*Alternative considered:* fractional indexing (`position` as a float, insert between neighbours). Rejected as premature — it solves a write-contention problem this system does not have, and introduces precision drift that eventually needs a rebalancing pass anyway.

**11. Deleting a field requires confirmation proportional to the damage.**

Before deleting, the server counts that field's `entry_values` rows. Non-zero means the confirmation names the number ("This will permanently delete values in 47 entries"). The delete itself is a hard delete, cascading. If the deleted field was the collection's `title_field_id`, that column goes null and the list falls back per decision 7.

**12. Value inputs are server-rendered where possible; the client boundary is per widget.**

All six widgets in this change are ordinary form controls, so the entry editor stays a server component with client islands only where a widget needs interactivity. Nothing in this change requires a client-side form library. This is what keeps the richtext deferral cheap — richtext will be the first widget that is client-only end to end, and it slots in as one more island.

## Risks / Trade-offs

- [Risk] JSON `config` is invisible to SQL constraints; a bad write or a future config-shape change can leave rows that no longer parse. → *Mitigation:* parse through the registry on read as well as write; surface a clear "this field's configuration is invalid" state in the builder rather than throwing during render.
- [Risk] The entry list N+1 on title values. → *Mitigation:* decision 7 plus a test asserting query count is independent of entry count.
- [Risk] Schema-derived validator cache serves a stale schema after a field edit. → *Mitigation:* decision 6 makes staleness structurally impossible (version-keyed), at the cost of one extra integer column and a bump in every schema-mutating transaction.
- [Risk] `required` added to a collection that already has entries retroactively makes those entries invalid. → *Accepted trade-off:* validation runs at save time only. Existing entries stay readable and are enforced on their next save. Bulk backfill/validation reporting is a later concern.
- [Risk] Four new tables must each be registered in `TENANT_SCOPED_TABLES`; missing one silently breaks isolation. → *Mitigation:* the standing AGENTS.md rule, plus an explicit test asserting every table in the migration except `tenants`/`users` appears in the list.
- [Trade-off] Scope. This change is deliberately larger than the schema layer alone, on the reasoning in decision 1. If it needs to be split mid-flight, the seam is between tasks 4 and 5.

## Migration Plan

`db/migrations/002_content_model.ts`, purely additive:

1. `collections` — `id`, `tenant_id` (FK tenants, cascade), `project_id` (FK projects, cascade), `name`, `slug`, `title_field_id` (nullable), `schema_version` (int, default 1), `created_at`. Index on `project_id`; unique `(project_id, slug)`.
2. `fields` — `id`, `tenant_id`, `collection_id` (FK collections, cascade), `key`, `label`, `widget`, `required` (int 0/1), `position` (int), `config` (text/JSON), `created_at`. Index on `collection_id`; unique `(collection_id, key)`.
3. `entries` — `id`, `tenant_id`, `collection_id` (FK collections, cascade), `slug`, `status`, `created_at`, `updated_at`. Index on `collection_id`; unique `(collection_id, slug)`.
4. `entry_values` — `id`, `tenant_id`, `entry_id` (FK entries, cascade), `field_id` (FK fields, cascade), `value` (text/JSON). Unique `(entry_id, field_id)`; index on `field_id`.

`collections.title_field_id` references `fields.id` with `ON DELETE SET NULL`. Because the two tables are mutually referencing, the FK is added in the `collections` definition after `fields` exists, or left as an unenforced column with application-level integrity if SQLite's create-order constraints make the circular reference awkward — decided at implementation time, noted in Open Questions.

`down()` drops in reverse FK order: `entry_values`, `entries`, `fields`, `collections`.

No existing row is read or written, so the forward migration is safe against a live database. Rollback destroys all authored content and must be exercised against a throwaway database first.

## Open Questions

All three were marked "settle at implementation"; all three are now settled.

- **Drag-and-drop library — resolved: no dependency.** Native HTML5 drag events for the pointer path, plus explicit move up/down buttons for the keyboard path. The buttons are not a degraded fallback: they are a first-class control that is discoverable, works on touch, and needs no drag emulation, which is the part `@dnd-kit` would actually have bought. Since decision 10 fixes the server contract (the client posts the whole ordered id list either way), swapping in `@dnd-kit` later is a change to one component with no server or schema impact.
- **Circular FK — resolved: enforced, both directions.** SQLite resolves foreign key targets at DML time rather than at CREATE TABLE time, so `collections` can name `fields.id` before `fields` exists; the constraint starts being enforced the moment the second table lands. No application-level integrity code is needed, and `ON DELETE SET NULL` clears the title designation on its own. Verified by the up/down/up run and asserted by the migration's own test.
- **`number` `valueType: "string"` — resolved: kept.** It earns its place precisely because it stores `"007"`: it is the only way to preserve leading zeros and fixed decimal places through a round trip, which matters for identifiers-that-look-like-numbers. It is not an escape hatch from validation — a `"string"`-typed value is still parsed as a number and still has `min`/`max` applied to its numeric form, so `"abc"` and `"99"` (against `max: 10`) are both rejected. Covered by tests.
