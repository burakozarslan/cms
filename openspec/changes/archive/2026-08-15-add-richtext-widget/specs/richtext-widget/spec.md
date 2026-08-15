## Purpose

Lets a tenant author formatted long-form content — bold/italic/underline, headings, lists, and links — through a `richtext` field, storing the document as a structured, losslessly round-trippable value rather than plain text.

## ADDED Requirements

### Requirement: Richtext is a selectable widget type
The system SHALL offer `richtext` as a widget type when a tenant adds or edits a field, alongside the existing supported set.

#### Scenario: Field created with the richtext widget
- **GIVEN** a tenant is editing a collection they own
- **WHEN** they add a field with key `body`, label `Body`, and widget `richtext`
- **THEN** the system creates the field on that collection, positioned last

#### Scenario: Richtext field configuration has nothing to set
- **GIVEN** a tenant is configuring a field with widget `richtext`
- **WHEN** the configuration panel is presented
- **THEN** no widget-specific settings are offered, and submitting the field with no configuration succeeds

### Requirement: Richtext editor offers a fixed formatting toolbar
The system SHALL render a richtext field's editor with a fixed set of formatting controls — bold, italic, underline, headings, ordered lists, unordered lists, and links — and SHALL NOT offer tables, images, or embeds.

#### Scenario: Formatting controls available
- **GIVEN** an entry editor with a `richtext` field
- **WHEN** the field's editor renders
- **THEN** the author can apply bold, italic, underline, a heading level, an ordered list, an unordered list, and a link to the document

#### Scenario: Unsupported content types are not offered
- **GIVEN** an entry editor with a `richtext` field
- **WHEN** the field's editor renders
- **THEN** no control for inserting a table, image, or embed is present

### Requirement: Richtext value is stored as a structured document
The system SHALL store a richtext field's value as a structured document capturing the formatting applied, and SHALL restore that exact formatting when the value is loaded back into the editor.

#### Scenario: Formatting round-trips
- **GIVEN** an entry with a richtext field containing a bold word, a heading, and a link
- **WHEN** the entry is saved and then reopened in the editor
- **THEN** the bold word, heading, and link are all present exactly as authored

#### Scenario: Structurally invalid document rejected
- **GIVEN** a richtext value submitted that is not a well-formed document (malformed or foreign JSON)
- **WHEN** the system validates it
- **THEN** the save is rejected with a validation error and nothing is stored

### Requirement: Required richtext field must contain visible content
The system SHALL treat a richtext field marked required as unsatisfied when its document contains no non-whitespace text, even though the document itself is present.

#### Scenario: Empty document rejected on a required field
- **GIVEN** a `richtext` field marked required
- **WHEN** an entry is saved with the field left as an untouched, empty document
- **THEN** the system rejects the save with a validation error naming that field

#### Scenario: Whitespace-only document rejected on a required field
- **GIVEN** a `richtext` field marked required
- **WHEN** an entry is saved with the field containing only blank paragraphs
- **THEN** the system rejects the save with a validation error naming that field

#### Scenario: Document with visible text satisfies the requirement
- **GIVEN** a `richtext` field marked required
- **WHEN** an entry is saved with the field containing at least one non-whitespace character
- **THEN** the save proceeds past this check

### Requirement: Richtext field editing requires client-side rendering
The system SHALL mount an interactive editor for a richtext field's input, distinct from the plain server-rendered controls used by other widget types, while still submitting through the same entry save flow as every other field.

#### Scenario: Richtext field participates in the ordinary save flow
- **GIVEN** an entry editor containing both a `richtext` field and fields of other widget types
- **WHEN** the entry is saved
- **THEN** all fields, including the richtext field, are validated and saved together in a single submission

#### Scenario: Other fields render without client-side editors
- **GIVEN** an entry editor containing no richtext fields
- **WHEN** the entry editor renders
- **THEN** no interactive rich-text editor is mounted
