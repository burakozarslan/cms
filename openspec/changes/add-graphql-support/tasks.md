## 1. Dependencies and scaffolding

- [x] 1.1 Add `graphql` and `dataloader` to `package.json` dependencies
- [x] 1.2 Create `src/lib/api/graphql/` module directory
- [x] 1.3 Create `src/app/api/v1/graphql/route.ts` with `runtime = "nodejs"` and a stub handler wrapped in `withApiKey`

## 2. Schema construction

- [x] 2.1 Implement a widget-type → GraphQL output type mapper reusing `outputRelevantConfig`'s rules from `src/lib/api/serialize.ts` (string, number, boolean, list, object shapes per widget)
- [x] 2.2 Implement a collection → `GraphQLObjectType` builder, generating one type per collection with a field per collection field (scalar/list per the type mapper)
- [x] 2.3 Implement relationship fields as nested object/list fields typed after their target collection's generated type
- [x] 2.4 Skip/omit fields whose configuration fails to parse, matching REST's `serializeCollection` behavior
- [x] 2.5 Implement the root `GraphQLSchema` builder: a list field (`<collection>Entries` or equivalent) and a single-item field (`<collection>Entry`) per collection, scoped to one project's collections
- [x] 2.6 Implement an in-memory schema cache keyed by `projectId`
- [x] 2.7 ~~Wire cache invalidation into the collection/field service write paths~~ — superseded during implementation: cache key is derived from each collection's `id:slug:schema_version`, so it changes automatically on every collection/field create/update/delete/reorder (see design.md decision) — no separate invalidation hook needed

## 3. Query execution and data access

- [x] 3.1 Implement list-field arguments (`limit`, `offset`, `order`, `direction`) reusing `parseListQuery`'s constants/validation rules from `src/lib/api/query.ts`
- [x] 3.2 Wire list-field resolvers to `listPublishedEntries` from `src/lib/api/resolve-target.ts`
- [x] 3.3 Wire single-item field resolvers to `resolveEntry` (slug-or-id, published-only) from `src/lib/api/resolve-target.ts`
- [x] 3.4 Implement a per-request `DataLoader`-based batching layer for relationship resolution, generalizing `resolveReferences`'s one-query-per-target-collection batching to be callable incrementally across nested resolver ticks
- [x] 3.5 Wire relationship field resolvers to the batching layer, resolving dangling references to `null`
- [x] 3.6 Serialize non-relationship field values through the same widget `toApi` logic `serializeEntry` uses, so scalar output (dates, rich text, images) matches REST exactly

## 4. Request/response handling

- [x] 4.1 Parse the GraphQL-over-HTTP request body (`query`, `variables`, `operationName`)
- [x] 4.2 Reject documents containing a mutation or subscription operation with an `INVALID_QUERY`-coded error before execution — the generated schema defines no `Mutation`/`Subscription` root type, so `graphql-js` itself rejects such a document during execution with no field `path`, which `formatGraphQLError` maps to `INVALID_QUERY`
- [x] 4.3 Add a `graphql-js` validation rule capping query depth/complexity, rejecting oversized queries with `INVALID_QUERY`
- [x] 4.4 Map field-resolution failures to GraphQL `errors[]` entries carrying `extensions.code` from the existing `API_ERROR_CODES` set, with fixed messages (never the caught exception's message)
- [x] 4.5 Confirm `withApiKey`'s pre-execution auth failure path returns the standard REST 401 JSON shape (not a GraphQL `data`/`errors` envelope), since the request never reaches the executor
- [x] 4.6 Confirm no permissive CORS headers are emitted on the GraphQL route (same posture as REST)

## 5. Tests

- [x] 5.1 Unit tests for the widget-type → GraphQL type mapper
- [x] 5.2 Unit tests for schema construction (collection scoping, misconfigured field omission, cache invalidation on collection/field change)
- [x] 5.3 Integration tests: authentication (missing/invalid/expired key, both header forms) mirroring the existing REST API-key tests
- [x] 5.4 Integration tests: cross-project and cross-tenant scoping return no data for out-of-scope collections
- [x] 5.5 Integration tests: list query pagination defaults, cap enforcement, and stable ordering, matching REST's `content-delivery-api` test coverage
- [x] 5.6 Integration tests: single-item query by slug and by id, draft entries unreachable
- [x] 5.7 Integration tests: nested relationship resolution (single level and multi-level), dangling reference resolves to null, and reference-resolution query count stays bounded by distinct target collections under a list query with many referencing entries
- [x] 5.8 Integration tests: mutation operation rejected, oversized query rejected, partial-failure response shape (`data` + `errors` together)
- [x] 5.9 Integration tests: error envelope leaks no stack trace/database detail on an unexpected failure

## 6. Documentation

- [x] 6.1 Add a GraphQL section to `docs/api.md` with example queries (list, single-item, nested relationship)
- [x] 6.2 Add the GraphQL endpoint to the project API docs settings tab content (`project-api-docs` capability)
