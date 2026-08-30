## MODIFIED Requirements

### Requirement: Tenant can add fields backed by widget types
The system SHALL let a tenant add fields to a collection, each field specifying a widget type drawn from the supported set — `string`, `text`, `select`, `number`, `boolean`, `datetime`, `richtext`, `relationship`, `image` — together with a machine key, a display label, a required flag, and widget-specific configuration.

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

#### Scenario: Image is offered
- **GIVEN** a tenant is choosing a widget type for a new field
- **WHEN** the widget type list is presented
- **THEN** `image` is among the selectable options, no longer excluded now that this widget type ships
