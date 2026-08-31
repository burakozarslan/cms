## Purpose

Delivers signed, retried HTTP notifications to a project's enabled webhooks whenever a subscribed content event occurs, so external build pipelines (SSGs, static hosts) can trigger a rebuild without polling.

## Requirements

### Requirement: Qualifying content events are delivered to subscribed, enabled webhooks
The system SHALL, after a content event committed within a project, deliver a notification to every enabled webhook on that project whose subscribed events include that event type, and SHALL NOT deliver to webhooks on other projects or to disabled webhooks.

#### Scenario: Matching webhook receives the event
- **GIVEN** an enabled webhook on project P subscribed to `entry.published`
- **WHEN** an entry in project P is published
- **THEN** a delivery attempt is made to that webhook carrying the `entry.published` event

#### Scenario: Non-subscribed event is not delivered
- **GIVEN** a webhook on project P subscribed only to `entry.published`
- **WHEN** an entry in project P is unpublished
- **THEN** no delivery attempt is made to that webhook for the unpublish

#### Scenario: Other project's webhook is unaffected
- **GIVEN** webhooks exist on project P and project Q
- **WHEN** a content event occurs in project P
- **THEN** no delivery attempt is made to any webhook belonging to project Q

### Requirement: Content operations are not blocked or failed by delivery
The system SHALL enqueue webhook delivery asynchronously after the triggering content write commits, and a delivery failure, timeout, or the entire delivery subsystem being unavailable SHALL NOT cause the triggering content operation to fail or roll back.

#### Scenario: Publish succeeds even if delivery fails
- **GIVEN** an entry publish that would trigger a webhook whose target URL is unreachable
- **WHEN** the tenant publishes the entry
- **THEN** the publish completes successfully and is reflected immediately, independent of the delivery outcome

#### Scenario: Slow endpoint does not slow the triggering request
- **GIVEN** a webhook whose target URL responds slowly
- **WHEN** a subscribed content event occurs
- **THEN** the response to the content operation that triggered the event is not delayed waiting on that delivery

### Requirement: Delivery payloads are signed and verifiable
The system SHALL sign every delivery payload with an HMAC computed over the raw request body using the webhook's secret, and SHALL send the signature in a request header alongside the event type and a unique delivery id.

#### Scenario: Signature validates against the payload
- **GIVEN** a delivery sent to a webhook
- **WHEN** the receiver recomputes the HMAC over the raw received body using the shared secret
- **THEN** it matches the signature header sent with the request

#### Scenario: Tampered payload fails verification
- **GIVEN** a delivery payload that is altered in transit
- **WHEN** the receiver recomputes the HMAC over the altered body
- **THEN** it does not match the signature header

### Requirement: Failed deliveries are retried with bounded exponential backoff
The system SHALL retry a delivery that receives a non-2xx response, times out, or fails to connect, using exponential backoff, up to a fixed maximum number of attempts, after which it is marked failed and not retried further.

#### Scenario: Transient failure is retried
- **GIVEN** a delivery attempt that receives a `503` response
- **WHEN** the system schedules the next attempt
- **THEN** it waits at least as long as the previous backoff interval before retrying the same event to the same webhook

#### Scenario: Success stops retries
- **GIVEN** a delivery that previously failed and is retried
- **WHEN** a retry attempt receives a `2xx` response
- **THEN** no further attempts are made for that event

#### Scenario: Exhausted retries mark the delivery failed
- **GIVEN** a delivery that has failed on every attempt up to the maximum
- **WHEN** the final attempt also fails
- **THEN** the delivery is recorded as failed and no further automatic attempts are made for that event

### Requirement: Delivery targets outside the public internet are rejected
The system SHALL refuse to deliver (and refuse to save, on creation) a webhook whose target URL resolves to a private, loopback, or link-local address, to prevent the delivery mechanism from being used to reach internal services.

#### Scenario: Loopback target rejected at creation
- **GIVEN** a webhook creation submission with target URL `http://127.0.0.1:9000/hook`
- **WHEN** the system validates it
- **THEN** the submission is rejected and no webhook is created

#### Scenario: Delivery skipped if target later resolves internally
- **GIVEN** a saved webhook whose target hostname now resolves to a private IP address at delivery time
- **WHEN** a delivery is attempted
- **THEN** the delivery is not sent and is recorded as failed with a reason indicating the disallowed target
