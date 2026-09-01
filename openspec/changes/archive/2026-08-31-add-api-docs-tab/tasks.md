## 1. Content module

- [x] 1.1 Create `dashboard/[projectId]/settings/api-docs/content.ts` defining
      a typed data structure per endpoint: `method`, `path`, `description`,
      `queryParams` (name/default/allowed values, for the items-list endpoint
      only), `successExamples` (one or more `{ title, json }`), and
      `errorResponses` (`{ status, code, message, exampleJson }[]`).
- [x] 1.2 Populate the structure for all four endpoints
      (`GET /collections`, `GET /collections/:collection`,
      `GET /collections/:collection/items`,
      `GET /collections/:collection/items/:item`) with method, path,
      description, and auth requirement, copying wording and example JSON
      verbatim from `docs/api.md`.
- [x] 1.3 Add the `limit`/`offset`/`order`/`direction` query parameter table
      data for `GET /collections/:collection/items`, matching the defaults
      and constraints in `docs/api.md`.
- [x] 1.4 Add error response entries per endpoint: `401 UNAUTHORIZED` and
      `500 INTERNAL` on all four; `404 NOT_FOUND` on the three taking a
      `:collection`/`:item` segment; `400 INVALID_QUERY` on the items-list
      endpoint. Each entry includes an example
      `{ "error": { "code", "message" } }` JSON block.
- [x] 1.5 Add a short code comment at the top of `content.ts` pointing back to
      `docs/api.md` as the source of truth, per design.md's drift mitigation.

## 2. Page and presentation

- [x] 2.1 Create `dashboard/[projectId]/settings/api-docs/page.tsx` following
      `api-keys/page.tsx`'s pattern: `requireSession` → redirect to `/login`
      if absent, `findProject(session.user.tenantId, projectId)` → `notFound()`
      if absent, then render the docs content (no other data fetching).
- [x] 2.2 Render one section per endpoint using FlyonUI `Card`/`CardBody`/
      `CardTitle` (matching `api-keys/page.tsx` and `webhooks/page.tsx`
      styling): method + path heading, description, auth note, query
      parameter table where applicable, success example(s), and error
      responses.
- [x] 2.3 Render JSON examples as formatted, scrollable `<pre><code>` blocks
      (no syntax-highlighting dependency, per design.md).
- [x] 2.4 Set `export const metadata: Metadata = { title: "API docs" };` on
      the page, matching the convention in `api-keys/page.tsx`.

## 3. Navigation

- [x] 3.1 Add an `{ href: `/dashboard/${projectId}/settings/api-docs`, label:
      "API docs" }` entry to the `TABS` array in
      `dashboard/[projectId]/settings/layout.tsx`, after "API keys" and
      "Webhooks".

## 4. Verification

- [ ] 4.1 Manually load `/dashboard/:projectId/settings/api-docs` for an
      existing project and confirm all four endpoints, their query
      parameters, and their success/error examples render correctly.
- [ ] 4.2 Confirm an unauthenticated request to the page redirects to
      `/login`, and a request for a nonexistent or cross-tenant `:projectId`
      returns not-found, matching `api-keys`/`webhooks` behavior.
- [ ] 4.3 Confirm the new tab appears in the settings navigation on all three
      project settings pages (`api-keys`, `webhooks`, `api-docs`) and that
      each link navigates correctly.
- [ ] 4.4 Run `openspec validate --change add-api-docs-tab --strict` and fix
      any reported issues.
