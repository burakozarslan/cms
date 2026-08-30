## MODIFIED Requirements

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

#### Scenario: Image value must be well-formed Cloudinary asset metadata
- **GIVEN** an `image` field
- **WHEN** a save is submitted with a value that is not a well-formed asset metadata object (missing secure URL or public identifier, or of the wrong shape)
- **THEN** the system rejects the save with a validation error

#### Scenario: Validation reflects the current field definitions
- **GIVEN** a field's configuration is changed after an entry editor was opened
- **WHEN** that editor submits a save
- **THEN** validation runs against the current configuration, not the configuration in effect when the editor loaded
