## ADDED Requirements

### Requirement: Tenant can create an API key for a project
The system SHALL let an authenticated tenant create a named API key scoped to one project they own, and SHALL return the raw token exactly once at creation.

#### Scenario: Key created and secret revealed once
- **GIVEN** an authenticated tenant viewing the API keys settings for a project they own
- **WHEN** they create a key named `Production site`
- **THEN** the full token is displayed once for copying, and the response records the key's name, displayable prefix, and creation time

#### Scenario: Secret is unrecoverable afterwards
- **GIVEN** an API key created earlier in the session
- **WHEN** the tenant reloads the API keys page
- **THEN** only the displayable prefix is shown, and no interface offers the full token again

#### Scenario: Key creation is scoped to an owned project
- **GIVEN** tenant A is authenticated
- **WHEN** a key creation is submitted naming a project owned by tenant B
- **THEN** the system denies it and no key is created

### Requirement: Tokens are stored as digests, never in plaintext
The system SHALL persist only a cryptographic digest of the token's secret segment, and SHALL NOT persist the secret itself in any column, log, or error message.

#### Scenario: Database holds no recoverable secret
- **GIVEN** an API key has been created
- **WHEN** the `api_keys` row is inspected
- **THEN** it contains a lookup id and a digest, and no column holds a value that can be presented as a working token

#### Scenario: Comparison does not leak the digest
- **GIVEN** a token is presented for authentication
- **WHEN** its secret is compared against the stored digest
- **THEN** the comparison runs in constant time with respect to the digest's contents

### Requirement: A token identifies its own record
The system SHALL embed an indexed, non-secret lookup identifier in the token, so authentication resolves a single row directly rather than testing the presented secret against every stored key.

#### Scenario: Malformed token rejected without a database read
- **GIVEN** a request presenting a token that does not match the expected token structure
- **WHEN** the system authenticates it
- **THEN** the request is rejected and no key lookup is performed

#### Scenario: Unknown lookup id rejected
- **GIVEN** a request presenting a structurally valid token whose lookup id matches no row
- **WHEN** the system authenticates it
- **THEN** the request is rejected as unauthorized

### Requirement: Tenant can list and revoke API keys
The system SHALL list a project's API keys with their name, displayable prefix, creation time, last-used time, and status, and SHALL let the tenant revoke any of them.

#### Scenario: Keys listed for the acting tenant only
- **GIVEN** tenant A and tenant B each hold API keys
- **WHEN** tenant A views the API keys settings
- **THEN** only tenant A's keys for the selected project are listed

#### Scenario: Revoked key stops authenticating
- **GIVEN** an active API key
- **WHEN** the tenant revokes it and a subsequent request presents that token
- **THEN** the request is rejected as unauthorized before any content query runs

#### Scenario: Revocation is recorded rather than erased
- **GIVEN** an API key is revoked
- **WHEN** the key list is displayed
- **THEN** the key remains visible as revoked, with the time of revocation, rather than disappearing

### Requirement: Key usage is recorded without burdening the read path
The system SHALL record when a key was last used, and SHALL NOT issue a write for every authenticated request.

#### Scenario: Repeated requests do not each write
- **GIVEN** a key whose last-used time was recorded moments ago
- **WHEN** further requests authenticate with that key in quick succession
- **THEN** no additional write is issued for those requests

#### Scenario: Usage recording never fails a request
- **GIVEN** an authenticated request whose usage-recording write fails
- **WHEN** the response is produced
- **THEN** the response is unaffected and reports success
