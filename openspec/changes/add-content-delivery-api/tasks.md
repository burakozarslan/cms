## 1. Schema

- [x] 1.1 Create `db/migrations/004_api_keys.ts`. Table `api_keys`: `id` (text PK), `tenant_id` (text, not null, references `tenants.id` on delete cascade), `project_id` (text, not null, references `projects.id` on delete cascade), `name` (text, not null), `key_id` (text, not null), `secret_hash` (text, not null), `mode` (text, not null, default `'live'`), `created_by_user_id` (text, references `users.id` on delete set null), `created_at` / `last_used_at` / `revoked_at` / `expires_at` (text, only `created_at` not null with `CURRENT_TIMESTAMP` default).
- [x] 1.2 In the same migration: unique index `api_keys_key_id_unique` on `key_id` (the authentication lookup), index `api_keys_project_id_idx` on `project_id` (the dashboard list).
- [x] 1.3 In the same migration: composite index `entries_collection_status_idx` on `entries (collection_id, status)` — the API's hottest predicate, and only `collection_id` is indexed today.
- [x] 1.4 Write `down()` dropping all four objects in reverse order. Verify up/down/up runs clean, as `002` did.
- [x] 1.5 Add `ApiKeysTable` to `src/lib/db/types.ts` and register it on the `DB` interface. `tenant_id` uses the `TenantId` column type; `created_at` and `mode` are `Generated`.
- [x] 1.6 Add `"api_keys"` to `TENANT_SCOPED_TABLES` in `src/lib/db/tables.ts` — **not** to `IDENTITY_TABLES` in the isolation test. Update the file's doc comment to name this third category (tenant-owned *and* credential-resolving) and point at `resolve.ts`.

## 2. Token minting and resolution

- [x] 2.1 Create `src/lib/api-keys/token.ts`: `mintToken(mode)` returning `{ token, keyId, secretHash, mode }` — `keyId` is 16 hex chars from `randomBytes(8)`, secret is `randomBytes(32)` base64url, token is `cms_<mode>_<keyId>_<secret>`.
- [x] 2.2 In `token.ts`: `parseToken(raw)` returning `{ mode, keyId, secret } | undefined`. Reject on structure alone — wrong prefix, wrong segment count, wrong segment lengths, unknown mode — so a malformed token never reaches the database.
- [x] 2.3 In `token.ts`: `hashSecret(secret)` (SHA-256, hex) and `secretMatches(secret, storedHash)` using `timingSafeEqual` over equal-length buffers. Do **not** use `bcryptjs` — see design decision 3.
- [x] 2.4 In `token.ts`: `displayPrefix(mode, keyId)` returning `cms_<mode>_<keyId>`. No `prefix` column is stored; it is derived.
- [x] 2.5 Create `src/lib/api-keys/resolve.ts` exporting `resolveApiKey(raw)` -> `{ tenantId, projectId, keyId, mode } | undefined`. This is **the only** module outside migrations and the auth identity flow permitted to call `getRootDb()`. Head it with a comment explaining the chicken-and-egg (design decision 4) and stating that it selects from `api_keys` alone and returns identifiers only, never content.
- [x] 2.6 In `resolve.ts`: reject when `revoked_at` is set or `expires_at` has passed, before returning. Return `undefined` for every failure mode — never a reason, so nothing distinguishes "unknown key" from "revoked key" to a caller.
- [x] 2.7 In `resolve.ts`: `touchLastUsed(keyId, lastUsedAt)` — issues the `UPDATE` only when `last_used_at` is null or older than 5 minutes, wrapped so a failure is logged and swallowed (design decision 13).

## 3. Key management service and UI

