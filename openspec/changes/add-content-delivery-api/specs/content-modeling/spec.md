## ADDED Requirements

### Requirement: Renaming a field key warns when the project is consumed externally
Since a field's machine key is the identifier under which its value is delivered by the content API, the system SHALL warn a tenant that renaming it will break external consumers, whenever the enclosing project holds at least one active API key.

#### Scenario: Warning shown for a consumed project
- **GIVEN** a project holding an active API key
- **WHEN** a tenant edits an existing field's machine key
- **THEN** the editor warns that the key is read by the content API and that renaming it will break consumers referencing it

#### Scenario: No warning without consumers
- **GIVEN** a project holding no active API key
- **WHEN** a tenant edits an existing field's machine key
- **THEN** no such warning is shown

#### Scenario: The warning does not block the rename
- **GIVEN** the warning is displayed
- **WHEN** the tenant proceeds
- **THEN** the rename succeeds, since the tenant owns both the schema and its consumers
