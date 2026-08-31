## ADDED Requirements

### Requirement: Content endpoints require a valid API key
The system SHALL authenticate every request to the versioned content API against an API key presented as `Authorization: Bearer <token>` or `X-API-Key: <token>`, and SHALL reject unauthenticated, malformed, revoked, or expired credentials.

#### Scenario: Missing credential rejected
- **GIVEN** a request to a content endpoint carrying no key header
- **WHEN** the system handles it
- **THEN** it responds `401` with error code `UNAUTHORIZED` and no content

#### Scenario: Expired key rejected
- **GIVEN** an API key whose expiry has passed
- **WHEN** a request presents it
- **THEN** the request is rejected as unauthorized before any content query runs

#### Scenario: Either header form is accepted
- **GIVEN** a valid token
- **WHEN** it is presented in `Authorization: Bearer` or in `X-API-Key`
- **THEN** both forms authenticate identically

### Requirement: Scope derives solely from the API key
The system SHALL derive the tenant and project for every content request from the validated API key alone, and SHALL NOT read either from a path segment, query parameter, request body, or header.

#### Scenario: Cross-project content is unreachable
- **GIVEN** a key scoped to project P
- **WHEN** a request addresses a collection belonging to project Q of the same tenant
- **THEN** the system responds `404` rather than returning that collection

#### Scenario: Cross-tenant content is unreachable
- **GIVEN** a key belonging to tenant A
- **WHEN** a request addresses a collection or entry id belonging to tenant B
- **THEN** the system responds `404` rather than returning that resource

#### Scenario: Content reads run through tenant-scoped access
- **GIVEN** an authenticated content request
- **WHEN** the handler queries collections, fields, or entries
- **THEN** those queries are issued through the tenant-scoped database handle, not an unscoped one

### Requirement: Only published entries are delivered
The system SHALL return only entries whose status is `published`, in list and item responses alike.

#### Scenario: Draft excluded from a list
- **GIVEN** a collection containing one published and one draft entry
- **WHEN** its items are listed
- **THEN** only the published entry appears and the reported total counts only it

#### Scenario: Draft is not addressable
- **GIVEN** a draft entry's slug
- **WHEN** it is requested directly
- **THEN** the system responds `404`, indistinguishable from a slug that does not exist

### Requirement: Collections and their field schemas are discoverable
The system SHALL expose the collections available to the key's project, and for each collection the field definitions a consumer needs to interpret entries — machine key, widget type, required flag, and the configuration that determines a field's output type.

#### Scenario: Collections listed for the key's project
- **GIVEN** a key scoped to a project holding collections `blog` and `authors`
- **WHEN** the collections are listed
- **THEN** both appear and no collection from another project does

#### Scenario: Field schema exposed
- **GIVEN** a collection with a `select` field configured as multiple
- **WHEN** its schema is requested
- **THEN** the response reports the field's key, widget type, required flag, and that it holds multiple values

### Requirement: Resources are addressable by slug or id
The system SHALL resolve a collection and an entry from a URL segment by slug within the enclosing scope, falling back to the resource's identifier.

#### Scenario: Slug address resolves
- **GIVEN** a published entry with slug `hello-world` in collection `blog`
- **WHEN** it is requested by that collection slug and entry slug
- **THEN** the entry is returned

#### Scenario: Identifier address resolves
- **GIVEN** the same entry
- **WHEN** it is requested by collection id and entry id
- **THEN** the same entry is returned

#### Scenario: Entry addressed under the wrong collection is not found
- **GIVEN** a published entry belonging to collection `blog`
- **WHEN** it is requested under collection `authors`
- **THEN** the system responds `404`

### Requirement: Lists are paginated with a total ordering
The system SHALL paginate every list response, cap the page size, report pagination metadata, and order results by a total ordering so no row can be duplicated or skipped across pages.

#### Scenario: Default page size applied
- **GIVEN** a collection holding more entries than the default page size
- **WHEN** items are listed without pagination parameters
- **THEN** the default number of entries is returned along with the total count, page size, and offset

#### Scenario: Oversized page size capped
- **GIVEN** a request asking for more than the maximum page size
- **WHEN** the system handles it
- **THEN** it returns at most the maximum rather than the requested amount

