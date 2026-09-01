## Purpose

Provides a single GraphQL endpoint over the same published, tenant/project-scoped content the REST Content Delivery API exposes, letting a consumer request an arbitrarily shaped, nested subset of collections and entries in one round trip.

## ADDED Requirements

### Requirement: The GraphQL endpoint reuses REST authentication and scoping
The system SHALL authenticate every GraphQL request against an API key using the same credential forms, validation rules, and tenant/project scoping as the REST Content Delivery API, and SHALL NOT introduce a separate credential type or an additional way to select scope.

#### Scenario: Missing credential rejected
- **GIVEN** a GraphQL request carrying no key header
- **WHEN** the system handles it
- **THEN** it responds `401` before executing any query, with an error using the same closed error-code set as REST

#### Scenario: Cross-project content is unreachable
- **GIVEN** a key scoped to project P
- **WHEN** a GraphQL query selects a collection belonging to project Q
- **THEN** that collection field resolves to null or an empty result, and no data from project Q is returned

#### Scenario: Query and mutation both denied
- **GIVEN** a validly authenticated request
- **WHEN** the request document contains a mutation operation
- **THEN** the system rejects it as unsupported rather than executing any write

### Requirement: The schema is derived from live collection and field definitions
The system SHALL construct the GraphQL schema exposed to a given project from that project's current collections and field definitions, mapping each field's GraphQL type from the same output-type rules the REST schema endpoint reports, and SHALL rebuild or invalidate a cached schema when a project's collections or fields change.

#### Scenario: Collection becomes an object type
- **GIVEN** a project with collections `blog` and `authors`
- **WHEN** the GraphQL schema for that project is introspected
- **THEN** it exposes an object type for each collection, and no type for a collection belonging to another project

#### Scenario: Field type follows widget output rules
- **GIVEN** a collection with a `number` field configured with an integer value type and a `relationship` field configured as multiple
- **WHEN** the schema is introspected
- **THEN** the number field's GraphQL type matches the REST schema's reported output type, and the relationship field is a list type

#### Scenario: Schema reflects a newly added field
- **GIVEN** a collection whose schema was already served to a client
- **WHEN** a field is added to that collection and the schema is requested again
- **THEN** the new field appears without requiring a service restart

#### Scenario: Misconfigured field is omitted from the schema
- **GIVEN** a collection containing a field whose stored configuration no longer parses
- **WHEN** the schema is built
- **THEN** that field is left out of the generated type rather than failing schema construction

### Requirement: Each collection exposes a list query and a single-item query
The system SHALL expose, for every collection reachable by the key's project, a paginated list query and a single-item query addressable by slug or id, matching the pagination and addressing rules of the REST Content Delivery API.

#### Scenario: List query paginated like REST
- **GIVEN** a collection holding more entries than the default page size
- **WHEN** its list query is executed without pagination arguments
- **THEN** the default number of entries is returned along with the total count, matching REST's default page size

#### Scenario: Oversized page size capped
- **GIVEN** a list query requesting more than the maximum page size
- **WHEN** the system executes it
- **THEN** it returns at most the maximum rather than the requested amount

#### Scenario: Unsupported ordering rejected
- **GIVEN** a list query ordering by a field outside the permitted set
- **WHEN** the system validates it
- **THEN** it responds with a GraphQL error carrying the `INVALID_QUERY` code rather than ignoring the argument

#### Scenario: Single-item query resolves by slug or id
- **GIVEN** a published entry with slug `hello-world` in collection `blog`
- **WHEN** the single-item query for `blog` is executed with that slug
- **THEN** the entry is returned, and the same query executed with the entry's id returns the same entry

#### Scenario: Only published entries are reachable
- **GIVEN** a collection containing one published and one draft entry
- **WHEN** its list query is executed
- **THEN** only the published entry appears, and the draft's single-item query returns null

### Requirement: Relationship fields resolve as nested selectable fields
The system SHALL let a query select fields on a relationship's referenced entry as nested selections within the same request, resolving all references for a query's selection set through batched lookups so that resolution cost is bounded by the number of distinct target collections referenced, not by the number of entries or references.

#### Scenario: Nested relationship selection returns referenced fields
- **GIVEN** an entry whose relationship field references a published entry in another collection
- **WHEN** a query selects fields on that nested relationship
- **THEN** the response includes the requested fields from the referenced entry, resolved in the same request

#### Scenario: Dangling reference resolves to null
- **GIVEN** a relationship field referencing an entry that is deleted or unpublished
- **WHEN** a query selects that field
- **THEN** the field resolves to null rather than an error

#### Scenario: Reference resolution does not scale with result size
- **GIVEN** a list query returning many entries that each reference the same target collection
- **WHEN** the query executes
- **THEN** the references for that target collection are resolved through a bounded number of queries rather than one query per entry

### Requirement: Errors use a GraphQL-native envelope drawn from the same closed code set
The system SHALL report every failure as a GraphQL `errors` entry carrying an `extensions.code` value from the same closed error-code set used by the REST API, and SHALL NOT expose database errors, stack traces, internal identifiers, or validator internals in any error message or extension.

#### Scenario: Unexpected failure is opaque
- **GIVEN** a query that triggers an unexpected server-side error
- **WHEN** the response is produced
- **THEN** it carries a generic error code and message, and no database or stack detail

#### Scenario: Partial failure does not block sibling data
- **GIVEN** a query selecting one field that fails to resolve alongside other fields that succeed
- **WHEN** the response is produced
- **THEN** the successful fields are returned in `data` alongside an `errors` entry naming the failed field

### Requirement: The endpoint is not exposed to cross-origin browser callers
Since a key valid for this API is a secret credential, the system SHALL NOT emit cross-origin resource sharing headers permitting browser-originated calls to the GraphQL endpoint, matching the REST Content Delivery API's cross-origin posture.

#### Scenario: No permissive CORS header
- **GIVEN** any GraphQL endpoint response
- **WHEN** its headers are inspected
- **THEN** no header grants cross-origin access to arbitrary origins
