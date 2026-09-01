## ADDED Requirements

### Requirement: Tenant can rename a project they own
The system SHALL let an authenticated tenant change the name of a project they own. The project's slug, id, and all associated collections, fields, entries, and entry values SHALL remain unchanged by a rename.

#### Scenario: Successful rename
- **GIVEN** a tenant owns a project named "Blog"
- **WHEN** they submit a new name "Marketing Blog"
- **THEN** the project's name is updated to "Marketing Blog" and its slug, id, and all associated collections and entries remain unchanged

#### Scenario: Empty name rejected
- **GIVEN** a tenant is renaming a project they own
- **WHEN** they submit an empty or whitespace-only name
- **THEN** the system rejects the submission with a validation error and the project's name remains unchanged

#### Scenario: Non-owner cannot rename another tenant's project
- **GIVEN** a project exists that is not owned by the authenticated tenant
- **WHEN** they attempt to rename that project (including by directly submitting its id)
- **THEN** the system denies the request and the project's name remains unchanged

#### Scenario: Renamed project reflects immediately on the dashboard
- **GIVEN** a tenant has just renamed one of their projects
- **WHEN** they view the dashboard
- **THEN** the project is listed under its new name
</content>