- [x] 3.1 Create `src/lib/api-keys/service.ts` using `getTenantDb(tenantId)` throughout: `listApiKeys(tenantId, projectId)`, `createApiKey(tenantId, projectId, userId, name)`, `revokeApiKey(tenantId, keyId)`, `countActiveApiKeys(tenantId, projectId)`. Follow the discriminated `MutationResult`/`Failure` shape from `src/lib/collections/service.ts`.
- [x] 3.2 `createApiKey` returns the raw token in its success result and nowhere else — no other function on the module can produce it. Validate `name` (trimmed, non-empty, max length) and confirm the project exists under the tenant, which the scoped handle makes the same query.
- [x] 3.3 `revokeApiKey` sets `revoked_at`; it does not delete the row (design: revocation stays visible).
- [x] 3.4 Create `src/app/dashboard/[projectId]/settings/layout.tsx` — a project-level settings shell mirroring `src/app/dashboard/settings/layout.tsx`'s `TABS` pattern, with `API keys` as its first tab.
- [x] 3.5 Create `src/app/dashboard/[projectId]/settings/api-keys/actions.ts` (`"use server"`): `createApiKeyAction`, `revokeApiKeyAction`. Each starts with `requireSession()`, passes `session.user.tenantId`, and takes `projectId` from the route — the scoped handle is what makes that safe.
- [x] 3.6 Create `api-keys/page.tsx` rendering the key list (name, displayable prefix, created, last used, status) and the creation form.
- [x] 3.7 Create `create-api-key-form.tsx` (`"use client"`): name input, submit, and a one-time reveal panel showing the full token with a copy control and an explicit "this will not be shown again" notice. The token lives in component state only — never in a URL, never re-fetched.
- [x] 3.8 Create `api-key-list.tsx` with a revoke control using the existing `ConfirmDialog` (see `tests/ui/confirm-dialog.test.tsx`), and revoked rows rendered as revoked rather than hidden.
- [x] 3.9 Build all UI from `@frontend/ui` primitives, consulting the FlyonUI MCP first per `AGENTS.md`. No FlyonUI import lands directly in a page or component. (FlyonUI MCP not available in this environment; matched existing `@frontend/ui`/table conventions from sibling pages instead.)

## 4. Widget serialization

- [x] 4.1 Add optional `toApi?(value: unknown, config: TConfig): unknown` to `WidgetDefinition` in `src/lib/widgets/types.ts`, documented as the outbound counterpart to `valueSchema` and the definition of the public API shape for that widget.
- [x] 4.2 Thread `toApi` through `erase()` and `ErasedWidget` in `src/lib/widgets/registry.ts`, mirroring how `isEmpty` is erased.
- [x] 4.3 `src/lib/widgets/datetime.ts` — `toApi`: normalize to ISO-8601 UTC with millisecond precision; when `dateOnly`, return the `YYYY-MM-DD` string unchanged (design decision 7). An unparseable stored value returns `null`, not a throw.
- [x] 4.4 `src/lib/widgets/image.ts` — `toApi`: map `secureUrl` -> `url`, keep `publicId`, `width`, `height`, `format`, `bytes`.
- [x] 4.5 `src/lib/widgets/richtext.ts` — `toApi`: render `{ html, text }` via a headless editor over the existing closed `richtextNodes` set. Reuse the `$getRoot().getTextContent()` traversal `isEmpty` already performs for `text`.
- [x] 4.6 In the richtext renderer: escape text at every text node; allow only `http:`, `https:`, `mailto:` link targets and drop others (design decision 9). An unknown node type throws in development and produces a warning in production — it must never silently vanish.
- [x] 4.7 Leave `string`, `text`, `boolean`, `select`, `number` without a `toApi` — identity is correct, including `number`'s `valueType: "string"` (design decision 7).
- [x] 4.8 `src/lib/widgets/relationship.ts` — `toApi` cannot resolve references alone; it needs a batch lookup. Give it a `toApi` that normalizes to an id array plus a `multiple` marker, and let the serializer in task 5 perform resolution. Document why this one widget is the exception.
- [x] 4.9 Export the new member and any renderer helpers from `src/lib/widgets/index.ts`.

