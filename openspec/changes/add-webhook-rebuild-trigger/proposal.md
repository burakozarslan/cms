## Why

Static-site-generator frontends (Next.js ISR, Astro, Eleventy, Hugo via Netlify/Vercel build hooks, etc.) consume this CMS's content only through the read-only Content Delivery API and have no way to know when content changes. Today the only option is polling, which either wastes requests or leaves published/updated content stale on the deployed site. Tenants need the CMS to actively notify their build pipeline when publishable content changes so it can trigger a rebuild.

## What Changes

- Add tenant-managed **webhook subscriptions** scoped to a project: a target URL, the events it should fire on (entry published, entry updated, entry unpublished/deleted, collection schema changed), and an optional description/name.
- Each webhook subscription gets a generated **signing secret**, shown once at creation like API keys, used to HMAC-sign outgoing payloads so receivers can verify authenticity.
- On qualifying content events within a project, the system enqueues and delivers a **POST** request to every enabled webhook subscribed to that event, with a JSON payload (event type, project, collection, entry id/slug, timestamp) and an `X-Webhook-Signature` header.
- Delivery is **asynchronous and retried** with exponential backoff on non-2xx responses or timeouts, up to a bounded attempt count; failures do not block or fail the triggering content operation.
- Add a **delivery log** per webhook (attempt time, response status, duration, success/failure) so tenants can debug why a static-site rebuild didn't fire, with a bounded retention/count so it can't grow unbounded.
- Tenant can **list, create, disable/enable, and delete** webhook subscriptions for a project they own, and can **manually redeliver** a past event or send a test ping.
- No changes to the existing Content Delivery API read surface; this is an outbound notification mechanism only.

## Capabilities

### New Capabilities
- `webhook-management`: Tenant-facing CRUD for project-scoped webhook subscriptions (target URL, events, secret, enable/disable, delivery log, test ping).
- `webhook-delivery`: Event-driven, signed, retried delivery of content-change notifications to subscribed webhook endpoints.

### Modified Capabilities
- `content-entries`: Publishing, updating, and unpublishing/deleting an entry now emits a content-change event that the webhook delivery capability observes.

## Impact

- **New DB tables**: `webhooks` (id, project_id, tenant_id, name, target_url, events, secret digest/encrypted secret, enabled, created_at) and `webhook_deliveries` (id, webhook_id, event_type, payload_ref, attempt_count, last_status, last_attempted_at, succeeded).
- **New route handlers**: `/api/projects/:projectId/webhooks` (CRUD), `/api/projects/:projectId/webhooks/:id/test`, `/api/projects/:projectId/webhooks/:id/deliveries`.
- **New settings UI**: a "Webhooks" tab in project settings alongside the existing API keys tab.
- **content-entries write paths**: publish/update/unpublish/delete actions must emit an event after the tenant-scoped transaction commits.
- **Background delivery**: an async dispatch path (in-process queue with retry/backoff, given no existing job infrastructure) that performs outbound HTTP calls — must never run on the request thread that serves the triggering write, and must respect per-tenant isolation (a webhook can only be triggered by events from its own project).
- **Secrets**: webhook signing secrets follow the same encryption-at-rest treatment as Cloudinary `api_secret` (AES-256-GCM with the application master key); only a masked/prefixed form is ever returned after creation.
- **Rollback**: additive-only (new tables, new routes, new UI tab); disabling the feature means simply not creating webhook rows — no migration of existing data required. Dropping the two new tables fully reverts.
