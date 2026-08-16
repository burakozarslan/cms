## Purpose

Lets a tenant define the shape of content inside a project: collections (content types) and their fields, where each field is backed by a widget type that determines its configuration and the value it produces.

## Requirements

### Requirement: Tenant can create a collection in a project
The system SHALL let an authenticated tenant create a named collection within one of their own projects, assigning it a slug unique within that project.

#### Scenario: Successful creation
- **GIVEN** an authenticated tenant viewing a project they own
- **WHEN** they submit a collection name
- **THEN** the system creates a collection owned by that tenant within that project, with a generated slug unique within the project

#### Scenario: Duplicate name within project
- **GIVEN** the project already has a collection whose slug would collide
- **WHEN** the tenant submits a name producing the same slug
- **THEN** the system disambiguates the slug rather than creating an ambiguous duplicate

#### Scenario: Empty name rejected
- **GIVEN** the create-collection form is submitted
- **WHEN** the name is empty or whitespace-only
- **THEN** the system rejects the submission with a validation error and creates no collection

#### Scenario: Collection cannot be created in another tenant's project
- **GIVEN** a project exists that the authenticated tenant does not own
- **WHEN** they submit a collection against that project id
- **THEN** the system denies the request and creates no collection

### Requirement: Tenant can add fields backed by widget types
The system SHALL let a tenant add fields to a collection, each field specifying a widget type drawn from the supported set — `string`, `text`, `select`, `number`, `boolean`, `datetime`, `richtext` — together with a machine key, a display label, a required flag, and widget-specific configuration.

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

### Requirement: Widget configuration is validated against the widget type
The system SHALL validate a field's configuration against a schema determined by its widget type, and SHALL reject configuration that does not match.

#### Scenario: Select requires options
- **GIVEN** a field with widget `select`
- **WHEN** it is submitted with an empty or missing options list
- **THEN** the system rejects it with a validation error

#### Scenario: Number bounds are coherent
- **GIVEN** a field with widget `number`
- **WHEN** it is submitted with a minimum greater than its maximum
- **THEN** the system rejects it with a validation error

#### Scenario: Configuration belonging to a different widget type is rejected
- **GIVEN** a field with widget `boolean`
- **WHEN** it is submitted carrying select options
- **THEN** the system rejects it rather than storing configuration the widget cannot use

#### Scenario: Stored configuration is validated on read
- **GIVEN** a stored field whose configuration no longer matches its widget type's schema
- **WHEN** the collection is opened in the field builder
- **THEN** the system surfaces the field as misconfigured instead of failing to render the collection

### Requirement: Field key is machine-stable and distinct from its label
The system SHALL store a field's machine key separately from its display label, SHALL require the key to be unique within its collection, and SHALL allow either to be edited without altering stored content values.

#### Scenario: Duplicate key within collection rejected
- **GIVEN** a collection already has a field with key `title`
- **WHEN** the tenant adds another field with key `title`
- **THEN** the system rejects the submission with a validation error

#### Scenario: Same key permitted in a different collection
- **GIVEN** two collections in the same project
- **WHEN** each is given a field with key `title`
- **THEN** both are created, because keys are unique per collection rather than per project

#### Scenario: Renaming preserves values
- **GIVEN** a field with existing values across entries
- **WHEN** the tenant changes its key or its label
- **THEN** all existing values remain associated with that field and none are lost or reassigned

#### Scenario: Invalid key format rejected
- **GIVEN** a field key containing spaces, uppercase letters, or leading digits
- **WHEN** it is submitted
- **THEN** the system rejects it with a validation error explaining the permitted format

### Requirement: Field widget type is immutable after creation
The system SHALL NOT allow a field's widget type to change once the field exists, because existing values have no defined conversion between widget types.

#### Scenario: Widget change rejected
- **GIVEN** an existing field with widget `string`
- **WHEN** an update attempts to change its widget to `number`
- **THEN** the system rejects the update and the field retains its original widget type

### Requirement: Fields are explicitly ordered and reorderable by drag
The system SHALL maintain an explicit order for the fields of a collection, SHALL let a tenant reorder them by dragging, and SHALL persist the resulting order as authoritative.