## 5. Entry and collection serializers

- [x] 5.1 Create `src/lib/api/serialize.ts`: `serializeCollection(collection, fields)` -> `{ id, slug, name, fields: [{ key, widget, required, ...outputRelevantConfig }] }`. Expose only the config that determines output type — `multiple`, `valueType`, `dateOnly` — not the whole blob.
- [x] 5.2 `serializeEntry(entry, fields, references)` -> `{ id, slug, status, createdAt, updatedAt, fields, _warnings? }`. Iterate the **field list**, not the value rows, so every declared field is present and absent values are `null` (design decision 10).
- [x] 5.3 A field whose `parseFieldConfig` returned `ok: false` serializes as `null` and appends a `_warnings` entry naming its key and reason.
- [x] 5.4 Implement reference resolution: collect every referenced entry id across the whole response, issue **one** `WHERE id IN (...)` per distinct target collection filtered to `status = 'published'`, and build `{ id, slug, collection }`. Unresolved references become `null`, or are dropped from a `multiple` array.
- [x] 5.5 Normalize `created_at` / `updated_at` to ISO-8601 UTC, same as `datetime` — stored values are `CURRENT_TIMESTAMP` strings, not ISO.
- [x] 5.6 Serializers are pure functions over already-fetched rows, so they are unit-testable without a database.

## 6. API infrastructure

- [x] 6.1 Create `src/lib/api/errors.ts`: `apiError(code, message, status)` producing `{ error: { code, message } }`; codes limited to `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_QUERY`, `INTERNAL`. No caller may pass a message derived from a caught exception.
- [x] 6.2 Create `src/lib/api/with-api-key.ts` exporting `withApiKey(handler)`. Read `Authorization: Bearer` then `X-API-Key`; `parseToken` -> `resolveApiKey` -> on failure return `401 UNAUTHORIZED`; on success call `handler(request, { tenantId, projectId, mode, params })` and fire `touchLastUsed` after the response is produced.
- [x] 6.3 `withApiKey` wraps the handler in a try/catch returning `500 INTERNAL` with a generic message, logging the real error server-side only.
- [x] 6.4 Do **not** touch `src/proxy.ts`. Its matcher stays `/dashboard/:path*`, and it stays free of any database import — it runs on the edge runtime (design: Context).
- [x] 6.5 Create `src/lib/api/query.ts`: parse `limit` (default 20, max 100), `offset` (default 0, non-negative), `order` (`created_at` | `updated_at`), `direction` (`asc` | `desc`). Unknown parameters and unparseable values return an `INVALID_QUERY` failure rather than being ignored. Order columns come from a closed set and are never interpolated.
- [x] 6.6 Add `src/lib/api/resolve-target.ts`: resolve a collection segment to a collection within the key's project (slug first, then id), and an entry segment within that collection (slug first, then id, and `status = 'published'`). All lookups through `getTenantDb(tenantId)` with an explicit `project_id` / `collection_id` predicate.

## 7. Route handlers

