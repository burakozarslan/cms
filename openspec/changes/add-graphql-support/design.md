## Context

The REST Content Delivery API (`src/app/api/v1/**`) is a set of Next.js route handlers, all wrapped in `withApiKey` (`src/lib/api/with-api-key.ts`), which resolves an `Authorization`/`X-API-Key` token to `{ tenantId, projectId, mode }` and is the sole source of request scope. Handlers then call into `resolve-target.ts` (collection/entry lookup, always `project_id`- and `status = 'published'`-scoped), `query.ts` (pagination/ordering parsing against a closed parameter set), and `serialize.ts` (`serializeEntry`, `resolveReferences`) to build responses. `resolveReferences` batches relationship lookups by target collection across an entire response, not per entry. All of this runs under `runtime = "nodejs"` because `better-sqlite3`/Kysely cannot load on the edge runtime that `src/proxy.ts` uses.

See `proposal.md` — Why / What Changes for motivation. See `specs/content-delivery-graphql-api/spec.md` for the behavior contract this design implements.

## Goals / Non-Goals

**Goals:**
- Reuse `withApiKey`, `resolve-target.ts`, and `serialize.ts`/`resolveReferences` as-is; GraphQL is a new entry point onto the same authorization and data-access code, not a parallel implementation.
- Keep relationship resolution's query cost bounded by distinct target collections in a query's selection set, matching the REST batching guarantee, even though GraphQL selection sets are arbitrarily nested.
- Cache the per-project GraphQL schema in memory, invalidated on collection/field change, so schema construction is not on the hot path of every request.

**Non-Goals:**
- Mutations (create/update/delete/publish entries via GraphQL) — out of scope; the endpoint is read-only, matching REST's read-only content API.
- Subscriptions or any streaming/real-time delivery.
- A public, cross-tenant GraphQL playground/introspection UI exposed without an API key — introspection is allowed but still requires authentication like every other operation.
- Custom filtering DSL beyond REST's existing `order`/`direction`/`limit`/`offset` — richer filtering is a separate future change if needed.

## Decisions

### Schema-per-project, cached and invalidated structurally (not by write-path hook)
The GraphQL schema (collection object types, list/item fields, relationship fields) is built from `listCollections`/`listFields` output for one project and cached in-memory keyed by `projectId`. Rather than hooking every collection/field write path to bust the cache, the cache key is derived from the project's current collections: `id:slug:schema_version` for each, sorted and joined. `schema_version` is already bumped by every field-mutating transaction (`bumpSchemaVersion` in `src/lib/collections/service.ts`), and adding, deleting, or renaming a collection changes the id/slug set itself — so any change that would alter the generated schema also changes the cache key. A stale cached schema is therefore structurally unreachable rather than a bug to avoid, mirroring the pattern `src/lib/widgets/schema-cache.ts` already uses for entry validation schemas (design decision 6 there). This was a refinement made during implementation: the original write-path-hook plan below was superseded once the existing `schema_version` mechanism was confirmed to already cover every case (collection and field create/update/delete/reorder).

Alternative considered (original plan): invalidate by hooking every collection/field service write path directly. Superseded by the version-keyed approach above — same guarantee, no scattered invalidation calls to keep in sync as new write paths are added.

Alternative considered: build the schema fresh per request. Rejected — schema construction walks every collection and field for a project, which is unnecessary work on every single query when collections change far less often than they're queried.

### Single POST endpoint, not per-collection routes
One `POST /api/v1/graphql` route handler (Node runtime, wrapped in `withApiKey` exactly like the REST routes) executes the standard GraphQL-over-HTTP contract (`{ query, variables, operationName }` in, `{ data, errors }` out). This is the standard shape every GraphQL client (Apollo, urql, graphql-request) expects out of the box, so no custom client-side glue is needed.

### Relationship fields as resolver functions over the shared reference map
Each relationship field on a generated object type is a resolver that reads from a per-request `DataLoader`-style batching context, not a resolver that queries per entry. Concretely: before executing the GraphQL operation, the query's selection set is not pre-scanned; instead each relationship field resolver enqueues the id(s) it needs and the batching layer (thin wrapper around the existing `resolveReferences` batching pattern, generalized to be called incrementally per target collection rather than once for a flat response) coalesces same-tick lookups into one query per target collection, mirroring how `resolveReferences` already batches for REST list responses. This preserves the "bounded by distinct target collections" guarantee from the spec without hand-rolling a new N+1-prevention scheme; a small `graphql`-ecosystem batching utility (e.g. `dataloader`) is used rather than reimplementing coalescing logic.

Alternative considered: resolve all references eagerly before execution, as REST does today (single `resolveReferences` call over the whole result set). Rejected as the primary mechanism — GraphQL selection sets can nest relationships several levels deep (entry → related entry → its own related entry), and REST's current call resolves exactly one level. A per-tick batching resolver generalizes correctly to arbitrary depth without restructuring `resolveReferences`'s existing one-level batching, which stays as-is for REST.

### Error mapping: REST error codes reused, GraphQL envelope on top
The existing `API_ERROR_CODES` closed set (`UNAUTHORIZED`, `NOT_FOUND`, `INVALID_QUERY`, `INTERNAL`) from `errors.ts` is reused verbatim as `extensions.code` values in GraphQL's standard `errors[]` array, rather than defining a second error taxonomy. Authentication failures (missing/invalid key) short-circuit before the GraphQL executor runs, returning the same HTTP-level 401 JSON shape as REST — no `data`/`errors` GraphQL envelope for that case, since the request never reached query execution. Failures during field resolution (e.g. invalid ordering argument, unexpected error) are surfaced as GraphQL `errors[]` entries with a fixed message and `extensions.code`, never the caught exception's own message, matching REST's "never leak" rule in `apiError`.

### GraphQL library choice
Use the reference `graphql` package (schema construction via `graphql-js` `GraphQLObjectType`/`GraphQLSchema`, execution via `graphql-js`'s `execute`) plus a minimal HTTP adapter for the POST contract, rather than a heavier framework (Apollo Server, GraphQL Yoga). `graphql-js` is the spec-compliant reference implementation with no additional runtime dependencies beyond it; a full server framework would bring plugin/caching/persisted-query machinery this endpoint doesn't need, since `withApiKey` already provides the request/response lifecycle Next.js route handlers use.

## Risks / Trade-offs

- [Deeply nested queries could still be expensive despite batching per level] → Cap query depth and/or total selection-set complexity at parse/validate time (a `graphql-js` validation rule) before execution, rejecting oversized queries with `INVALID_QUERY` rather than letting depth grow unbounded.
- [Schema cache invalidation missed on some write path adds a field/collection change is silently invisible until restart] → Invalidate from the single service-layer write functions collections/fields already funnel through (`src/lib/collections/service.ts`, `src/lib/widgets` field definitions), not from individual route handlers, so there is one place to keep correct.
- [A second execution path (GraphQL) reimplementing pagination/ordering rules could drift from REST's `query.ts`] → Reuse `parseListQuery`'s validation logic (or the same constants: `DEFAULT_LIMIT`, `MAX_LIMIT`, allowed order columns) for GraphQL list-field arguments instead of redefining them, so the two entry points cannot silently diverge.
- [New dependency (`graphql`, `dataloader`) increases install/build surface] → Both are widely used, small, dependency-light packages; no transitive database or network client pulled in.

## Migration Plan

Purely additive — no existing route, schema, or data model changes. Deploy the new route handler and dependency behind normal release flow; no feature flag needed since nothing existing depends on it. Rollback is deleting/disabling the one new route; REST endpoints and API keys are unaffected either way.
