## Why

The Content Delivery API is REST-only today: consumers walk a fixed shape (list endpoint, then item endpoint, then follow relationship references as separate requests) and always receive every declared field, whether they need it or not. Frontends that render a page from several related collections (e.g. a blog post plus its author and related posts) issue multiple round trips and pay for fields they discard. A GraphQL endpoint lets a consumer describe the exact shape it needs — including nested relationship traversal — in one request, without adding a second authentication or scoping model.

## What Changes

- Add a single GraphQL endpoint (`POST /api/v1/graphql`) to the existing versioned Content Delivery API, authenticated and scoped by the same API key mechanism (`withApiKey`) already used by the REST routes — no new credential type.
- Derive the GraphQL schema from the same source the REST schema endpoint reads (collections, fields, widget definitions) rather than hand-authoring a parallel type system: a collection becomes an object type, each field's GraphQL type follows its widget's existing output-type rules (`outputRelevantConfig` in `serialize.ts`), and the schema is rebuilt when a project's collections or fields change.
- Expose two query shapes per collection, mirroring the REST surface: a paginated list field (with the existing `limit`/`offset`/`order`/`direction` semantics and the same page-size cap) and a single-item field addressable by slug or id.
- Resolve relationship fields as nested GraphQL fields (selectable sub-objects) instead of the REST shape's flat reference object, resolved through the existing batched `resolveReferences` query pattern (one query per target collection per request, not per entry/field) to avoid N+1 resolution across a query's selection set.
- Enforce the same content rules as REST: only `published` entries are reachable, tenant/project scope comes solely from the resolved API key, and errors use a GraphQL-native error shape (`errors[].extensions.code`) drawn from the same closed error-code set as the REST envelope — no database detail, stack trace, or internal id ever reaches a response.
- Add a GraphQL library dependency (schema construction + query execution); no new runtime beyond the existing Node route-handler runtime (GraphQL execution does not run on the edge, matching the existing REST routes' `runtime = "nodejs"` constraint).
- Document the endpoint and example queries in `docs/api.md` alongside the existing REST reference, and surface it on the project's API docs settings tab.

## Capabilities

### New Capabilities
- `content-delivery-graphql-api`: A GraphQL query endpoint over the same published, tenant/project-scoped content the REST Content Delivery API exposes — schema derived from live collection/field definitions, list and single-item queries per collection, nested relationship resolution, and a GraphQL-shaped error envelope.

### Modified Capabilities
(none — REST behavior, API key issuance/validation, and the `content-delivery-api` and `api-key-management` specs are unchanged; GraphQL is an additional entry point onto the same authorization and content rules)

## Impact

- **New code**: `src/app/api/v1/graphql/route.ts` (route handler, wrapped in the existing `withApiKey`), a schema-building module under `src/lib/api/graphql/` (collection/field → GraphQL type mapping, resolvers reusing `resolve-target.ts` and `serialize.ts`/`resolveReferences`), and tests under `tests/server/` mirroring the existing REST API key/content tests.
- **Dependencies**: adds a GraphQL execution library (e.g. `graphql` plus a minimal spec-compliant HTTP handler) to `package.json`; no database schema changes — the endpoint reads through the same tenant-scoped Kysely handles as REST.
- **Docs**: `docs/api.md` and the project API docs settings tab (`project-api-docs` capability) gain a GraphQL section; no changes to existing REST documentation content.
- **Performance**: schema construction from collection/field metadata is per-project and changes only when collections/fields change, so it must be cached (in-memory, keyed by `projectId`) rather than rebuilt per request; relationship resolution reuses the existing batched-query approach so a query's cost stays bounded by distinct target collections in its selection set, not by result-set size.
- **Backward compatibility**: purely additive — existing REST routes, request/response shapes, and API keys are unchanged and continue to work exactly as before.
