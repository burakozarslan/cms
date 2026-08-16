## Purpose

Lets each tenant store, update, and verify the Cloudinary credentials their content pipeline will use for media storage, without ever exposing the secret key to the client.

## ADDED Requirements

### Requirement: Tenant-scoped Cloudinary configuration storage
The system SHALL allow an authenticated tenant member to view and save Cloudinary configuration (`cloud_name`, `api_key`, `api_secret`) scoped to their own tenant. Each tenant SHALL have at most one media configuration.

#### Scenario: First-time save
- **WHEN** an authenticated user submits `cloud_name`, `api_key`, and `api_secret` for a tenant with no existing configuration
- **THEN** the system creates a new media configuration record for that tenant

#### Scenario: Updating an existing configuration
- **WHEN** an authenticated user submits new values for a tenant that already has a media configuration
- **THEN** the system overwrites the existing record's fields rather than creating a second record

#### Scenario: Cross-tenant isolation
- **WHEN** a user authenticated for tenant A requests or saves media configuration
- **THEN** the system only ever reads or writes tenant A's configuration record, never another tenant's, regardless of any client-supplied identifiers

#### Scenario: Missing required fields
- **WHEN** a save is submitted with `cloud_name` or `api_key` empty
- **THEN** the system rejects the save and returns a field-level validation error without persisting partial data

### Requirement: Secret confidentiality
The system SHALL treat `api_secret` as confidential: it MUST be encrypted before storage and MUST NOT be transmitted back to the client in plaintext after it has been saved.

#### Scenario: Secret is encrypted at rest
- **WHEN** a media configuration is saved
- **THEN** the stored `api_secret` value is encrypted, and reading the underlying storage directly does not reveal the plaintext secret

#### Scenario: Secret is not echoed to the client
- **WHEN** a user loads the media configuration page for a tenant that already has a saved secret
- **THEN** the response indicates a secret is configured (e.g. a masked placeholder) without including the plaintext secret value

#### Scenario: Blank secret on update preserves the existing value
- **WHEN** a user updates `cloud_name` or `api_key` and leaves `api_secret` blank, on a tenant that already has a secret saved
- **THEN** the system keeps the previously saved secret unchanged and does not clear or overwrite it

#### Scenario: Non-blank secret on update rotates the value
- **WHEN** a user submits a new, non-blank `api_secret` value
- **THEN** the system replaces the previously stored encrypted secret with the newly encrypted value

### Requirement: Connection verification
The system SHALL let an authenticated tenant member trigger a check of the saved Cloudinary configuration and SHALL report whether the credentials are valid.

#### Scenario: Successful check
- **WHEN** a user triggers a connection check and the saved credentials authenticate successfully against Cloudinary
- **THEN** the system reports success and records the check as passed with a timestamp

#### Scenario: Failed check
- **WHEN** a user triggers a connection check and the saved credentials fail to authenticate (invalid key/secret/cloud name, or the request errors)
- **THEN** the system reports failure and records the check as failed with a timestamp, without raising an unhandled error to the user

#### Scenario: Check with no configuration saved
- **WHEN** a user triggers a connection check before any configuration has been saved for their tenant
- **THEN** the system reports that no configuration exists and does not attempt to contact Cloudinary

#### Scenario: Status reflects the most recent check
- **WHEN** a user reloads the media configuration page after a previous check
- **THEN** the system displays the result of the most recent check (success, failure, or not-yet-checked) rather than a stale or default state

#### Scenario: Stale result after credentials change
- **WHEN** a user saves new configuration values after a previous successful check
- **THEN** the system no longer shows the prior check as current (e.g. resets to a not-yet-checked state) until the connection is checked again

### Requirement: Access control
The system SHALL require an authenticated session to view, save, or check media configuration, and SHALL NOT allow unauthenticated access to any part of this capability.

#### Scenario: Unauthenticated access is rejected
- **WHEN** a request to view, save, or check media configuration is made without a valid session
- **THEN** the system denies the request and does not return or modify any tenant's configuration
