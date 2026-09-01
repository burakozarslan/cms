## Purpose

Lets an authenticated tenant create, inspect, disable, and delete project-scoped webhook subscriptions that notify external systems (e.g. a static-site host's build hook) when content changes.

## Requirements

### Requirement: Tenant can create a webhook subscription for a project
The system SHALL let an authenticated tenant create a named webhook subscription on a project they own, specifying a target URL and the set of content events it subscribes to, and SHALL generate a signing secret that is returned in full exactly once at creation.

#### Scenario: Webhook created and secret revealed once
- **GIVEN** an authenticated tenant viewing the Webhooks settings for a project they own
- **WHEN** they create a webhook named `Netlify build hook` targeting `https://api.netlify.com/build_hooks/abc` subscribed to `entry.published`
- **THEN** the webhook is created enabled, and the full signing secret is displayed once for copying

#### Scenario: Secret is unrecoverable afterwards
- **GIVEN** a webhook created earlier in the session
- **WHEN** the tenant reloads the Webhooks settings page
- **THEN** only a masked form of the secret is shown, and no interface offers the full secret again

#### Scenario: Webhook creation is scoped to an owned project
- **GIVEN** tenant A is authenticated
- **WHEN** a webhook creation is submitted naming a project owned by tenant B
- **THEN** the system denies it and no webhook is created

#### Scenario: Target URL must be a well-formed HTTP(S) URL
- **GIVEN** a webhook creation submission
- **WHEN** the target URL is missing, malformed, or uses a scheme other than `http`/`https`
- **THEN** the system rejects the submission with a validation error and creates no webhook

#### Scenario: At least one event must be selected
- **GIVEN** a webhook creation submission with no events selected
- **WHEN** the system validates it
- **THEN** the submission is rejected and no webhook is created

### Requirement: Webhook signing secrets are stored encrypted, never in plaintext
The system SHALL encrypt each webhook's signing secret at rest and SHALL NOT return the plaintext secret in any response after the creation response, log, or error message.

#### Scenario: Database holds no recoverable plaintext secret
- **GIVEN** a webhook has been created
- **WHEN** the `webhooks` row is inspected
- **THEN** the stored secret value is encrypted, and reading the underlying storage directly does not reveal the plaintext secret

#### Scenario: Secret rotation replaces the stored value
- **GIVEN** an existing webhook
- **WHEN** the tenant explicitly requests secret rotation
- **THEN** a new secret is generated, encrypted, and stored in place of the old one, and the new plaintext secret is shown exactly once

### Requirement: Tenant can list, enable/disable, and delete webhooks
The system SHALL list a project's webhooks with their name, target URL, subscribed events, enabled state, and last delivery outcome, and SHALL let the tenant toggle a webhook's enabled state or delete it.

#### Scenario: Webhooks listed for the acting tenant's project only
- **GIVEN** tenant A and tenant B each hold webhooks on projects they own
- **WHEN** tenant A views the Webhooks settings for their project
- **THEN** only tenant A's webhooks for that project are listed

#### Scenario: Disabled webhook stops receiving deliveries
- **GIVEN** an enabled webhook
- **WHEN** the tenant disables it and a qualifying content event subsequently occurs
- **THEN** no delivery attempt is made to that webhook while it remains disabled

#### Scenario: Deleted webhook is removed along with its delivery log
- **GIVEN** a webhook with prior delivery attempts recorded
- **WHEN** the tenant deletes it
- **THEN** the webhook and its delivery log are no longer retrievable

### Requirement: Tenant can send a test ping to a webhook
The system SHALL let a tenant trigger a synthetic `webhook.test` event delivery to a specific webhook on demand, independent of any real content change.

#### Scenario: Test ping delivered and recorded
- **GIVEN** an existing webhook
- **WHEN** the tenant triggers a test ping
- **THEN** a signed `webhook.test` payload is sent to the target URL and the attempt appears in that webhook's delivery log

### Requirement: Tenant can inspect a webhook's delivery log and redeliver
The system SHALL show, per webhook, a bounded history of delivery attempts with their event type, timestamp, response status, and outcome, and SHALL let the tenant manually redeliver a past event.

#### Scenario: Delivery log shows recent attempts
- **GIVEN** a webhook that has received several delivery attempts
- **WHEN** the tenant opens its delivery log
- **THEN** each attempt's event type, time, response status (or timeout/error), and success/failure is shown, most recent first

#### Scenario: Delivery log is bounded
- **GIVEN** a webhook with a very large number of historical delivery attempts
- **WHEN** the delivery log is stored and displayed
- **THEN** only a bounded, most-recent window of attempts is retained and shown, rather than growing without limit

#### Scenario: Manual redelivery re-sends the original payload
- **GIVEN** a past delivery attempt that failed
- **WHEN** the tenant triggers redelivery of that attempt
- **THEN** the original event payload is re-sent to the webhook's current target URL and signed with its current secret, and the attempt is recorded as a new delivery log entry
