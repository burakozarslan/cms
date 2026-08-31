## MODIFIED Requirements

### Requirement: Entries have a draft or published status
The system SHALL give every entry a status of either draft or published, defaulting to draft on creation, and SHALL let a tenant change it. A transition into published SHALL emit an `entry.published` content event, and a transition from published back to draft SHALL emit an `entry.unpublished` content event, each after the status change has committed, for consumption by the webhook-delivery capability.

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

#### Scenario: Publishing emits a content event
- **GIVEN** a draft entry
- **WHEN** the tenant publishes it and the status change commits
- **THEN** an `entry.published` content event is emitted naming the project, collection, and entry

#### Scenario: Unpublishing emits a content event
- **GIVEN** a published entry
- **WHEN** the tenant reverts it to draft and the status change commits
- **THEN** an `entry.unpublished` content event is emitted naming the project, collection, and entry

#### Scenario: No-op status save emits no event
- **GIVEN** a published entry
- **WHEN** the tenant saves it again without changing its status
- **THEN** no `entry.published` or `entry.unpublished` event is emitted for that save

### Requirement: Deleting an entry deletes its values
The system SHALL hard-delete an entry together with all values stored against it, after confirmation. If any other entry references the entry being deleted through a `relationship` field, the confirmation SHALL additionally state how many such referencing entries exist; deletion proceeds regardless once confirmed, and those references are left pointing at an entry that no longer exists. Deleting an entry that was published SHALL emit an `entry.deleted` content event after the deletion commits, for consumption by the webhook-delivery capability.

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

#### Scenario: Deleting a published entry emits a content event
- **GIVEN** a published entry
- **WHEN** the tenant confirms its deletion and it commits
- **THEN** an `entry.deleted` content event is emitted naming the project, collection, and entry id

#### Scenario: Deleting a draft entry emits no event
- **GIVEN** an entry that was never published
- **WHEN** the tenant confirms its deletion
- **THEN** no `entry.deleted` content event is emitted
