## ADDED Requirements

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
