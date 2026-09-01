/**
 * Static reference content for the API docs settings tab.
 *
 * `docs/api.md` is the source of truth for the Content Delivery API — keep
 * this file's wording and examples in sync with it whenever `/api/v1` route
 * handlers change.
 */

export type QueryParam = {
  name: string;
  default: string;
  notes: string;
};

export type ErrorResponse = {
  status: number;
  code: string;
  meaning: string;
  exampleJson: string;
};

export type SuccessExample = {
  title: string;
  json: string;
};

export type Endpoint = {
  method: "GET" | "POST";
  path: string;
  description: string;
  queryParams?: QueryParam[];
  successExamples: SuccessExample[];
  errorResponses: ErrorResponse[];
};

const AUTH_NOTE =
  "Requires an API key, presented as either `Authorization: Bearer cms_live_<key>` or `X-API-Key: cms_live_<key>`.";

const UNAUTHORIZED: ErrorResponse = {
  status: 401,
  code: "UNAUTHORIZED",
  meaning: "Missing, malformed, revoked, or expired key.",
  exampleJson: `{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid API key."
  }
}`,
};

const INTERNAL: ErrorResponse = {
  status: 500,
  code: "INTERNAL",
  meaning: "An unexpected server-side error.",
  exampleJson: `{
  "error": {
    "code": "INTERNAL",
    "message": "An unexpected error occurred."
  }
}`,
};

const NOT_FOUND: ErrorResponse = {
  status: 404,
  code: "NOT_FOUND",
  meaning: "Unresolvable collection or item, including drafts.",
  exampleJson: `{
  "error": {
    "code": "NOT_FOUND",
    "message": "Collection not found."
  }
}`,
};

const INVALID_QUERY: ErrorResponse = {
  status: 400,
  code: "INVALID_QUERY",
  meaning: "An unknown or unparseable query parameter.",
  exampleJson: `{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Unknown query parameter \\"limt\\"."
  }
}`,
};

// The GraphQL endpoint's pre-execution auth failure reuses the same REST
// `{ error: { code, message } }` envelope as `UNAUTHORIZED` above — the
// request never reaches the GraphQL executor. Failures *during* execution
// (validation or resolution) use GraphQL's own `{ data, errors }` envelope
// instead, with the same closed code set surfaced as `extensions.code`.
const GRAPHQL_INVALID_QUERY: ErrorResponse = {
  status: 200,
  code: "INVALID_QUERY",
  meaning: "A malformed document, an unsupported operation (e.g. a mutation), or a query exceeding the depth limit.",
  exampleJson: `{
  "data": null,
  "errors": [
    {
      "message": "The query could not be validated.",
      "extensions": { "code": "INVALID_QUERY" }
    }
  ]
}`,
};

const GRAPHQL_INTERNAL: ErrorResponse = {
  status: 200,
  code: "INTERNAL",
  meaning: "An unexpected error while resolving one field — sibling fields still resolve.",
  exampleJson: `{
  "data": { "blogEntry": null },
  "errors": [
    {
      "message": "An unexpected error occurred.",
      "path": ["blogEntry"],
      "extensions": { "code": "INTERNAL" }
    }
  ]
}`,
};

export const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/collections",
    description: "Lists the key's project's collections.",
    successExamples: [
      {
        title: "200 OK",
        json: `{
  "data": [
    { "id": "c_01H…", "slug": "blog", "name": "Blog" },
    { "id": "c_01J…", "slug": "authors", "name": "Authors" }
  ]
}`,
      },
    ],
    errorResponses: [UNAUTHORIZED, INTERNAL],
  },
  {
    method: "GET",
    path: "/api/v1/collections/:collection",
    description:
      "A collection's field schema plus how many published entries it holds. `:collection` resolves by slug first, falling back to id.",
    successExamples: [
      {
        title: "200 OK",
        json: `{
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
}`,
      },
    ],
    errorResponses: [UNAUTHORIZED, NOT_FOUND, INTERNAL],
  },
  {
    method: "GET",
    path: "/api/v1/collections/:collection/items",
    description:
      "A page of a collection's published entries. Draft entries never appear and never count toward `total`.",
    queryParams: [
      {
        name: "limit",
        default: "20",
        notes: "Capped at 100 — a request for more is silently clamped.",
      },
      { name: "offset", default: "0", notes: "Non-negative." },
      {
        name: "order",
        default: "created_at",
        notes: "`created_at` or `updated_at` only.",
      },
      {
        name: "direction",
        default: "desc",
        notes: "`asc` or `desc` only.",
      },
    ],
    successExamples: [
      {
        title: "200 OK — GET /api/v1/collections/blog/items?limit=2",
        json: `{
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
}`,
      },
    ],
    errorResponses: [UNAUTHORIZED, NOT_FOUND, INVALID_QUERY, INTERNAL],
  },
  {
    method: "GET",
    path: "/api/v1/collections/:collection/items/:item",
    description:
      "One published entry. `:item` resolves by slug first within the collection, falling back to id. A draft entry — or one that doesn't exist — is 404; the two are indistinguishable.",
    successExamples: [
      {
        title: "200 OK",
        json: `{
  "data": {
    "id": "e_01H…",
    "slug": "hello-world",
    "status": "published",
    "createdAt": "…",
    "updatedAt": "…",
    "fields": { "…": "…" }
  }
}`,
      },
    ],
    errorResponses: [UNAUTHORIZED, NOT_FOUND, INTERNAL],
  },
  {
    method: "POST",
    path: "/api/v1/graphql",
    description:
      "A GraphQL endpoint over the same published, project-scoped content as the REST endpoints above — one request can describe an arbitrarily shaped, nested query instead of walking a fixed shape across several round trips. Read-only: a mutation or subscription operation is rejected before execution. The schema is generated from this project's collections and fields, and updates automatically as they change.",
    successExamples: [
      {
        title: '200 OK — { "query": "{ blogEntry(id: \\"hello-world\\") { title author { name } } }" }',
        json: `{
  "data": {
    "blogEntry": {
      "title": "Hello World",
      "author": { "name": "Ada" }
    }
  }
}`,
      },
    ],
    errorResponses: [UNAUTHORIZED, GRAPHQL_INVALID_QUERY, GRAPHQL_INTERNAL],
  },
];

export const AUTH_DESCRIPTION = AUTH_NOTE;