- [x] 7.1 `src/app/api/v1/collections/route.ts` — `GET`, wrapped: list the key's project's collections via `listCollections`, serialize, return `{ data }`.
- [x] 7.2 `src/app/api/v1/collections/[collection]/route.ts` — `GET`: resolve the collection, `listFields`, `countEntriesByCollection` (published only), return the field schema plus an entry count. `404 NOT_FOUND` when unresolved.
- [x] 7.3 `src/app/api/v1/collections/[collection]/items/route.ts` — `GET`: parse query, `WHERE collection_id = ? AND status = 'published'`, `ORDER BY <col> <dir>, id <dir>`, `LIMIT`/`OFFSET`, plus a `COUNT(*)` for `total`. Return `{ data, meta: { total, limit, offset } }`.
- [x] 7.4 `src/app/api/v1/collections/[collection]/items/[item]/route.ts` — `GET`: resolve the entry, return `{ data }`. A draft entry is `404`, indistinguishable from a nonexistent one.
- [x] 7.5 Every handler runs on the Node runtime (`better-sqlite3`), returns `application/json`, and emits **no** `Access-Control-Allow-Origin` header (design decision 15).
- [x] 7.7 Add static `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers (permissive, hardcoded — no counting logic yet) to every `/api/v1/**` response via `withApiKey`, so Phase 2 wiring real limits behind them is a value change, not a new header (design: Resolved Questions).
- [x] 7.6 Confirm the ordering is `(created_at|updated_at, id)` in every list query — `CURRENT_TIMESTAMP` is second-granular, so a single-column order is not a total order (design decision 12).

## 8. Field-rename warning

- [x] 8.1 In the field editor (`src/app/dashboard/[projectId]/[collectionId]/field-form.tsx`), when editing an existing field and `countActiveApiKeys(tenantId, projectId) > 0`, render a warning `Alert` on the key input naming the API consequence.
- [x] 8.2 The warning does not block the rename and does not appear when creating a new field or when the project has no active keys.

## 9. Tests

- [x] 9.1 `tests/server/api-key-token.test.ts` — mint/parse round-trip; malformed tokens (bad prefix, wrong segment count, unknown mode, truncated secret) rejected by `parseToken` with no database access; `secretMatches` accepts the right secret and rejects a near-miss.
- [x] 9.2 `tests/server/api-keys.test.ts` — create returns the token exactly once; the stored row holds no plaintext secret; list/revoke are tenant-scoped; a revoked key resolves to `undefined`; an expired key resolves to `undefined`; `touchLastUsed` writes on a cold key and skips on a warm one.
- [x] 9.3 `tests/server/content-api-isolation.test.ts` — the isolation suite, following `tests/server/content-isolation.test.ts`. Tenant B's collection is `404` under tenant A's key; a same-tenant *other-project* collection is `404`; a draft entry is `404`; no response body distinguishes "forbidden" from "not found".
- [x] 9.4 Extend `tests/server/tenant-scoped-tables.test.ts` if needed so `api_keys` is asserted present in `TENANT_SCOPED_TABLES`, and add an assertion enumerating modules importing `getRootDb` — expected to be migrations, the auth identity flow, and `resolve.ts` alone (design decision 4).
- [x] 9.5 `tests/server/entry-serializer.test.ts` — every scenario in the `content-delivery-api` delta spec's serialization requirement: field-key mapping, `null` for absent optional values, misconfigured field -> `null` + `_warnings`, richtext `{ html, text }`, HTML escaping, `javascript:` link dropped, relationship reference object, dangling reference -> `null`, datetime normalization, `dateOnly` preserved, image `url` mapping, `number` string fidelity.
- [x] 9.6 `tests/server/content-api-pagination.test.ts` — seed entries sharing one `created_at` second, walk the collection page by page, assert every entry appears exactly once; assert `limit` cap, `INVALID_QUERY` on an unsupported `order`, and `total` counting published entries only.
- [x] 9.7 `tests/server/content-api-auth.test.ts` — missing/malformed/revoked/expired credentials all `401`; both header forms accepted; an unexpected handler error surfaces as `500 INTERNAL` with no leaked detail.
- [x] 9.8 Run the focused new suites, then the full suite. (Full suite: 369/369 passing across 4 repeated runs; one isolated flake on an unrelated pre-existing test, `content-model.test.ts`'s duplicate-key check, did not reproduce.)

## 10. Documentation

- [x] 10.1 Write `docs/api.md` (the location `openspec/config.yaml` names): authentication, the four endpoints, query parameters, the response envelope, the error codes, and the per-widget value shapes from design decision 7.
- [x] 10.2 Document the field-key rename hazard in `docs/api.md` and note that key stability is part of the consumer contract.
