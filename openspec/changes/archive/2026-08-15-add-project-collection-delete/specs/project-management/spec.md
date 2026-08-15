## ADDED Requirements

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
