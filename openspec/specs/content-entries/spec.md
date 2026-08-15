## Purpose

Lets a tenant author content against a collection's field definitions: creating, listing, editing, and deleting entries, with every submitted value validated server-side against the widget type and configuration of the field it belongs to.

## Requirements

### Requirement: Tenant can create and edit entries in a collection
The system SHALL let an authenticated tenant create entries in a collection they own, edit those entries' values, and persist each value against the field it belongs to.

#### Scenario: Entry created with values
- **GIVEN** a collection with fields `title` (string) and `published` (boolean)
- **WHEN** the tenant creates an entry supplying both values
- **THEN** the entry is created and both values are stored against their respective fields

#### Scenario: Entry edited
- **GIVEN** an existing entry
- **WHEN** the tenant changes one field's value and saves
- **THEN** that value is updated and the entry's other values are unchanged

#### Scenario: Empty optional field stores no value
- **GIVEN** a collection with an optional field
- **WHEN** an entry is saved leaving it blank
- **THEN** the entry saves successfully and reads back with that field empty

#### Scenario: Save is atomic
- **GIVEN** an entry save that writes several values
- **WHEN** any part of the write fails
- **THEN** no partial value set is persisted

### Requirement: Entry editor renders an input matching each field's widget
The system SHALL render each field of a collection using the input appropriate to its widget type and configuration.

#### Scenario: Widget inputs
- **GIVEN** a collection containing one field of each supported widget type
- **WHEN** the entry editor renders
- **THEN** `string` renders a single-line text input, `text` a multi-line textarea, `select` a dropdown of its configured options, `number` a numeric input honouring its configured bounds and step, `boolean` a toggle, `datetime` a date-and-time picker, and `richtext` a formatting-capable rich text editor

#### Scenario: Fields render in their defined order
- **GIVEN** a collection whose fields are ordered A, B, C
- **WHEN** the entry editor renders
- **THEN** the inputs appear in the order A, B, C

#### Scenario: Reordering fields reorders the editor
- **GIVEN** the tenant reorders a collection's fields
- **WHEN** the entry editor is reopened
- **THEN** the inputs reflect the new order

### Requirement: Submitted values are validated server-side against field definitions
The system SHALL validate every submitted value on the server against a schema derived from its field's widget type and stored configuration, and SHALL reject an entry save whose values do not conform — regardless of what the client permitted.

#### Scenario: Client-side constraints are not trusted
- **GIVEN** a `number` field configured with a maximum of 10
- **WHEN** a save is submitted with the value 99 by bypassing the browser input
- **THEN** the system rejects the save with a validation error and stores nothing

#### Scenario: Select value must be among configured options
- **GIVEN** a `select` field configured with options `a`, `b`, `c`
- **WHEN** a save is submitted with the value `z`
- **THEN** the system rejects the save with a validation error

#### Scenario: Number value type is honoured
- **GIVEN** a `number` field configured with an integer value type
- **WHEN** a save is submitted with a fractional value
- **THEN** the system rejects the save with a validation error

#### Scenario: Datetime must be a valid instant
- **GIVEN** a `datetime` field
- **WHEN** a save is submitted with an unparseable value
- **THEN** the system rejects the save with a validation error

#### Scenario: Values for fields outside the collection are rejected
- **GIVEN** an entry save carrying a value keyed to a field belonging to another collection
- **WHEN** the system validates it
- **THEN** the save is rejected and no value is written

#### Scenario: Required field must be present
- **GIVEN** a field marked required
- **WHEN** an entry is saved with it empty
- **THEN** the system rejects the save with a validation error naming that field

#### Scenario: Richtext document must be structurally valid
- **GIVEN** a `richtext` field
- **WHEN** a save is submitted with a value that is not a well-formed document
- **THEN** the system rejects the save with a validation error

#### Scenario: Validation reflects the current field definitions
- **GIVEN** a field's configuration is changed after an entry editor was opened
- **WHEN** that editor submits a save
- **THEN** validation runs against the current configuration, not the configuration in effect when the editor loaded

### Requirement: Newly required fields do not retroactively invalidate existing entries
The system SHALL enforce a required field at save time only, leaving entries authored before the field became required readable and editable until their next save.

