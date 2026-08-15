## MODIFIED Requirements

### Requirement: Entry editor renders an input matching each field's widget
The system SHALL render each field of a collection using the input appropriate to its widget type and configuration.

#### Scenario: Widget inputs
- **GIVEN** a collection containing one field of each supported widget type
- **WHEN** the entry editor renders
- **THEN** `string` renders a single-line text input, `text` a multi-line textarea, `select` a dropdown of its configured options, `number` a numeric input honouring its configured bounds and step, `boolean` a toggle, `datetime` a date-and-time picker, `richtext` a formatting-capable rich text editor, and `relationship` a searchable picker of the target collection's entries

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

#### Scenario: Relationship value must reference an existing entry in the target collection
- **GIVEN** a `relationship` field targeting collection "Author"
- **WHEN** an entry is saved referencing an entry id that is not a current member of "Author"
- **THEN** the system rejects the save with a validation error

#### Scenario: Validation reflects the current field definitions
- **GIVEN** a field's configuration is changed after an entry editor was opened
- **WHEN** that editor submits a save
- **THEN** validation runs against the current configuration, not the configuration in effect when the editor loaded

### Requirement: Deleting an entry deletes its values
The system SHALL hard-delete an entry together with all values stored against it, after confirmation. If any other entry references the entry being deleted through a `relationship` field, the confirmation SHALL additionally state how many such referencing entries exist; deletion proceeds regardless once confirmed, and those references are left pointing at an entry that no longer exists.

#### Scenario: Entry and values removed
- **GIVEN** an entry with values across several fields
- **WHEN** the tenant confirms its deletion
- **THEN** the entry and all its values no longer exist, and no orphaned values remain

#### Scenario: Field definitions survive
- **GIVEN** a collection with fields and entries
- **WHEN** an entry is deleted
- **THEN** the collection's field definitions are unaffected

#### Scenario: Warned when other entries reference this one
- **GIVEN** an author entry referenced by 3 blog post entries through a `relationship` field
- **WHEN** the tenant initiates deleting that author entry
- **THEN** the system states that 3 other entries reference this one, in addition to any other confirmation content

#### Scenario: No relationship warning when nothing references the entry
- **GIVEN** an entry that no `relationship` value anywhere references
- **WHEN** the tenant initiates deleting it
- **THEN** the confirmation includes no referencing-entries mention

#### Scenario: Deletion proceeds despite existing references
- **GIVEN** an entry referenced by others, and the tenant has been warned
- **WHEN** they confirm the deletion
- **THEN** the entry is deleted and the referencing entries' relationship values are left pointing at an entry that no longer exists, per the relationship-widget capability's handling of a deleted referenced entry
