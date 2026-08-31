# Content Delivery API

A versioned, key-authenticated, read-only JSON API over a project's published
content. Server-to-server only — see [CORS](#cors).

Everything under `/api/v1` is Phase 1 of the headless roadmap: authentication,
key management, and delivery. Caching, rate limiting, webhooks, filtering,
relational expansion (`?expand=`), and write access are later phases.

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
