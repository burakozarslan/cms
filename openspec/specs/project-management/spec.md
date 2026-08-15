## Purpose

Lets an authenticated tenant create and view the projects — independent content silos — that belong to them.

## Requirements

### Requirement: Tenant can create a project
The system SHALL let an authenticated tenant create a project by name, assigning it a slug unique within that tenant.

#### Scenario: Successful creation
- **GIVEN** an authenticated tenant
- **WHEN** they submit a project name
- **THEN** the system creates a project owned by that tenant with a generated slug unique within the tenant

#### Scenario: Duplicate name within tenant
- **GIVEN** the tenant already has a project whose generated slug would collide with a new one
- **WHEN** they submit a name that produces the same slug
- **THEN** the system disambiguates the slug or rejects the submission with a clear error, rather than creating an ambiguous duplicate

#### Scenario: Empty name rejected
- **GIVEN** the create-project form is submitted
- **WHEN** the name is empty or whitespace-only
- **THEN** the system rejects the submission with a validation error and creates no project

### Requirement: Tenant sees only their own projects
The system SHALL list only the acting tenant's own projects on the dashboard.

#### Scenario: Project list scoped to tenant
- **GIVEN** an authenticated tenant with N projects
- **WHEN** they view the dashboard
- **THEN** exactly their N projects are listed and no other tenant's projects appear

#### Scenario: Empty state prompts creation
- **GIVEN** an authenticated tenant with zero projects
- **WHEN** they view the dashboard
- **THEN** the system shows a create-first-project prompt instead of an empty list

### Requirement: Project workspace is reachable only by its owning tenant
The system SHALL render a project's workspace only for the tenant that owns it.

#### Scenario: Owner can open project
- **GIVEN** a tenant owns a project
- **WHEN** they navigate to that project's workspace route
- **THEN** the project workspace renders

#### Scenario: Non-owner is denied
- **GIVEN** a project exists but is not owned by the authenticated tenant
- **WHEN** they navigate to that project's workspace route
- **THEN** the system denies access instead of rendering the workspace

### Requirement: Tenant can delete a project they own
The system SHALL let an authenticated tenant permanently delete a project they own, and SHALL require explicit confirmation stating what will be lost before the deletion happens. Deleting a project SHALL remove the project together with every collection, field, entry, and entry value that belongs to it, leaving no orphaned data behind.

#### Scenario: Warned before destructive delete
- **GIVEN** a tenant owns a project with 3 collections and 12 entries across those collections
- **WHEN** they initiate deleting the project
- **THEN** the system requires confirmation and states that 3 collections and 12 entries will be permanently deleted

#### Scenario: Confirmed delete removes the project and its contents
- **GIVEN** a tenant confirms deletion of a project that has collections and entries
- **WHEN** the deletion completes
- **THEN** the project, its collections, fields, entries, and entry values no longer exist, and no orphaned records remain

#### Scenario: Canceling a delete confirmation leaves the project intact
- **GIVEN** a tenant has opened the delete confirmation for a project they own
- **WHEN** they cancel instead of confirming
- **THEN** the project and all of its contents remain exactly as they were

#### Scenario: Empty project deletes without a content warning
- **GIVEN** a tenant owns a project with no collections
- **WHEN** they initiate deleting the project
- **THEN** the system still requires confirmation but does not claim any collections or entries will be affected

#### Scenario: Non-owner cannot delete another tenant's project
- **GIVEN** a project exists that is not owned by the authenticated tenant
- **WHEN** they attempt to delete that project (including by directly submitting its id)
- **THEN** the system denies the request and the project remains untouched

#### Scenario: Deleted project disappears from the dashboard
- **GIVEN** a tenant has just deleted one of their projects
- **WHEN** they view the dashboard
- **THEN** the deleted project no longer appears in their project list

