## Purpose

Gives an authenticated project member an in-dashboard, read-only reference for
the Content Delivery API's endpoints, request shapes, and example success and
error responses, so they no longer need the `docs/api.md` file to integrate.

## Requirements

### Requirement: API docs tab in project settings

The system SHALL display an "API docs" entry in the project settings
navigation, alongside "API keys" and "Webhooks", linking to
`/dashboard/:projectId/settings/api-docs`.

#### Scenario: Tab visible in settings navigation

- **WHEN** an authenticated member with access to a project opens any page
  under that project's settings
- **THEN** the settings navigation shows an "API docs" link alongside
  "API keys" and "Webhooks"

#### Scenario: Tab navigates to the API docs page

- **WHEN** the member clicks the "API docs" link
- **THEN** the system navigates to `/dashboard/:projectId/settings/api-docs`
  and renders the API documentation page for that project

### Requirement: Access control matches other settings tabs

The system SHALL require an authenticated session and a resolvable project
scoped to the caller's tenant before rendering the API docs page, matching
the access rule already enforced by the "API keys" and "Webhooks" tabs.

#### Scenario: Unauthenticated visitor is redirected

- **WHEN** a visitor without an active session requests
  `/dashboard/:projectId/settings/api-docs`
- **THEN** the system redirects them to the login page instead of rendering
  the page

#### Scenario: Project not found or outside caller's tenant

- **WHEN** an authenticated member requests the API docs page for a
  `:projectId` that does not exist, or that belongs to a different tenant
- **THEN** the system responds with a not-found result instead of rendering
  the page

### Requirement: Endpoint reference lists every Content Delivery API route

The API docs page SHALL list all four `/api/v1` Content Delivery API
endpoints, and for each SHALL show its HTTP method, path, a description, and
that it requires API key authentication.

#### Scenario: All four endpoints are listed

- **WHEN** the member views the API docs page
- **THEN** the page lists `GET /api/v1/collections`,
  `GET /api/v1/collections/:collection`,
  `GET /api/v1/collections/:collection/items`, and
  `GET /api/v1/collections/:collection/items/:item`, each with its HTTP
  method and path shown

#### Scenario: Authentication requirement is stated per endpoint

- **WHEN** the member views any endpoint's entry on the page
- **THEN** the entry states that the request must include an API key, via
  either the `Authorization: Bearer` or `X-API-Key` header

### Requirement: Query parameters documented for the items list endpoint

The API docs page SHALL document the `limit`, `offset`, `order`, and
`direction` query parameters accepted by
`GET /api/v1/collections/:collection/items`, including each parameter's
default value and accepted values.

#### Scenario: Query parameter defaults and constraints are shown

- **WHEN** the member views the `GET /api/v1/collections/:collection/items`
  entry
- **THEN** the page shows that `limit` defaults to `20` and is capped at
  `100`, `offset` defaults to `0`, `order` defaults to `created_at` and
  accepts only `created_at` or `updated_at`, and `direction` defaults to
  `desc` and accepts only `asc` or `desc`

### Requirement: Example success response shown for every endpoint

The API docs page SHALL show at least one example JSON success response for
each of the four endpoints, matching the response envelope
(`{ "data": ... }`, with `{ "data": ..., "meta": ... }` for the paginated
list endpoint) that the live API returns.

#### Scenario: Example response uses the documented envelope

- **WHEN** the member views any endpoint's example success response
- **THEN** the example is valid JSON wrapped in a top-level `data` field, and
  the paginated items-list example also includes a top-level `meta` field
  with `total`, `limit`, and `offset`

### Requirement: Example error responses shown for every endpoint

The API docs page SHALL show, for each endpoint, the error responses that
endpoint can return, each as an example JSON error envelope
(`{ "error": { "code", "message" } }`) paired with its HTTP status code and
error `code`.

#### Scenario: Common error codes are documented

- **WHEN** the member views the error responses section
- **THEN** the page documents `401 UNAUTHORIZED` (missing, malformed, revoked,
  or expired key) and `500 INTERNAL` (unexpected server error) as possible
  for every endpoint, `404 NOT_FOUND` (unresolvable collection or item,
  including drafts) for the three endpoints that take a `:collection` or
  `:item` path segment, and `400 INVALID_QUERY` (unknown or unparseable query
  parameter) for `GET /api/v1/collections/:collection/items`

#### Scenario: Error example matches the documented envelope

- **WHEN** the member views any example error response
- **THEN** the example is valid JSON of the shape
  `{ "error": { "code": "<CODE>", "message": "<string>" } }`, with `<CODE>`
  matching the error code named alongside it

### Requirement: Documentation content is static and read-only

The API docs page SHALL render fixed reference content describing the
`/api/v1` surface. It SHALL NOT execute live requests against the API, and
SHALL NOT read or display any tenant data (collections, entries, API keys, or
webhook configuration) beyond the project's own name used for page
navigation/breadcrumbs.

#### Scenario: Page renders without querying tenant content

- **WHEN** the API docs page is requested for a project that has zero
  collections and zero entries
- **THEN** the page still renders the full endpoint reference and examples
  unchanged, with no error and no empty-state messaging tied to collection or
  entry counts
