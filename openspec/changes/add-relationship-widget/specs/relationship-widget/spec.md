## Purpose

Lets a tenant model relationships between collections — a field on one collection that references one or more entries in another collection of the same project — so content can point at other content instead of duplicating it.

## ADDED Requirements

### Requirement: Relationship is a selectable widget type
The system SHALL offer `relationship` as a widget type when a tenant adds or edits a field, alongside the existing supported set.

#### Scenario: Field created with the relationship widget
- **GIVEN** a tenant is editing a collection they own
- **WHEN** they add a field with key `author`, label `Author`, widget `relationship`, and a target collection
- **THEN** the system creates the field on that collection, positioned last

### Requirement: A relationship field targets exactly one collection in the same project
The system SHALL require a `relationship` field's configuration to name a target collection belonging to the same project as the field's own collection, and SHALL reject a target collection from a different project or a target that does not exist.

#### Scenario: Target collection in the same project accepted
- **GIVEN** a project containing collections "Blog Post" and "Author"
- **WHEN** a tenant adds a `relationship` field on "Blog Post" targeting "Author"
- **THEN** the system creates the field with that target

#### Scenario: Target collection from another project rejected
- **GIVEN** two projects, each with their own collections
- **WHEN** a tenant configures a `relationship` field on a collection in project A naming a target collection from project B
- **THEN** the system rejects the submission with a validation error and creates no field

#### Scenario: Nonexistent target collection rejected
- **GIVEN** a `relationship` field submission naming a target collection id that does not exist
- **WHEN** the system validates it
- **THEN** the submission is rejected and no field is created

### Requirement: A collection cannot target itself with a relationship field
The system SHALL reject a `relationship` field whose target collection is the same collection the field belongs to.

#### Scenario: Self-reference rejected
- **GIVEN** a tenant is adding a `relationship` field to collection "Category"
- **WHEN** they set the target collection to "Category" itself
- **THEN** the system rejects the submission with a validation error and creates no field

### Requirement: A relationship field can reference one or many entries
The system SHALL let a `relationship` field be configured to hold a single referenced entry or a list of referenced entries, matching the single/multiple pattern of the `select` widget.

#### Scenario: Single-mode field stores one reference
- **GIVEN** a `relationship` field configured without `multiple`
- **WHEN** an entry is saved referencing one target entry
- **THEN** the value is stored as that single entry's id

#### Scenario: Multiple-mode field stores many references
- **GIVEN** a `relationship` field configured with `multiple`
- **WHEN** an entry is saved referencing several target entries
- **THEN** the value is stored as the list of those entries' ids, in the order selected

### Requirement: Referenced entries must exist in the target collection
The system SHALL validate, at save time, that every entry id submitted for a `relationship` field's value refers to an entry that currently exists within the field's configured target collection, and SHALL reject the save otherwise.

#### Scenario: Reference to an existing entry in the target collection accepted
- **GIVEN** a `relationship` field targeting collection "Author" that contains an entry with id `author-1`
- **WHEN** an entry is saved referencing `author-1`
- **THEN** the save succeeds

#### Scenario: Reference to an entry outside the target collection rejected
- **GIVEN** a `relationship` field targeting collection "Author"
- **WHEN** an entry is saved referencing an entry id that belongs to a different collection
- **THEN** the system rejects the save with a validation error

#### Scenario: Reference to a nonexistent entry id rejected
- **GIVEN** a `relationship` field targeting collection "Author"
- **WHEN** an entry is saved referencing an entry id that does not exist
- **THEN** the system rejects the save with a validation error

### Requirement: Referenced entries are displayed by their target collection's title
The system SHALL label a referenced entry, wherever a relationship value is shown, using the same title-resolution the referenced entry's own collection uses for its entry list (designated title field, falling back to the first string field, falling back to the entry slug, falling back to a placeholder).

#### Scenario: Reference shown with the target's title value
- **GIVEN** an "Author" collection whose title field is `name`, and an author entry with `name` "Jane Doe"
- **WHEN** a "Blog Post" entry referencing that author is displayed
- **THEN** the reference is labelled "Jane Doe", not the author entry's id

### Requirement: Relationship picker offers a searchable choice of the target collection's entries
The system SHALL let a tenant choose the referenced entry or entries for a `relationship` field from the target collection's entries, filterable by typing, when editing an entry.

#### Scenario: Typing filters the offered entries
- **GIVEN** an entry editor with a `relationship` field targeting a collection with many entries
- **WHEN** the tenant types part of an entry's title into the field's picker
- **THEN** only entries whose displayed title matches the typed text remain offered

#### Scenario: Single mode replaces the prior selection
- **GIVEN** a single-mode `relationship` field already holding a reference
- **WHEN** the tenant picks a different entry
- **THEN** the field holds only the newly picked entry

#### Scenario: Multiple mode accumulates selections
- **GIVEN** a multiple-mode `relationship` field
- **WHEN** the tenant picks several entries one after another
- **THEN** all of them are held, and each can be individually removed before saving

### Requirement: A reference to a deleted entry or an unresolvable target surfaces as broken, not an error
The system SHALL tolerate a `relationship` value whose referenced entry no longer exists, or whose field's target collection no longer exists, by presenting it as an unresolvable reference rather than failing to render the entry that holds it.

#### Scenario: Reference to a since-deleted entry
- **GIVEN** a `relationship` value referencing an entry id that has since been deleted
- **WHEN** the entry holding that reference is opened
- **THEN** the entry renders normally and the broken reference is shown as unresolvable rather than raising an error

#### Scenario: Target collection no longer exists
- **GIVEN** a `relationship` field whose target collection has since been deleted
- **WHEN** the entry holding that field is opened
- **THEN** the entry renders normally and that field is shown as unresolvable rather than raising an error
