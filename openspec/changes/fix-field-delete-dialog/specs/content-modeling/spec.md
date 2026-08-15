## MODIFIED Requirements

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
