## Why

Every capability shipped so far — `project-management`, `content-modeling`, `content-entries`, the four widget changes — builds the *authoring* half of a CMS. Nothing reads content back out. A tenant can model a blog, write and publish posts, and upload images, and then has no way to render any of it on their own site.

This change adds the read half: a versioned, key-authenticated JSON API over published entries, so a tenant's Next.js/Astro/whatever frontend can fetch its own content. It is Phase 1 of the headless roadmap — authentication, key management, and read-only delivery. Caching, rate limiting, webhooks, filtering, relational expansion, and write access are explicitly later phases.

The scope here is deliberately wider than "add an `api_keys` table." A key-management UI for an API that does not exist is dead code, and — more importantly — the response format is the thing `/v1` exists to protect. Deciding the serialization contract *after* shipping the credentials is deciding it under pressure. Both halves land together.

## What Changes

**Credentials**

- New `api_keys` table (migration `004`), scoped to a **project**, not just a tenant `[A2]`. A tenant owns many projects; a frontend consumes one. A tenant-scoped key would make `GET /collections` return several projects' collections mixed together, and collection slugs are only unique *per project* (`collections_project_slug_unique`), so that list can legitimately contain two `posts`.
- Tokens are `cms_<mode>_<keyId>_<secret>`. The `keyId` segment is stored plain and indexed, giving an O(1) row lookup; the `secret` segment is 32 random bytes, stored only as a SHA-256 hash and compared with `timingSafeEqual`.
- **Not bcrypt** `[A11]`. `src/lib/auth/password.ts` runs at 12 rounds (~250ms) because it defends low-entropy human passwords. An API key is 256 bits of `randomBytes` — there is nothing to brute-force, and a salted hash is not indexable, so bcrypt would force a full table scan plus a 250ms comparison *per row* on every API request.
- New project-level settings route `/dashboard/[projectId]/settings/api-keys` — a new settings shell, since today's settings (`password`, `cloudinary`) are tenant-level.

**Authentication**

