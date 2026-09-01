## Context

See proposal.md for motivation. Relevant existing pieces this design builds on:

- `src/lib/entries/service.ts` holds `setEntryStatus` and `deleteEntry` — the two functions that need to emit content events after their write commits.
- `src/lib/crypto/index.ts` provides `encrypt`/`decrypt` (AES-256-GCM under `MEDIA_CONFIG_ENCRYPTION_KEY`), already used for the Cloudinary `api_secret`. Webhook secrets reuse this rather than introducing a second key or algorithm.
- `api-key-management`'s pattern (lookup-id + digest, secret shown once) is the template for how webhook secrets are generated and displayed, adapted because a webhook secret must be *readable* by the delivery worker (to compute an HMAC) rather than only *comparable* — so it is encrypted-at-rest and decrypted at send time, not hashed.
- There is no existing background job/queue infrastructure in the codebase. Delivery must not run on the request thread.

## Goals / Non-Goals

**Goals:**
- Fire-and-forget delivery: the content write's response is never held up by webhook delivery.
- Deliveries survive a process restart mid-retry (not just an in-memory setTimeout that vanishes on redeploy).
- Reuse existing encryption, tenant-scoping, and settings-tab UI patterns rather than inventing new ones.

**Non-Goals:**
- A general-purpose event bus for arbitrary internal consumers — this is scoped to webhook delivery only.
- Webhook delivery ordering guarantees across events (an SSG rebuild trigger is idempotent by nature; at-least-once, unordered delivery is sufficient).
- Support for non-HTTP delivery (e.g. queues, email) — POST-only.

## Decisions

### Event emission: synchronous in-process call after commit, not a message bus
`setEntryStatus` and `deleteEntry` call `enqueueWebhookDelivery(event)` as the last step, after the Kysely transaction that changes status/deletes the entry commits. `enqueueWebhookDelivery` itself only writes a row to a new `webhook_delivery_queue` table (or reuses `webhook_deliveries` with a `pending` state — see below) inside a *separate*, fast transaction, and returns immediately. No network call happens inline with the content write.

Alternative considered: emit an in-memory `EventEmitter` and have delivery listeners fire immediately. Rejected — an in-memory event is lost on crash/redeploy between enqueue and delivery, and it couples delivery latency to the emitter's synchronous listener execution unless carefully deferred, which is easy to get wrong. A persisted queue row survives restarts and decouples timing.

### Delivery worker: polling table-based queue, not a new job framework
Given no existing job infrastructure, add a `webhook_deliveries` table doubling as the queue: each row is one delivery attempt-in-progress, with `status` (`pending` | `succeeded` | `failed`), `next_attempt_at`, `attempt_count`. A lightweight worker — invoked from a Next.js route handler triggered by a cron-style external pinger (e.g. a scheduled fetch, consistent with how this deployment target already handles background work) or an in-process interval in the Node server — selects due rows (`status = 'pending' AND next_attempt_at <= now`), attempts delivery, and updates the row (reschedule with backoff, or mark succeeded/failed).

Alternative considered: pull in a queue library (BullMQ/Redis). Rejected for now — no Redis dependency exists in the stack, and SQLite-backed polling is sufficient at expected volume (webhook fan-out per tenant is small). This can be revisited if delivery volume grows; the queue table's shape doesn't need to change to swap the worker implementation later.

### Signing: HMAC-SHA256 over the raw JSON body
Header `X-Webhook-Signature: sha256=<hex>`, computed with the webhook's decrypted secret over the exact bytes sent. `X-Webhook-Event` carries the event type and `X-Webhook-Delivery` a UUID per attempt (stable across retries of the same delivery so receivers can dedupe).

### Secret storage: encrypted, not hashed
Unlike API keys (which only need equality comparison and so are hashed), a webhook secret must be retrievable in plaintext to compute the outbound HMAC at send time. Stored via the existing `encrypt()`/`decrypt()` from `src/lib/crypto`. The settings UI only ever receives the secret in the creation/rotation response body, never on subsequent reads (masked prefix shown instead, same UX as API keys).

### SSRF guard: resolve-and-check before every send
Before each delivery attempt (not just at creation, since DNS can change), resolve the target hostname and reject private/loopback/link-local ranges (RFC 1918, 127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7, etc.) using a small allowlist-style check. Creation-time validation does the same check as a fast-fail UX improvement, but the authoritative check is at delivery time since DNS is not pinned.

### Content event → webhook event mapping lives in the delivery capability
`entry.published`, `entry.unpublished`, `entry.deleted` are emitted by `content-entries`; the mapping from event type to which webhooks are notified (project + subscribed-events match) is resolved inside `enqueueWebhookDelivery`, which fans a single content event out to N queue rows (one per matching enabled webhook) at enqueue time — so the worker never needs to re-derive subscriber lists.

## Risks / Trade-offs

- [Polling-based worker adds delivery latency (bounded by poll interval, e.g. a few seconds) instead of instant push] → Acceptable for a rebuild-trigger use case; SSG builds already take longer than a poll interval.
- [SQLite table-as-queue under high write concurrency could see lock contention] → Expected volume is low (webhook counts per tenant, not per-request); revisit with a real queue if usage grows.
- [SSRF check adds a DNS resolution on the delivery hot path] → Necessary for safety; cached briefly per hostname to avoid resolving on every retry of the same delivery.
- [Retry backoff could hammer a permanently-broken endpoint for the full retry window] → Bounded max attempts (from proposal) caps total load per event.

## Migration Plan

Additive only: new tables (`webhooks`, `webhook_deliveries`), new route handlers, new settings tab, two new emit call-sites in `entries/service.ts`. No existing table or endpoint is modified. Rollback is dropping the two new tables and removing the new routes/UI/emit calls — no data backfill in either direction.
