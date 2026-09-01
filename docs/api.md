# Content Delivery API

A versioned, key-authenticated, read-only JSON API over a project's published
content. Server-to-server only — see [CORS](#cors).

Everything under `/api/v1` is Phase 1 of the headless roadmap: authentication,
key management, and delivery. Caching, rate limiting, filtering,
relational expansion (`?expand=`), and write access are later phases.
Webhooks — outbound notifications when content changes — are documented
separately below; they are not part of `/api/v1`.

## Authentication

Every request must present an API key, created from a project's
**Settings → API keys** page in the dashboard. Present it either as:

```
Authorization: Bearer cms_live_<key>
```

or

```
X-API-Key: cms_live_<key>
```

Both forms authenticate identically. A missing, malformed, revoked, or
expired key is rejected with `401 UNAUTHORIZED` before any content query
runs — the response never distinguishes "wrong key" from "revoked key" from
"unknown key".

**A key is secret.** It is shown in full exactly once, at creation. Treat it
like a password: never commit it, never ship it in a client bundle, never
put it in a URL. It is scoped to one project — a leaked key exposes that
project's published content and nothing else.

## Scope

The tenant and project a request can reach come **only** from the API key.
No path segment, query parameter, header, or request body can widen or
redirect that scope. A collection or entry that exists but belongs to a
different project (even one owned by the same tenant) is `404`, identical to
one that doesn't exist at all.

## Endpoints

All four are `GET`, JSON in and out, and require authentication.

### `GET /api/v1/collections`

Lists the key's project's collections.

```jsonc
{
  "data": [
    { "id": "c_01H…", "slug": "blog", "name": "Blog" },
    { "id": "c_01J…", "slug": "authors", "name": "Authors" }
  ]
}
```

### `GET /api/v1/collections/:collection`

A collection's field schema plus how many published entries it holds.
`:collection` resolves by slug first, falling back to id.

```jsonc
{
  "data": {
    "id": "c_01H…",
    "slug": "blog",
    "name": "Blog",
    "fields": [
      { "key": "title", "widget": "string", "required": true },
      { "key": "body", "widget": "richtext", "required": false },
      { "key": "tags", "widget": "relationship", "required": false, "multiple": true },
      { "key": "code", "widget": "number", "required": false, "valueType": "string" },
      { "key": "publishedOn", "widget": "datetime", "required": false, "dateOnly": true }
    ],
    "entryCount": 47
  }
}
```

A field's entry lists only the configuration that determines its **output
type** — `multiple`, `valueType`, `dateOnly` — not its full internal config.

### `GET /api/v1/collections/:collection/items`

A page of a collection's **published** entries. Draft entries never appear
and never count toward `total`.

Query parameters:

| Parameter   | Default      | Notes                                                    |
| ----------- | ------------ | --------------------------------------------------------- |
| `limit`     | `20`         | Capped at `100` — a request for more is silently clamped |
| `offset`    | `0`          | Non-negative                                              |
| `order`     | `created_at` | `created_at` or `updated_at` only                         |
| `direction` | `desc`       | `asc` or `desc`                                           |

An unknown parameter (e.g. a typo'd `?limt=100`) or an unparseable value is
rejected with `400 INVALID_QUERY` rather than silently ignored. Results are
always ordered by `(order, id)` — never `order` alone — so entries created
in the same second (SQLite's `CURRENT_TIMESTAMP` has second granularity)
still paginate without a row appearing twice or being skipped.

```jsonc
// GET /api/v1/collections/blog/items?limit=2
{
  "data": [
    {
      "id": "e_01H…",
      "slug": "hello-world",
      "status": "published",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-02T09:30:00.000Z",
      "fields": {
        "title": "Hello World",
        "body": { "html": "<p>…</p>", "text": "…" },
        "cover": {
          "url": "https://res.cloudinary.com/…",
          "publicId": "…",
          "width": 1200,
          "height": 630,
          "format": "jpg",
          "bytes": 84213
        },
        "author": { "id": "e_01J…", "slug": "ada", "collection": "authors" },
        "tags": [],
        "featured": false,
        "publishedOn": null
      }
    }
  ],
  "meta": { "total": 47, "limit": 2, "offset": 0 }
}
```

### `GET /api/v1/collections/:collection/items/:item`

One published entry. `:item` resolves by slug first within the collection,
falling back to id. A draft entry — or one that doesn't exist — is `404`;
the two are indistinguishable.

```jsonc
{ "data": { "id": "e_01H…", "slug": "hello-world", "status": "published", "createdAt": "…", "updatedAt": "…", "fields": { "…": "…" } } }
```

## GraphQL

`POST /api/v1/graphql` is a GraphQL endpoint over the same published,
project-scoped content the REST endpoints above expose — one request can
describe an arbitrarily shaped, nested subset of collections and entries
instead of walking a fixed REST shape across several round trips.

It shares everything about REST except the transport: the same
`Authorization: Bearer` / `X-API-Key` authentication, the same project
scope (derived solely from the key), the same published-only, draft-`null`
content rules, and the same [errors](#errors) codes (surfaced as
`extensions.code` on each GraphQL error). There is no separate credential
or scope to manage.

The schema is generated from the key's project — one object type per
collection, named from its slug (`blog-posts` → type `BlogPosts`), with a
field per collection field typed the same way the REST schema endpoint
reports a field's output type. It updates automatically as collections and
fields change; no separate step publishes it.

For each collection `<name>` (camelCased from its slug):

- `<name>Entries(limit, offset, order, direction)` — a paginated list, same
  defaults and cap as REST's `?limit=`/`?offset=`/`?order=`/`?direction=`,
  returning `{ data, meta { total, limit, offset } }`
- `<name>Entry(id)` — one entry, `id` accepting either a slug or an id
  (same as REST's `:item` segment), `null` for a draft or unknown entry

A `relationship` field is a nested, selectable field typed after its
target collection — traverse it directly in the same query rather than
issuing a follow-up request:

```graphql
query {
  blogEntries(limit: 5) {
    meta {
      total
    }
    data {
      id
      slug
      title
      author {
        name
        email
      }
    }
  }
}
```

```jsonc
// POST /api/v1/graphql
// { "query": "{ blogEntry(id: \"hello-world\") { title body { html text } author { name } } }" }
{
  "data": {
    "blogEntry": {
      "title": "Hello World",
      "body": { "html": "<p>…</p>", "text": "…" },
      "author": { "name": "Ada" }
    }
  }
}
```

The endpoint is read-only: a document containing a mutation or subscription
operation is rejected before any resolver runs, with an `INVALID_QUERY`
error, the same as any other unsupported query.

## Entry values

Every field declared on the collection appears on every entry, keyed by the
field's **machine key** (not its internal id). A field the entry left
empty is `null`, never omitted — the shape of `fields` is identical across
every entry in a collection.

A field whose stored configuration no longer parses (a rare, pre-existing
data condition — a widget module rolled back after fields were created
against it, for example) serializes as `null` and the entry gains a
`_warnings` array naming the field and the reason:

```jsonc
{ "data": { "fields": { "broken": null }, "_warnings": [{ "field": "broken", "reason": "Unknown widget type \"…\"." }] } }
```

### Per-widget value shapes

| Widget                        | Delivered as                                                  |
| ------------------------------ | --------------------------------------------------------------- |
| `string`, `text`, `boolean`, `select` | Unchanged — already JSON-native                          |
| `number` (int/float)           | Unchanged                                                       |
| `number` (`valueType: "string"`) | A string, unchanged — round-trip fidelity (e.g. `"007"`) is the point of that config, not something the API coerces away |
| `datetime`                     | ISO-8601 UTC, millisecond precision (e.g. `"2024-01-01T00:00:00.000Z"`) |
| `datetime` (`dateOnly`)        | A plain `YYYY-MM-DD` calendar date, never coerced to an instant |
| `image`                        | `{ url, publicId, width, height, format, bytes }` — no binary data, `url` is always `https://` |
| `relationship`                 | `{ id, slug, collection }` — an addressable reference, not a bare id. A `multiple` field delivers an array. A reference to a deleted or unpublished entry is `null` (or dropped from the array) |
| `richtext`                     | `{ html, text }` — rendered markup and a plain-text extraction, never the editor's internal document format. Text is HTML-escaped; only `http:`, `https:`, and `mailto:` link targets are emitted — anything else (e.g. a stored `javascript:` URL) is dropped |

## Errors

Every failure is `{ "error": { "code", "message" } }`, with `code` drawn
from a closed set. No database error, stack trace, or internal identifier
is ever included.

| Code             | Status | Meaning                                            |
| ---------------- | ------ | --------------------------------------------------- |
| `UNAUTHORIZED`    | 401    | Missing, malformed, revoked, or expired key         |
| `NOT_FOUND`       | 404    | Unresolvable collection or item, including drafts   |
| `INVALID_QUERY`   | 400    | An unknown or unparseable query parameter           |
| `INTERNAL`        | 500    | An unexpected server-side error                     |

## Rate limits

Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`
headers. **These values are currently static placeholders** — no counting
or enforcement exists yet. Do not treat them as a real quota; they will
begin reflecting actual usage in a later phase without changing shape.

## CORS

No response carries an `Access-Control-Allow-Origin` header. A key is a
secret credential, so it is deliberately not callable from a browser. A
publishable-key class with a per-key origin allowlist, safe for
browser use, is a later, additive change — not something to work around by
proxying today's keys through your own server-side code.

## Webhooks

A project's **Settings → Webhooks** page lets you subscribe a target URL —
typically a static-site host's build hook — to content events, so it can
trigger a rebuild instead of polling the Content Delivery API.

### Events

| Event               | Fires when…                                             |
| -------------------- | -------------------------------------------------------- |
| `entry.published`    | An entry transitions from draft to published             |
| `entry.unpublished`  | A published entry is reverted to draft                   |
| `entry.deleted`      | A *published* entry is deleted (a draft's deletion emits nothing) |
| `webhook.test`       | Only via the "Send test ping" action in the dashboard     |

A webhook only receives deliveries for the events it is subscribed to, from
its own project. Disabling a webhook stops deliveries immediately.

### Payload

Each delivery is an HTTP `POST` with a JSON body:

```json
{
  "event": "entry.published",
  "projectId": "prj_…",
  "collectionId": "col_…",
  "entryId": "ent_…",
  "occurredAt": "2026-08-31T12:00:00.000Z"
}
```

`collectionId` and `entryId` are omitted from a `webhook.test` ping's body.
The payload intentionally carries identifiers, not content — fetch the
entry itself from the Content Delivery API using your project's key if you
need its values.

### Verifying a delivery

Every delivery carries three headers:

```
X-Webhook-Signature: sha256=<hex>
X-Webhook-Event: entry.published
X-Webhook-Delivery: <uuid>
```

`X-Webhook-Signature` is an HMAC-SHA256, hex-encoded, computed over the
**raw request body** using your webhook's signing secret (shown once at
creation, in **Settings → Webhooks**). Recompute it the same way and
compare in constant time before trusting a delivery:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function isValid(rawBody, signatureHeader, secret) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const presented = Buffer.from(signatureHeader.replace("sha256=", ""), "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return (
    presented.length === expectedBuf.length &&
    timingSafeEqual(presented, expectedBuf)
  );
}
```

`X-Webhook-Delivery` is stable across retries of the same delivery — use it
to deduplicate if your endpoint isn't naturally idempotent.

### Retries

A delivery is retried on any non-`2xx` response, a timeout, or a connection
failure, with exponential backoff, up to a bounded number of attempts —
after which it is marked failed and not retried automatically (you can
redeliver it by hand from the dashboard). A `2xx` response — any status in
that range — stops further attempts. Your endpoint should respond quickly
and idempotently; treat delivery as at-least-once, not exactly-once.

### Security

Webhook target URLs must be public — a target resolving to a private,
loopback, or link-local address is rejected both when you save it and
again at delivery time.

## The field-key rename hazard

**A field's `key` is the identifier under which its value is delivered.**
Renaming a field's key in the dashboard changes what shows up in every
future API response — `fields.title` silently becomes `undefined` for any
consumer still reading the old name, with no error raised anywhere, by
either the CMS or the consuming application.

If a project has at least one active API key, the field editor warns you
when you rename an existing field's key. The warning does not block the
rename — you own both the schema and whatever reads it — but treat a
field's key as part of your API contract once anything depends on it:
coordinate a rename with whoever consumes the project's content, the same
way you would a breaking change to any other API.
