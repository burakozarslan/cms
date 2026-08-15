## ADDED Requirements

### Requirement: Tenant can delete a collection they own
The system SHALL let an authenticated tenant permanently delete a collection they own, and SHALL require explicit confirmation stating what will be lost before the deletion happens. Deleting a collection SHALL remove the collection together with every field, entry, and entry value that belongs to it, leaving no orphaned data behind. The project the collection belonged to is unaffected.

#### Scenario: Warned before destructive delete
- **GIVEN** a collection with 5 fields and 20 entries
- **WHEN** the tenant initiates deleting the collection
- **THEN** the system requires confirmation and states that 20 entries will be permanently deleted

#### Scenario: Confirmed delete removes the collection and its contents
- **GIVEN** a tenant confirms deletion of a collection that has fields and entries
- **WHEN** the deletion completes
- **THEN** the collection, its fields, entries, and entry values no longer exist, and no orphaned records remain

#### Scenario: Canceling a delete confirmation leaves the collection intact
- **GIVEN** a tenant has opened the delete confirmation for a collection they own
- **WHEN** they cancel instead of confirming
- **THEN** the collection and all of its contents remain exactly as they were

#### Scenario: Sibling collections and the parent project are unaffected
- **GIVEN** a project with collections A and B
- **WHEN** collection A is deleted
- **THEN** the project and collection B, along with B's fields and entries, remain untouched

#### Scenario: Non-owner cannot delete a collection in another tenant's project
- **GIVEN** a collection exists in a project that is not owned by the authenticated tenant
- **WHEN** they attempt to delete that collection (including by directly submitting its id)
- **THEN** the system denies the request and the collection remains untouched

#### Scenario: Deleted collection disappears from the project workspace
- **GIVEN** a tenant has just deleted one of their collections
- **WHEN** they view that project's workspace
- **THEN** the deleted collection no longer appears in the collection list
