## Purpose

Ensures every read and write against tenant-owned tables is automatically scoped to the acting tenant, so no route or query can leak or mutate another tenant's data even by omission.

## Requirements

### Requirement: Tenant-owned queries are automatically scoped
The system SHALL scope every query against a tenant-owned table (e.g., `projects`) to the acting tenant's `tenant_id` automatically, without requiring each call site to remember to add the filter.

#### Scenario: Read scoped to tenant
- **GIVEN** tenant A and tenant B each have their own projects
- **WHEN** tenant A's session queries the project list
- **THEN** only tenant A's projects are returned

#### Scenario: Write scoped to tenant
- **GIVEN** an authenticated tenant A session
- **WHEN** tenant A creates a project
- **THEN** the created row's `tenant_id` is set to tenant A's id regardless of any client-supplied value

### Requirement: Unscoped access to tenant-owned tables is disallowed
Route handlers and server actions SHALL NOT query tenant-owned tables through a raw, unscoped database client.

#### Scenario: Cross-tenant read blocked
- **GIVEN** tenant A is authenticated
- **WHEN** tenant A requests a resource id that belongs to tenant B
- **THEN** the system returns a not-found or forbidden result rather than tenant B's data

### Requirement: URL-supplied resource identifiers are ownership-checked
Since a resource identifier in a URL (e.g., `projectId`) is client-supplied and not trustworthy on its own, the system SHALL verify the resource belongs to the acting tenant before returning or mutating it.

#### Scenario: Foreign resource id rejected
- **GIVEN** tenant A is authenticated
- **WHEN** tenant A requests a project-scoped route for a project owned by tenant B
- **THEN** the system denies access instead of only checking that the project exists

### Requirement: Credential tables are tenant-scoped and resolved through a single carve-out
Since a credential must be resolved to its owning tenant *before* a tenant context exists, a tenant-owned table that also serves as a credential lookup SHALL remain in the tenant-scoped table list for all ordinary access, and its pre-context lookup SHALL be confined to one dedicated module that returns identifiers only.

#### Scenario: Ordinary access is automatically scoped
- **GIVEN** tenant A and tenant B each hold credentials
- **WHEN** tenant A lists or revokes credentials from the dashboard
- **THEN** only tenant A's rows are reachable, by automatic scoping rather than a hand-written filter

#### Scenario: Pre-context lookup returns no content
- **GIVEN** a credential presented by an unauthenticated caller
- **WHEN** the system resolves it without a tenant context
- **THEN** the unscoped read returns only the owning identifiers and credential metadata, and no tenant content

#### Scenario: Downstream reads are scoped again
- **GIVEN** a credential that has resolved to a tenant
- **WHEN** the request goes on to read tenant-owned content
- **THEN** those reads are issued through the tenant-scoped handle derived from the resolved tenant

#### Scenario: The carve-out does not spread
- **GIVEN** the codebase
- **WHEN** modules importing the unscoped database handle are enumerated
- **THEN** they are limited to migrations, the identity flows that predate a tenant context, and the single credential-resolution module