#### Scenario: Existing entry stays readable
- **GIVEN** entries exist in a collection
- **WHEN** a new required field is added to that collection
- **THEN** those entries remain listable and openable

#### Scenario: Requirement enforced on next save
- **GIVEN** an entry predating a newly required field
- **WHEN** the tenant saves it without supplying that field
- **THEN** the system rejects the save with a validation error

### Requirement: Entries have a draft or published status
The system SHALL give every entry a status of either draft or published, defaulting to draft on creation, and SHALL let a tenant change it.

#### Scenario: New entry defaults to draft
- **GIVEN** a tenant creates an entry
- **WHEN** the entry is stored
- **THEN** its status is draft

#### Scenario: Status can be changed
- **GIVEN** a draft entry
- **WHEN** the tenant publishes it
- **THEN** its status is published and the change is reflected in the entry list

#### Scenario: Invalid status rejected
- **GIVEN** a save submitting a status outside draft and published
- **WHEN** the system validates it
- **THEN** the save is rejected

### Requirement: Entries have a slug unique within their collection
The system SHALL assign each entry a slug unique within its collection, derived where possible from the entry's title value, and SHALL keep that slug stable when the title changes.

#### Scenario: Slug derived from title
- **GIVEN** a collection whose title field is `title`
- **WHEN** an entry is created with title `Hello World`
- **THEN** its slug is derived from that title

#### Scenario: Colliding slug disambiguated
- **GIVEN** a collection already containing an entry with slug `hello-world`
- **WHEN** another entry is created producing the same slug
- **THEN** the system disambiguates it rather than creating a duplicate

#### Scenario: Slug survives a title edit
- **GIVEN** an existing entry with a slug derived from its title
- **WHEN** the tenant edits the title and saves
- **THEN** the slug is unchanged

#### Scenario: Fallback when no usable title
- **GIVEN** a collection with no designated title field, or an entry whose title value is empty
- **WHEN** an entry is created
- **THEN** the system generates a unique fallback slug rather than failing

### Requirement: Entry list is labelled and loads in a bounded number of queries
The system SHALL list a collection's entries labelled by their display title, and SHALL do so with a query count that does not grow with the number of entries listed.

#### Scenario: Entries labelled by title value
- **GIVEN** a collection of entries whose title field is populated
- **WHEN** the entry list is displayed
- **THEN** each entry shows its own title value

#### Scenario: No per-entry query
- **GIVEN** a collection containing many entries
- **WHEN** the entry list is loaded
- **THEN** the number of database queries issued is independent of the number of entries

#### Scenario: Empty state prompts creation
- **GIVEN** a collection with zero entries
- **WHEN** the tenant opens it
- **THEN** the system shows a create-first-entry prompt instead of an empty list

### Requirement: Deleting an entry deletes its values
The system SHALL hard-delete an entry together with all values stored against it, after confirmation.

#### Scenario: Entry and values removed
- **GIVEN** an entry with values across several fields
- **WHEN** the tenant confirms its deletion
- **THEN** the entry and all its values no longer exist, and no orphaned values remain

#### Scenario: Field definitions survive
- **GIVEN** a collection with fields and entries
- **WHEN** an entry is deleted
- **THEN** the collection's field definitions are unaffected

### Requirement: Entry access is confined to the owning tenant
The system SHALL resolve entries only through tenant-scoped access, and SHALL verify that an addressed entry belongs to its addressed collection.

#### Scenario: Cross-tenant entry is not reachable
- **GIVEN** an entry exists that the authenticated tenant does not own
- **WHEN** they navigate to its route
- **THEN** the system denies access instead of rendering it

#### Scenario: Cross-tenant write is refused
- **GIVEN** an entry belonging to another tenant
- **WHEN** a save or delete is submitted against its id
- **THEN** the system refuses the operation and the entry is unchanged

#### Scenario: Entry must belong to its addressed collection
- **GIVEN** two collections owned by the same tenant
- **WHEN** an entry from the first is addressed under the second's route
- **THEN** the system denies the request rather than rendering the mismatched pair