#### Scenario: Entries sharing a timestamp paginate stably
- **GIVEN** several entries whose creation timestamps are identical
- **WHEN** the collection is walked one page at a time
- **THEN** every entry appears exactly once across the pages

#### Scenario: Unsupported ordering rejected
- **GIVEN** a request ordering by a column outside the permitted set
- **WHEN** the system validates the query
- **THEN** it responds `400` with error code `INVALID_QUERY` rather than ignoring the parameter or interpolating it into a query

### Requirement: Entry values are delivered keyed by field key
The system SHALL serialize an entry's values keyed by each field's machine key rather than its internal identifier, and SHALL include every field declared on the collection.

#### Scenario: Values keyed by machine key
- **GIVEN** an entry whose collection declares a field with key `title`
- **WHEN** the entry is delivered
- **THEN** its value appears under `title`, not under the field's internal identifier

#### Scenario: Absent optional value is present as null
- **GIVEN** an entry that left an optional field empty, for which no value is stored
- **WHEN** the entry is delivered
- **THEN** that field's key is present with a null value rather than being omitted

#### Scenario: Misconfigured field does not break the entry
- **GIVEN** a collection containing one field whose stored configuration no longer parses
- **WHEN** an entry in that collection is delivered
- **THEN** the entry is returned with that field null and a warning naming it, and every other field serialized normally

### Requirement: Each widget type defines its own delivered form
The system SHALL derive a field's delivered representation from its widget definition, so that adding a widget type does not require editing the serializer.

#### Scenario: Rich text delivered as rendered markup and plain text
- **GIVEN** an entry with a rich text field containing a heading and a link
- **WHEN** the entry is delivered
- **THEN** the field carries rendered HTML and a plain-text rendering, and does not carry the editor's internal document format

#### Scenario: Rich text markup is safe to embed
- **GIVEN** a rich text value containing a link with a `javascript:` target and text containing HTML special characters
- **WHEN** the field is rendered
- **THEN** the unsafe link target is dropped and the text is escaped

#### Scenario: Relationship delivered as an addressable reference
- **GIVEN** an entry whose relationship field references a published entry in another collection
- **WHEN** the entry is delivered
- **THEN** the field carries the referenced entry's identifier, slug, and collection, rather than a bare identifier

#### Scenario: Dangling reference delivered as null
- **GIVEN** a relationship field referencing an entry that is deleted or unpublished
- **WHEN** the entry is delivered
- **THEN** the field is null rather than carrying an unresolvable identifier

#### Scenario: Date and time normalized
- **GIVEN** two entries storing the same instant in different textual forms
- **WHEN** both are delivered
- **THEN** the field carries the same normalized representation for both

#### Scenario: Date-only value keeps its calendar form
- **GIVEN** a date field configured as date-only
- **WHEN** the entry is delivered
- **THEN** the value remains a plain calendar date and is not converted to an instant

#### Scenario: Image delivered as a fully qualified reference
- **GIVEN** an entry with an uploaded image
- **WHEN** the entry is delivered
- **THEN** the field carries a fully qualified URL together with the asset's dimensions and format, and no binary data

### Requirement: Errors are standardized and leak nothing
The system SHALL return every failure as a JSON error carrying a code from a closed set and a human-readable message, and SHALL NOT expose database errors, stack traces, internal identifiers, or validator internals.

#### Scenario: Unexpected failure is opaque
- **GIVEN** a request that triggers an unexpected server-side error
- **WHEN** the response is produced
- **THEN** it carries a generic error code and message, and no database or stack detail

#### Scenario: Unknown route reports not found in the standard shape
- **GIVEN** a request for a collection that does not exist
- **WHEN** the response is produced
- **THEN** it uses the same error envelope as every other failure

### Requirement: The API is not exposed to cross-origin browser callers
Since a key valid for this API is a secret credential, the system SHALL NOT emit cross-origin resource sharing headers permitting browser-originated calls.

#### Scenario: No permissive CORS header
- **GIVEN** any content API response
- **WHEN** its headers are inspected
- **THEN** no header grants cross-origin access to arbitrary origins
