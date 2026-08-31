## Context

See proposal.md — Why. What this builds on, and the constraints each piece imposes:

- `src/lib/db/client.ts` — `getTenantDb(tenantId)` applies `TenantScopePlugin`, which injects `tenant_id = ?` on reads/updates/deletes and stamps it on inserts, for the tables in `TENANT_SCOPED_TABLES`. `getRootDb()` is unscoped and reserved for migrations and pre-tenant identity flows.
- `tests/server/tenant-scoped-tables.test.ts` — reads `pragma_table_info` for every table and asserts that any table carrying a `tenant_id` column is in `TENANT_SCOPED_TABLES`, with a hardcoded `IDENTITY_TABLES` allowlist (`tenants`, `users`). Adding `api_keys` with a `tenant_id` column *forces* one of those two outcomes; there is no third path that leaves the test green.
- `src/proxy.ts` — Next 16's renamed middleware, `matcher: ["/dashboard/:path*"]`, running `authConfig`'s edge-safe half. `src/lib/auth/config.ts:6-10` states the constraint directly: middleware runs on the edge runtime, where `better-sqlite3` and `bcryptjs` cannot load.
- `src/lib/widgets/` — `WidgetDefinition` is `{ type, label, description, icon, configSchema, valueSchema(config), isEmpty? }`. `registry.ts`'s `erase()` hides `TConfig` behind `ErasedWidget` so runtime lookups by string are sound. `schema-cache.ts` keys on `collection_id:schema_version` so invalidation is a cache *miss*, never an eviction — no cross-process coordination needed.
- `src/lib/entries/service.ts` — `Entry.values` is `Record<field_id, unknown>`. `listEntries` resolves the display title with a single LEFT JOIN pinned to the title field. `ENTRY_STATUSES = ["draft", "published"]`.
- `src/lib/widgets/entry-schema.ts:41-43` — values are keyed by `field_id` **"which is what makes renaming a field's key free (design decision 4)."** This change is what puts that property at risk; see decision 5.
- `src/lib/widgets/richtext.ts:24` — `richtextNodes = [HeadingNode, ListNode, ListItemNode, LinkNode]`, a closed set, because "the toolbar is fixed in code (design decision 2)." `@lexical/headless` is already a dependency, used today only for validation.
- `src/lib/widgets/number.ts:6-10` — `valueType: "string"` stores `"007"` verbatim for round-trip fidelity.
- `src/lib/widgets/datetime.ts:22-38` — accepts any string `Date.parse` round-trips; `dateOnly` narrows to `YYYY-MM-DD`. Storage is *not* normalized.
- `src/app/dashboard/settings/layout.tsx` — the existing settings shell: a `TABS` array, tenant-level, commented as structured to grow.

## Goals / Non-Goals

**Goals**

- The API is subject to the *same* isolation machinery as the dashboard: resolve a `tenantId`, then `getTenantDb(tenantId)`. The API does not get its own query path.
- The response contract is defined per-widget, in the widget module, so adding a widget type stays a one-module change.
- Every decision that the `/v1` prefix exists to protect is made here, deliberately, rather than falling out of whatever the storage happens to look like.
- A key leak is bounded to one project, is revocable, and is visible (`last_used_at`).

**Non-Goals**

- Performance work. No caching, no `ETag`s, no rate limiting — Phase 2. The indexes added here are for correctness of pagination and to avoid an obviously-quadratic scan, not a performance program.
- Query expressiveness. No filtering, no expansion, no field selection, no full-text search — Phase 3.
- Anything that writes content through the API — Phase 4.

## Decisions

**1. Keys are project-scoped, not tenant-scoped.** `[A2]`

`api_keys` carries both `tenant_id` (for `TenantScopePlugin`) and `project_id` (the actual authorization scope). Resolution returns both.

The plan as written resolved a key to a `tenantId` only. But `collections_project_slug_unique` makes collection slugs unique *per project*, so a tenant-scoped `GET /collections` can return two collections with slug `posts` — an unresolvable address in a slug-addressed API. Project scoping also bounds a leaked key to one site.

*Alternative considered:* tenant-scoped keys with a `?project=` query parameter. Rejected — it puts an authorization-relevant identifier in client-controlled input, which `AGENTS.md` forbids in the same breath as route params.

**2. The token format carries its own lookup key.**

```
   cms_live_7f3a9c2e5b1d4068_kQx8Lm2pRv...
   │   │    │                └── secret: 32 bytes from randomBytes,
   │   │    │                    base64url. SHA-256'd, never stored raw.
   │   │    └─────────────────── key_id: 16 hex chars. Stored plain,
   │   │                         UNIQUE index. The O(1) lookup.
   │   └──────────────────────── mode: live | preview
   └──────────────────────────── fixed product prefix
```

