## MODIFIED Requirements

### Requirement: Tenant can add fields backed by widget types
The system SHALL let a tenant add fields to a collection, each field specifying a widget type drawn from the supported set — `string`, `text`, `select`, `number`, `boolean`, `datetime`, `richtext`, `relationship` — together with a machine key, a display label, a required flag, and widget-specific configuration.

#### Scenario: Field created with a supported widget type
- **GIVEN** a tenant is editing a collection they own
- **WHEN** they add a field with key `title`, label `Title`, and widget `string`
- **THEN** the system creates the field on that collection, positioned last

#### Scenario: Unsupported widget type rejected
- **GIVEN** a field submission naming a widget type outside the supported set
- **WHEN** the system validates it
- **THEN** the submission is rejected with a validation error and no field is created

#### Scenario: Richtext is offered
- **GIVEN** a tenant is choosing a widget type for a new field
- **WHEN** the widget type list is presented
- **THEN** `richtext` is among the selectable options, no longer excluded now that this widget type ships

#### Scenario: Relationship is offered
- **GIVEN** a tenant is choosing a widget type for a new field
- **WHEN** the widget type list is presented
- **THEN** `relationship` is among the selectable options

### Requirement: Tenant can delete a collection they own
The system SHALL let an authenticated tenant permanently delete a collection they own, and SHALL require explicit confirmation stating what will be lost before the deletion happens. Deleting a collection SHALL remove the collection together with every field, entry, and entry value that belongs to it, leaving no orphaned data behind. The project the collection belonged to is unaffected. If any `relationship` field in another collection targets the collection being deleted, the confirmation SHALL additionally state how many such fields exist; deletion proceeds regardless once confirmed, and those fields are left targeting a collection that no longer exists.

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

#### Scenario: Warned when other collections' relationship fields target this one
- **GIVEN** a collection "Author" that a `relationship` field on "Blog Post" targets
- **WHEN** the tenant initiates deleting "Author"
- **THEN** the system states that 1 relationship field elsewhere targets this collection, in addition to any entry count

#### Scenario: No relationship warning when nothing targets the collection
- **GIVEN** a collection that no `relationship` field anywhere targets
- **WHEN** the tenant initiates deleting it
- **THEN** the confirmation states only the entry count, with no relationship-field mention

#### Scenario: Deletion proceeds despite existing relationship fields targeting it
- **GIVEN** a collection targeted by a `relationship` field elsewhere, and the tenant has been warned
- **WHEN** they confirm the deletion
- **THEN** the collection is deleted and the relationship field elsewhere is left targeting a collection that no longer exists, per the relationship-widget capability's handling of an unresolvable target
