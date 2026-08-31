## Context

`docs/api.md` is the canonical, hand-maintained description of the
`/api/v1` Content Delivery API and its webhooks. The project settings shell
(`dashboard/[projectId]/settings/layout.tsx`) already renders a `TABS` array
of `{ href, label }` tied to `[projectId]`, with `api-keys` and `webhooks` as
siblings under it, both guarded by the same `requireSession` +
`findProject(tenantId, projectId)` check performed once in the layout. See
`proposal.md` - Why for the motivation.

## Goals / Non-Goals

**Goals:**
- Add a third settings tab, `api-docs`, that renders reference documentation
  for the four `/api/v1` endpoints entirely from static content colocated
  with the page — no new queries, no new tables.
- Keep the content in sync, in substance, with `docs/api.md` at ship time.

**Non-Goals:**
- No dynamic substitution of the viewing tenant's real collection slugs,
  field schemas, or API key into the examples.
- No live "try it" request runner against the API from the docs page.
- No automated drift-detection between `docs/api.md` and the in-app page —
  keeping them aligned is a manual authoring discipline for this and future
  API changes, noted in both places.
- No documentation of webhook events/payloads on this page — that already
  lives on `settings/webhooks` and in `docs/api.md`; duplicating it here adds
  another place to drift.

## Decisions

**Static TSX content, not a markdown renderer.** Encode each endpoint as a
plain data structure (method, path, description, query params, success
example(s), error examples) in a `content.ts`/`.tsx` module under the new
route, rendered with FlyonUI `Card`/`Badge`/code-block styling consistent
with `api-key-list.tsx` and `webhook-list.tsx`. Alternative considered:
render `docs/api.md` directly (via a markdown-to-HTML step) to guarantee
byte-for-byte sync. Rejected because introducing a markdown pipeline for one
page pulls in a new rendering dependency and loses the ability to present
success/error examples as distinct, styled blocks per the proposal's
requirement — plain data keeps the page a normal React component and keeps
the diff small.

**One page, sectioned by endpoint, not one page per endpoint.** All four
endpoints plus the shared auth/error-code reference render on a single
`api-docs` page with in-page anchors, matching how `docs/api.md` itself is
one flowing document. Alternative considered: a sub-route per endpoint
(mirroring `webhooks/[webhookId]`). Rejected — there are only four endpoints,
none has enough independent detail to warrant its own route, and a single
page keeps the whole contract skimmable at once, which is the actual use
case (a developer implementing a client wants the full picture at once).

**No new library.** Code blocks render as `<pre><code>` with existing
Tailwind/FlyonUI utility classes for a monospace, scrollable block — no
syntax-highlighting package. Alternative considered: add a client-side
highlighter (e.g. shiki/prism). Rejected as unjustified weight for four
mostly-JSON examples; plain formatted JSON is legible without highlighting,
and it avoids a new client bundle dependency for a documentation page.

**Reuse the layout's existing project guard.** The new `page.tsx` repeats the
same `requireSession` → redirect, `findProject` → `notFound()` pattern already
used verbatim by `api-keys/page.tsx`, rather than inventing a shared helper.
Matches this codebase's existing convention (both current settings pages
duplicate this same block) — introducing an extraction here would be an
unrelated refactor of the other two pages.

## Risks / Trade-offs

- **[Risk] Static content drifts from `docs/api.md` or from the live API
  behavior as the API evolves.** → Mitigation: keep both in the same PR
  whenever `/api/v1` route handlers change; note the cross-reference in a
  short code comment at the top of the new content module pointing back to
  `docs/api.md`.
- **[Risk] Hand-written example JSON has a typo that misleads an integrator
  (e.g. wrong field name in an error envelope).** → Mitigation: copy examples
  verbatim from `docs/api.md`'s existing, already-reviewed code blocks rather
  than re-deriving them from route handler source.
- **[Trade-off] No dynamic examples using the viewer's real project data**
  means the page is slightly less concrete than a generated reference (e.g.
  Swagger/OpenAPI UI) would be. Accepted per proposal scope — this is a
  reference page, not an API explorer; revisit only if user feedback asks for
  it.
