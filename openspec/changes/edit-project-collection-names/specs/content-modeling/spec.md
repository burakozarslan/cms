## ADDED Requirements

### Requirement: Tenant can rename a collection they own
The system SHALL let an authenticated tenant change the name of a collection within one of their own projects. The collection's slug, id, project association, fields, entries, and entry values SHALL remain unchanged by a rename.

#### Scenario: Successful rename
- **GIVEN** a tenant owns a collection named "Posts" within a project
- **WHEN** they submit a new name "Blog Posts"
- **THEN** the collection's name is updated to "Blog Posts" and its slug, id, project, fields, and entries remain unchanged

#### Scenario: Empty name rejected
- **GIVEN** a tenant is renaming a collection they own
- **WHEN** they submit an empty or whitespace-only name
- **THEN** the system rejects the submission with a validation error and the collection's name remains unchanged

#### Scenario: Non-owner cannot rename a collection in another tenant's project
- **GIVEN** a collection exists in a project that is not owned by the authenticated tenant
- **WHEN** they attempt to rename that collection (including by directly submitting its id)
- **THEN** the system denies the request and the collection's name remains unchanged

#### Scenario: Renamed collection reflects immediately in the project workspace
- **GIVEN** a tenant has just renamed one of their collections
- **WHEN** they view that project's workspace
- **THEN** the collection is listed under its new name
</content>