Resolution is: parse → reject malformed without a database call → `SELECT … WHERE key_id = ?` → `timingSafeEqual(sha256(secret), row.secret_hash)` → reject if `revoked_at` or `expires_at` has passed.

The `mode` segment is present from day one but only `live` can be minted in this change. A preview key is then a later change that adds a UI affordance and one `status` branch, not a token-format break.

The fixed `cms_` prefix exists so the token is matchable by secret scanners (GitHub, gitleaks) if it ever lands in a repository.

*Why not store a `prefix` column, as the original plan had:* the displayable prefix is `cms_<mode>_<key_id>`, derivable from two columns that must exist anyway. A third column would be denormalized state that can disagree with them.

**3. SHA-256, not bcrypt.** `[A11]`

Two independent reasons, either sufficient:

- *Entropy.* Bcrypt's cost parameter buys resistance to offline brute force of guessable secrets. A 256-bit random secret is not guessable; the work factor purchases nothing and costs ~250ms of latency on the hottest path in the system.
- *Indexability.* A bcrypt hash is salted, so `WHERE key_hash = ?` cannot work. Without decision 2's embedded `key_id`, authentication would be: scan every key row, bcrypt-compare each. That is O(n) 250ms operations per request.

`timingSafeEqual` still matters — the comparison is against a stored digest, and a non-constant-time compare leaks it byte by byte.

**4. `api_keys` is in `TENANT_SCOPED_TABLES`, with exactly one `getRootDb()` carve-out.**

```
   DASHBOARD                          API AUTH
   ─────────                          ────────
   "list my keys"                     "who owns this token?"
   tenantId known (session)           tenantId is the ANSWER
        │                                  │
        ▼                                  ▼
   getTenantDb(tenantId)              getTenantDb( ?? )  ← chicken & egg
        │                                  │
   auto-scoped ✓                      getRootDb(), once, in resolve.ts
                                           │
                                      returns { tenantId, projectId }
                                           │
                                           ▼
                                      getTenantDb(tenantId) for all
                                      subsequent content reads
```

The unscoped read is confined to `src/lib/api-keys/resolve.ts`, which selects only from `api_keys` by `key_id` and returns identifiers — never content. Every content query downstream goes through `getTenantDb()`. This mirrors how `src/lib/auth/authorize.ts` reads `users` unscoped at login and everything after that is scoped.

`tests/server/tenant-scoped-tables.test.ts` gets `api_keys` in `TENANT_SCOPED_TABLES` (not in `IDENTITY_TABLES`), because unlike `tenants`/`users` it *is* tenant-owned content with a dashboard CRUD surface. A new test asserts `resolve.ts` is the only module outside `src/lib/db/` and the auth/migration paths that imports `getRootDb`.

*Alternative considered:* a second Kysely plugin that scopes by `key_id` instead of `tenant_id`. Rejected as machinery built for one query.

**5. `field.key` is the API identifier; renaming it warns.** `[A4]`

The tension is stated in proposal.md. Three options were weighed:

| | preserves decision 4 | consumer ergonomics | cost |
|---|---|---|---|
| key as identifier, warn on rename | no | good | one UI warning |
| immutable `api_name`, split from display key | yes | good | column + migration + explaining two names |
| expose `field_id` in JSON | yes | bad — UUID-keyed JSON | none |

Taken: the first. The field editor calls a new `countActiveApiKeys(projectId)` and, when non-zero, renders a warning on the key input — *"`title` is read by the Content API. Renaming it will break consumers that reference `fields.title`."* Not a block; the tenant owns both sides.

This is the assumption most worth overruling. If third parties will ever hold keys, take the second option instead — retrofitting it later means a migration *and* a `/v2`.

**6. Serialization lives on `WidgetDefinition` as `toApi`.**

```
   WidgetDefinition<TConfig>
   ├── configSchema      config → validated config
   ├── valueSchema       config → validator for values IN
   ├── isEmpty?          value  → is this "nothing"?
   └── toApi?            value  → the value going OUT      ← new
```

Optional, defaulting to identity, erased through `registry.ts`'s existing `erase()`. Six of nine widgets need no implementation.

*Alternative considered:* a `switch (field.widget)` in the serializer. Rejected for the same reason `registry.ts` exists — it would make "add a widget type" a two-file change again, and the compiler cannot see a missing case in an untyped switch over a `string` column.

**7. Per-widget output.**