- A route-handler wrapper, `withApiKey(handler)` — **not** Next middleware. `src/proxy.ts` runs on the edge runtime, where (per `src/lib/auth/config.ts`'s own comment) `better-sqlite3` cannot load. Key validation is a database read and must run in the Node runtime.
- `api_keys` is a **third category of table**: tenant-owned content (managed in the dashboard, must be isolated) *and* an identity table (read before a tenant context exists). No existing table is both. It goes in `TENANT_SCOPED_TABLES` so all dashboard access is auto-scoped, with exactly one documented `getRootDb()` carve-out for resolution — mirroring the credential lookup in `src/lib/auth/authorize.ts`.

**Delivery**

- `GET /api/v1/collections`, `GET /api/v1/collections/:collection`, `GET /api/v1/collections/:collection/items`, `GET /api/v1/collections/:collection/items/:item`. Addressed by **slug**, falling back to id `[A3]`.
- Only `status = 'published'` entries. Draft/preview access is a later change, but the token already carries a `mode` segment so it is additive.
- Server-to-server only in v1 `[A1]`: keys are secret, and **no CORS headers are sent**. A browser-called API needs a distinct publishable key class with a per-key origin allowlist; adding that later is additive, whereas shipping permissive CORS over secret keys is not something you can walk back.

**Serialization — the actual contract**

- New optional `toApi(value, config)` member on `WidgetDefinition`, defaulting to identity. The API shape for a widget is defined next to the widget, preserving the property `registry.ts` already has: adding a widget type is one entry plus one module.
- Entry values are stored keyed by `field_id`; the API keys them by `field.key`.
- `richtext` emits `{ html, text }` rather than the raw Lexical tree `[A9]`. This is tractable only because `richtext.ts` registers a *closed* node set (heading, list, listitem, link, plus Lexical core) — "the toolbar is fixed in code."
- `relationship` emits `{ id, slug, collection }` rather than a bare id `[A8]` — enough to build a link with no second request, and forward-compatible with Phase 3's `?expand=`, which adds a `fields` member rather than changing the type.
- `datetime` is normalized to ISO-8601 UTC on the way out `[A10]`; storage is not normalized (`Date.parse` accepts many forms), so two identical instants can be stored as different strings today.
- Every declared field appears on every entry, `null` when absent `[A5]`. `validateEntryValues` writes no row for an empty optional field, so propagating storage directly would make the JSON shape vary per entry.

**BREAKING**: none to any existing surface. But it introduces one new *standing* constraint — see below.

## The constraint this introduces

`entry-schema.ts` records design decision 4: values are keyed by `field_id` **"which is what makes renaming a field's key free."** Once the API keys its JSON by `field.key`, that stops being true — a rename silently turns `entry.fields.title` into `undefined` in every consumer, at runtime, with no error raised anywhere.

This change keeps `key` as the API identifier and makes the cost *visible* instead of hidden `[A4]`: the field editor warns on rename when the project has at least one active API key. The alternative — an immutable `api_name` column split from the editable display `key` — fully preserves decision 4 and is the right answer if third parties will ever consume this. It is deliberately not taken here, on the assumption that consumers are the tenant's own frontends.

## Capabilities

### New Capabilities

- `api-key-management`: creating, listing, and revoking project-scoped API keys — token format, one-time secret reveal, hashing and lookup strategy, revocation semantics, and the settings UI.
- `content-delivery-api`: the versioned read API — authentication, the four endpoints, pagination and ordering, the published-only rule, the error envelope, and the entry/field serialization contract.

### Modified Capabilities

- `tenant-data-access`: gains a requirement covering the third table category — a tenant-owned table that must also be readable before a tenant context exists, and the single-carve-out rule that keeps it safe.
- `content-modeling`: renaming a field key becomes a warned action when the project has active API keys.
- `content-entries`: no requirement changes; entries gain a read path that filters on `status` and serializes values by field key.

## Impact

**New code**

- `db/migrations/004_api_keys.ts` — `api_keys` table; composite index `entries(collection_id, status)`.
- `src/lib/db/types.ts` / `tables.ts` — `ApiKeysTable`, `"api_keys"` added to `TENANT_SCOPED_TABLES`.
- `src/lib/api-keys/` — `token.ts` (mint/parse/hash), `service.ts` (tenant-scoped CRUD), `resolve.ts` (the single `getRootDb()` carve-out).
- `src/lib/api/` — `with-api-key.ts` (the wrapper), `errors.ts` (envelope), `query.ts` (pagination/order parsing).
- `src/lib/api/serialize.ts` — entry and collection-schema serializers.
- `src/lib/widgets/*.ts` — `toApi` on `types.ts`, `registry.ts`'s `erase()`, and the four widgets that need one.
- `src/app/api/v1/**` — four route handlers.
- `src/app/dashboard/[projectId]/settings/` — new layout + `api-keys/{page,actions,api-key-list,create-api-key-form}`.

**Reused, unchanged**

- `listCollections`, `listFields`, `findCollection`, `parseFieldConfig`, `resolveTitleField` — the API reads through the existing services, not around them.
- `TenantScopePlugin` — the wrapper produces a `tenantId` and hands it to `getTenantDb()`; from there the API is subject to exactly the same isolation as the dashboard.

**Database & indexing**

- `api_keys`: unique index on `key_id` (the auth-path lookup), index on `project_id` (the dashboard list).
- `entries(collection_id, status)` composite — the API's hottest query is `WHERE collection_id = ? AND status = 'published'`, and only `entries_collection_id_idx` exists today.
- `last_used_at` is written **at most once per 5 minutes per key** `[A12]`. SQLite has a single writer; an unconditional `UPDATE` on every read request would serialize against real content writes.
- Pagination orders by `(created_at, id)`, never `created_at` alone. `created_at` is `CURRENT_TIMESTAMP`, which in SQLite has *second* granularity — entries created in the same second have undefined relative order, so today's `listEntries` ordering would let an offset-paginated list duplicate or skip rows.

**Tenant isolation boundary**

- The key is the *only* source of `tenantId` and `projectId`. No API route reads either from a path segment, query string, or header. `:collection` and `:item` are client-supplied and resolved through `getTenantDb(tenantId)` plus a `project_id` predicate, so a foreign id is a 404 by construction.
- Revoked and expired keys resolve to nothing at the lookup, before any content query runs.

**Rollback & data migration**

- Migration `004` is purely additive — one new table, one new index. `down()` drops both; no existing row is read or written, so it is safe against a live database.
- Rolling back the code leaves `api_keys` rows harmless. Rolling back the migration after keys are issued invalidates them, which is the correct outcome.
- The `toApi` member is optional and defaults to identity, so a widget module reverted independently degrades to raw stored values rather than throwing.

## Non-Goals

Deferred to later phases, listed so their absence is a decision rather than an oversight: response caching and `ETag`s, rate limiting, webhooks, OpenAPI generation, `?filter[…]`, `?expand=`, cursor pagination, write endpoints, preview/draft tokens, browser-callable publishable keys with CORS, an asset registry (`GET /assets/:id` has nothing to address — images exist only as JSON inside `entry_values`), and scheduled publishing (`status` is a column, not a function of time; there is no `published_at`).
