## 1. Data model

- [x] 1.1 Add `webhooks` table migration: id, tenant_id, project_id, name, target_url, events (JSON array), secret_encrypted, secret_prefix, enabled, created_at, updated_at
- [x] 1.2 Add `webhook_deliveries` table migration: id, webhook_id, event_type, payload (JSON), delivery_uuid, status (pending/succeeded/failed), attempt_count, next_attempt_at, last_status_code, last_error, created_at, updated_at
- [x] 1.3 Add indexes needed for the queue poll (`status`, `next_attempt_at`) and for listing deliveries per webhook ordered by recency
- [x] 1.4 Wire both tables into the tenant-aware Kysely query builder / type definitions

## 2. Crypto & signing utilities

- [x] 2.1 Add `generateWebhookSecret()` (random token) and reuse `encrypt`/`decrypt` from `src/lib/crypto` for at-rest storage
- [x] 2.2 Add `signPayload(secret, rawBody)` producing the HMAC-SHA256 hex digest used in `X-Webhook-Signature`
- [x] 2.3 Add SSRF guard utility: resolve hostname, reject private/loopback/link-local ranges, usable both at webhook-save time and at delivery time

## 3. Webhook management service & routes

- [x] 3.1 `src/lib/webhooks/service.ts`: `createWebhook`, `listWebhooks`, `setWebhookEnabled`, `deleteWebhook`, `rotateWebhookSecret`, `getWebhookDeliveries`, `redeliverEvent`, `sendTestPing` — all scoped through the tenant-aware query builder and enforcing project ownership
- [x] 3.2 Zod schemas for webhook create/update input (target URL format, events enum, name)
- [x] 3.3 ~~Route handlers~~ **Deviation from proposal**: this codebase manages tenant-owned settings (API keys) through Next.js Server Actions, not REST route handlers — `/api/v1` is reserved for the external, API-key-authenticated Content Delivery API. Implemented as Server Actions in `src/app/dashboard/[projectId]/settings/webhooks/actions.ts` (create, enable/disable, delete, rotate secret, test ping, redeliver), mirroring `api-keys/actions.ts`.
- [x] 3.4 Enforce project ownership + tenant isolation on every action (mirror `api-key-management` patterns — every service function takes `tenantId` + `projectId` and predicates on both)

## 4. Event emission from content-entries

- [x] 4.1 In `setEntryStatus` (`src/lib/entries/service.ts`), after the status-change transaction commits, emit `entry.published` or `entry.unpublished` only when the status actually changed
- [x] 4.2 In `deleteEntry`, after deletion commits, emit `entry.deleted` only if the deleted entry was published
- [x] 4.3 Add `enqueueWebhookDelivery(event)` in `src/lib/webhooks/delivery.ts`: resolves matching enabled webhooks for the event's project + event type, inserts one `webhook_deliveries` row per match with `status = 'pending'`

## 5. Delivery worker

- [x] 5.1 Implement `deliverDueWebhooks()`: selects due pending rows, decrypts each webhook's secret, builds signed request (headers: `X-Webhook-Signature`, `X-Webhook-Event`, `X-Webhook-Delivery`), sends with a bounded timeout
- [x] 5.2 On non-2xx/timeout/connect failure: increment attempt_count, compute next backoff, reschedule `next_attempt_at`, or mark `failed` once max attempts reached
- [x] 5.3 On 2xx: mark `succeeded`, record status code
- [x] 5.4 Apply the SSRF guard immediately before each send attempt (not just at creation)
- [x] 5.5 Wire `deliverDueWebhooks()` to run on an interval/trigger appropriate for this deployment target — `src/instrumentation.ts` starts an in-process 5s poll (`src/lib/webhooks/worker.ts`) on Node server boot, since there is no external queue/cron in this stack
- [x] 5.6 Cap `webhook_deliveries` retention per webhook (prune oldest beyond the bounded window) so the log can't grow unbounded

## 6. Settings UI

- [x] 6.1 Add a "Webhooks" tab to project settings alongside the existing API keys tab
- [x] 6.2 Webhook list view: name, target URL, events, enabled toggle, last delivery outcome, delete action
- [x] 6.3 Create-webhook form (name, target URL, event checkboxes) + one-time secret reveal dialog, matching the API key creation UX
- [x] 6.4 Per-webhook delivery log view with redeliver action and a "Send test ping" button
- [x] 6.5 Secret rotation action with one-time reveal

## 7. Tests

- [x] 7.1 Unit tests for signing/verification (HMAC correctness, tamper detection) — `tests/server/webhook-signing.test.ts`
- [x] 7.2 Unit tests for SSRF guard (rejects private/loopback/link-local, accepts public) — `tests/server/webhook-ssrf-guard.test.ts`
- [x] 7.3 Service tests: webhook CRUD is tenant/project scoped; cross-tenant/cross-project access denied — `tests/server/webhooks.test.ts`
- [x] 7.4 Integration test: publishing an entry enqueues a matching delivery and not a non-matching one — `tests/server/webhook-delivery.test.ts`
- [x] 7.5 Integration test: delivery retries on failure with backoff and stops after max attempts or on success — `tests/server/webhook-delivery.test.ts`
- [x] 7.6 Integration test: content write (publish/unpublish/delete) succeeds even when delivery/queue write is forced to fail — `tests/server/webhook-delivery.test.ts`
- [x] 7.7 ~~Playwright/Supertest coverage for the new API routes~~ **Deviation**: no new REST routes exist (see 3.3) — covered instead by Jest service-layer tests exercising the same tenant-isolation cases (7.3).

## 8. Docs

- [x] 8.1 Document webhook payload shape, event types, signature verification steps, and retry/backoff behavior in `docs/api.md`