#### Scenario: New field is appended
- **GIVEN** a collection with three ordered fields
- **WHEN** a fourth field is added
- **THEN** it takes the last position

#### Scenario: Drag reorder persists
- **GIVEN** a collection with fields ordered A, B, C
- **WHEN** the tenant drags C above B
- **THEN** the order A, C, B is persisted and shown on reload

#### Scenario: Reorder is applied atomically
- **GIVEN** a reorder is submitted for a collection's fields
- **WHEN** it is applied
- **THEN** all affected positions are written in a single transaction, leaving no partially reordered state

#### Scenario: Reorder cannot import foreign fields
- **GIVEN** a reorder request listing a field id belonging to a different collection
- **WHEN** the system processes it
- **THEN** the request is rejected and no order changes

### Requirement: A collection designates a display title field
The system SHALL allow a collection to designate one of its fields as the field whose value labels its entries, and SHALL fall back to a deterministic alternative when no such field is designated or its value is empty.

#### Scenario: Designated title labels entries
- **GIVEN** a collection whose title field is `title`
- **WHEN** its entry list is displayed
- **THEN** each entry is labelled with its own `title` value

#### Scenario: Fallback when undesignated
- **GIVEN** a collection with no designated title field
- **WHEN** its entry list is displayed
- **THEN** entries are labelled by the first string field's value, falling back to the entry slug, falling back to a placeholder label

#### Scenario: Deleting the title field clears the designation
- **GIVEN** a collection whose designated title field is deleted
- **WHEN** the deletion completes
- **THEN** the collection has no designated title field and its entry list falls back rather than erroring

### Requirement: Deleting a field permanently deletes its content values
The system SHALL hard-delete a field together with every value stored against it, and SHALL warn the tenant with the number of affected entries before doing so. The confirmation SHALL NOT be presented except in direct response to the tenant explicitly initiating deletion of that field, and canceling the confirmation SHALL dismiss it without deleting the field or any of its values.

#### Scenario: Warned before destructive delete
- **GIVEN** a field with values in 47 entries
- **WHEN** the tenant initiates deletion
- **THEN** the system requires confirmation and states that values in 47 entries will be permanently deleted

#### Scenario: Values are removed with the field
- **GIVEN** the tenant confirms deletion of a field that has values
- **WHEN** the deletion completes
- **THEN** the field and all values stored against it no longer exist, and no orphaned values remain

#### Scenario: Other fields are unaffected
- **GIVEN** an entry with values for fields A, B, and C
- **WHEN** field B is deleted
- **THEN** the entry retains its values for A and C

#### Scenario: Confirmation does not appear unprompted
- **GIVEN** a tenant adds a new field to a collection
- **WHEN** the field is created and its row renders in the field list
- **THEN** no delete confirmation is shown for that field, or any other field, until the tenant explicitly clicks its delete control

#### Scenario: Canceling a delete confirmation leaves the field intact
- **GIVEN** a tenant has opened the delete confirmation for a field
- **WHEN** the tenant clicks Cancel
- **THEN** the confirmation is dismissed, the field and its values remain unchanged, and no further action is required to continue using the field builder

### Requirement: Content model access is confined to the owning tenant
The system SHALL resolve collections and fields only through tenant-scoped access, and SHALL verify that each addressed resource belongs to its addressed parent.

#### Scenario: Cross-tenant collection is not reachable
- **GIVEN** a collection exists that the authenticated tenant does not own
- **WHEN** they navigate to its route
- **THEN** the system denies access instead of rendering it

#### Scenario: Containment is verified, not assumed
- **GIVEN** a tenant owns two projects, each with collections
- **WHEN** they address a collection from project A under project B's route
- **THEN** the system denies the request rather than rendering the mismatched pair

#### Scenario: Tenant is taken from the session
- **GIVEN** a request carrying a tenant identifier in a form field, query string, or header
- **WHEN** the system resolves the acting tenant
- **THEN** it uses the session's tenant and ignores the client-supplied value

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