| widget | output | why |
|---|---|---|
| `string`, `text`, `boolean`, `select` | identity | already JSON-native |
| `number` int/float | identity | — |
| `number` `valueType:"string"` | identity — stays a string | `number.ts` keeps `"007"` verbatim on purpose; coercing would destroy the fidelity that config exists for. The collection schema endpoint exposes `valueType` so consumers can see why |
| `datetime` | ISO-8601 UTC, ms precision | storage is unnormalized; `…T00:00:00Z` and `…T00:00:00+00:00` are both valid today |
| `datetime` `dateOnly` | unchanged `YYYY-MM-DD` | a calendar date is not an instant; coercing to midnight-UTC is the classic off-by-one-day bug |
| `image` | `{ url, publicId, width, height, format, bytes }` | `secureUrl` → `url`: the "secure" qualifier is Cloudinary's vocabulary, not the consumer's, and every URL here is https |
| `relationship` | `{ id, slug, collection }`, array when `multiple` | see decision 8 |
| `richtext` | `{ html, text }` | see decision 9 |

**8. `relationship` emits an identity object, not a bare id.** `[A8]`

A bare id cannot be rendered — building `<a href="/blog/{slug}">` needs a second request per reference. `{ id, slug, collection }` makes the common case (link to the referenced entry) zero-fetch, and is forward-compatible: Phase 3's `?expand=` adds a `fields` member to the same object rather than changing its type from string to object, which would be a `/v2`.

The cost is that the item serializer is no longer a pure function of one entry's rows: it collects every referenced id across the response and issues **one** batched `WHERE id IN (…)` per target collection. This is the only place the read path does extra work, and it is bounded by the number of relationship fields, not by the number of entries.

A reference to a deleted or unpublished entry serializes as `null` (or is dropped from the array), never as a dangling id.

**9. `richtext` emits `{ html, text }` and drops the raw tree.** `[A9]`

Almost no consumer can render a Lexical editor state. Rendering it here is tractable — and stays tractable — only because `richtext.ts` registers a closed node set: heading, list, list item, link, plus Lexical's core paragraph/text/linebreak/root. There is no extension point, so the renderer is a total function over ~8 node types rather than an open-world problem.

`text` comes nearly free from the traversal `isEmpty` already performs, and is what excerpt, meta-description, and search-index use cases actually want.

*Alternative considered:* `{ json, html, text }`. Rejected for v1 — shipping the raw tree invites consumers to depend on Lexical's internal serialization format, which would make a Lexical upgrade a breaking change to *our* API. Additive later if someone needs it.

HTML is escaped at every text node. Link `href`s are restricted to `http:`, `https:`, and `mailto:` — a stored `javascript:` URL is dropped rather than emitted, since consumers will inject this HTML into their pages.

**10. Every declared field is present on every entry; absent means `null`.** `[A5]`

`validateEntryValues` deliberately writes no `entry_values` row for an empty optional field. Propagating that would mean the JSON shape varies entry to entry, which is hostile to typed consumers and to the codegen this enables in Phase 3. The serializer iterates the *field list*, not the value rows.

A misconfigured field (`parseFieldConfig` → `ok: false`) also serializes as `null`, and the entry gains a `_warnings` array naming it `[A6]`. Omitting the key would silently change the response shape for every consumer the moment one field's config breaks; emitting a value would be a lie.

**11. Response envelope, on both list and item.** `[A7]`

```jsonc
// GET /api/v1/collections/blog/items?limit=2
{
  "data": [ { "id": "e_01H…", "slug": "hello-world", "status": "published",
              "createdAt": "2024-01-01T00:00:00.000Z",
              "updatedAt": "2024-01-02T09:30:00.000Z",
              "fields": {
                "title":  "Hello World",
                "body":   { "html": "<p>…</p>", "text": "…" },
                "cover":  { "url": "https://res.cloudinary…", "width": 1200, "height": 630, "format": "jpg", "publicId": "…", "bytes": 84213 },
                "author": { "id": "e_01J…", "slug": "ada", "collection": "authors" },
                "tags":   [],
                "featured": false,
                "publishedOn": null
              } } ],
  "meta": { "total": 47, "limit": 2, "offset": 0 }
}
```

The item endpoint returns the same envelope with `data` as an object and no pagination `meta`. Errors are the disjoint form from the strategy doc — `{ "error": { "code", "message" } }` — with `code` drawn from a closed set: `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_QUERY`, `INTERNAL`. No database error, stack trace, or Zod issue path is ever echoed.

**12. Offset pagination, ordered by `(created_at, id)`.**

