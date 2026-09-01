## Purpose

Lets an authenticated tenant create and view the projects — independent content silos — that belong to them.

## ADDED Requirements

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
