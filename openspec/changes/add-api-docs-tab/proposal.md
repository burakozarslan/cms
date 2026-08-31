## Why

Content Delivery API and webhook documentation exists only as `docs/api.md` in
the repo. A tenant integrating with the API has to be handed a markdown file
out-of-band, or find it in source control — nothing on their own project's
**Settings** page tells them what endpoints exist, what a request looks like,
or what a `404` versus a `401` versus a validation error returns. This is the
last piece of API discoverability missing now that API keys
(`settings/api-keys`) and webhooks (`settings/webhooks`) already have their
own tabs.

## What Changes

- Add an **API docs** tab to the project settings shell
  (`dashboard/[projectId]/settings/layout.tsx`), alongside the existing
  **API keys** and **Webhooks** tabs.
- New page at `dashboard/[projectId]/settings/api-docs` rendering read-only
  reference documentation for the four `/api/v1` endpoints
  (`GET /collections`, `GET /collections/:collection`,
  `GET /collections/:collection/items`, `GET /collections/:collection/items/:item`):
  method, path, auth requirement, query parameters, and an example success
  response.
- For every endpoint, also show the error responses it can return (e.g.
  `401 UNAUTHORIZED`, `404 NOT_FOUND`, `400 INVALID_QUERY`, `500 INTERNAL`)
  with example error-envelope JSON (`{ "error": { "code", "message" } }`).
- Content is static reference copy sourced from `docs/api.md` (the existing
  source of truth for the API contract) and rendered with the project's
  FlyonUI components — no new backend endpoint, no database reads beyond the
  existing project lookup already done by the settings layout.
- Out of scope: interactive "try it" request execution, per-project dynamic
  examples (e.g. substituting the tenant's actual collection slugs), and
  webhook event documentation (webhooks already document themselves on the
  `settings/webhooks` page and are covered in `docs/api.md` separately).

## Capabilities

### New Capabilities

- `project-api-docs`: A read-only, in-dashboard reference page listing the
  Content Delivery API's endpoints, request shapes, and example success/error
  responses, surfaced as a tab in a project's settings.

### Modified Capabilities

_None — this does not change behavior of any existing capability; it adds a
net-new, purely presentational settings tab._

## Impact

- **Code**: `dashboard/[projectId]/settings/layout.tsx` (add tab entry),
  new `dashboard/[projectId]/settings/api-docs/page.tsx` (+ any supporting
  presentational components for endpoint/response blocks).
- **Data/DB**: None. No new tables, columns, or queries — the page needs only
  the `project` lookup the settings layout already performs for
  `notFound()`/breadcrumb purposes.
- **APIs**: None added or changed. Purely documents the existing, unmodified
  `/api/v1` surface.
- **Multi-tenant isolation**: N/A — the page renders static reference content
  and the same project-scoped `requireSession`/`findProject` guard already
  used by every other settings tab; no tenant data is queried or displayed.
- **Auth/permissions**: Same access boundary as the existing `api-keys` and
  `webhooks` tabs — any authenticated member with access to the project's
  settings can view it.
- **Rollback**: Purely additive UI; revert by removing the tab entry and
  deleting the new route — no data migration in either direction.
- **Docs**: `docs/api.md` remains the canonical source; if the two drift,
  treat `docs/api.md` as authoritative and update the in-app page to match.