Offset over cursor for v1: it matches the original plan, and it can return `total`, which a cursor cannot. `limit` defaults to 20, caps at 100; unknown or unparseable query parameters are a 400 `INVALID_QUERY` rather than being silently ignored, so a typo'd `?limt=100` surfaces immediately.

The tiebreak is not cosmetic. `entries.created_at` defaults to `CURRENT_TIMESTAMP`, which in SQLite has **second** granularity — today's `listEntries` orders by `created_at DESC` alone, so two entries created in the same second have undefined relative order and an offset-paginated walk can show one row twice and never show another. `ORDER BY created_at DESC, id DESC` makes the sequence total.

`order` accepts `created_at` and `updated_at` only, each `asc`/`desc`, validated against that closed set — never interpolated.

**13. `last_used_at` is throttled.** `[A12]`

Better-sqlite3 has one writer. An unconditional `UPDATE api_keys SET last_used_at = …` on every read request would put a write in front of every content fetch, contending with real authoring writes and making the API's throughput a function of write-lock latency.

The update is issued only when the stored value is absent or older than 5 minutes. The column's purpose is "is this key still in use?", which 5-minute resolution answers completely. It is written after the response is produced, and a failure is swallowed — telemetry must not fail a request.

**14. Slug-addressed, with id fallback.** `[A3]`

`/api/v1/collections/blog/items/hello-world` beats two UUIDs, and the slugs are already unique at exactly the right scope (`collections_project_slug_unique`, `entries_collection_slug_unique`). Both segments resolve as "slug within scope, else id" — one extra indexed lookup on miss, and it keeps id-addressed integrations working.

Slugs are mutable, so a rename breaks a URL. That is the same exposure as decision 5 and is accepted for the same reason: the tenant owns both ends.

**15. No CORS headers, deliberately.** `[A1]`

v1 keys are secret and server-side. Sending no `Access-Control-Allow-Origin` means a browser cannot call the API cross-origin, which is the correct default for a credential that must not be in a client bundle.

A browser-callable API is a *different product decision*, not a header: it needs a publishable key class, a per-key origin allowlist, and origin-based rate limiting, because the key is public by construction. All of that is additive on this schema. Shipping `Access-Control-Allow-Origin: *` over secret keys now would encourage exactly the leak the design is trying to prevent, and could not be walked back without breaking whoever adopted it.

## Risks / Trade-offs

- **Field-key renames break consumers silently.** Mitigated by decision 5's warning, not eliminated. If this proves painful, the immutable-`api_name` migration is the escape hatch.
- **No rate limiting in v1.** A leaked key can be used to hammer the API until revoked. Accepted for Phase 1 — the same posture `add-cloudinary-media-settings` took for "Check Connection" — and Phase 2's first item.
- **The relationship batch lookup is the one non-trivial query.** A collection with several relationship fields issues one extra query per distinct target collection per response. Bounded by schema shape, not row count, but worth watching once real data exists.
- **Richtext HTML rendering is now a compatibility surface.** If someone adds a node type to the toolbar without adding a renderer branch, that content silently disappears from the API. The renderer must throw on an unknown node type in development and emit a `_warnings` entry in production, rather than dropping it.
- **`total` on every list request costs a `COUNT(*)`.** Cheap at current scale, the first thing to make optional if it stops being cheap.

## Migration Plan

`004_api_keys.ts` is purely additive: one `CREATE TABLE`, one unique index on `key_id`, one index on `project_id`, one composite index on `entries(collection_id, status)`. No existing row is read or written, so it is safe to run against a live database. `down()` drops all four.

Deployment order is unconstrained — the table is unused until the first key is minted, and no endpoint exists until the route handlers ship. There is no data backfill.

## Resolved Questions

- **`expires_at` exists on the table now; no creation-UI affordance in this change.** The column is set (nullable) so `resolve.ts`'s expiry check (decision 4/2.6) has something to check from day one, and no later migration is needed to add scheduling. The UI to *set* an expiry — plus whatever expiry-warning surface makes an unexpected lapse not a support burden — is a separate, later change.
- **`GET /api/v1/collections/:collection` returns an entry count.** Reuses `countEntriesByCollection` as-is; the schema endpoint answers both "what does this collection look like" and "how much is in it," which a consumer deciding whether to page through it wants in one request rather than two.
- **List and item responses carry `X-RateLimit-*` headers with permissive, hardcoded values in this change.** No limiting logic exists yet — the values are static (e.g. `X-RateLimit-Limit: 1000`, `X-RateLimit-Remaining: 1000`) so that Phase 2 wiring real counting behind them is a value change, not a new header a client has to learn to expect. Never a promise of a specific quota; the docs note the numbers are not yet enforced.
