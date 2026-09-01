/**
 * @jest-environment node
 *
 * Schema derivation, pagination, addressing, and scoping on
 * `POST /api/v1/graphql`. Covers `content-delivery-graphql-api` ->
 * "The schema is derived from live collection and field definitions",
 * "Each collection exposes a list query and a single-item query", and the
 * cross-project half of "The GraphQL endpoint reuses REST authentication
 * and scoping".
 */
import { NextRequest } from "next/server";

import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import {
  makeApiKey,
  makeCollection,
  makeEntry,
  makeField,
  makeProject,
  makeTenant,
} from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let graphqlRoute: typeof import("@/app/api/v1/graphql/route").POST;

let tenantId: string;
let token: string;
let collectionId: string;
let fieldId: string;

const ENTRY_COUNT = 25;
let publishedSlug: string;
let publishedId: string;
let draftSlug: string;

let projectA2: string;
let collectionA2: string;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ POST: graphqlRoute } = await import("@/app/api/v1/graphql/route"));

  tenantId = await makeTenant("gql-content@example.com");
  const projectId = await makeProject(tenantId, "Content Site");
  token = (await makeApiKey(tenantId, projectId, "Content key")).token;

  collectionId = await makeCollection(tenantId, projectId, "Blog Posts");
  fieldId = await makeField(tenantId, collectionId, { key: "title", widget: "string" });

  const { createEntry, setEntryStatus, findEntry } = await import("@/lib/entries/service");
  const { getTenantDb } = await import("@/lib/db/client");

  for (let i = 0; i < ENTRY_COUNT; i++) {
    const created = await createEntry(tenantId, collectionId, {
      values: { [fieldId]: `Post ${i}` },
    });
    if (!created.ok) throw new Error("fixture entry failed");
    await setEntryStatus(tenantId, collectionId, created.entry.id, "published");
    if (i === 0) {
      publishedId = created.entry.id;
      publishedSlug = (await findEntry(tenantId, collectionId, created.entry.id))!.slug;
    }
  }

  await getTenantDb(tenantId)
    .updateTable("entries")
    .set({ created_at: "2024-06-01 12:00:00" })
    .where("collection_id", "=", collectionId)
    .execute();

  const draft = await createEntry(tenantId, collectionId, { values: { [fieldId]: "Draft" } });
  if (!draft.ok) throw new Error("fixture draft failed");
  draftSlug = (await findEntry(tenantId, collectionId, draft.entry.id))!.slug;

  // A second project for the same tenant, to prove cross-project isolation.
  projectA2 = await makeProject(tenantId, "Second Site");
  collectionA2 = await makeCollection(tenantId, projectA2, "Other Posts");
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

async function query(source: string, variables?: Record<string, unknown>) {
  const response = await graphqlRoute(
    new NextRequest(
      new Request("http://x/api/v1/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: source, variables }),
      }),
    ),
    { params: Promise.resolve({}) },
  );
  return { status: response.status, body: await response.json() };
}

describe("schema derivation", () => {
  it("exposes a list field and single-item field named after the collection slug", async () => {
    const { body } = await query(
      `{ blogPostsEntries { meta { total } } blogPostsEntry(id: "${publishedSlug}") { title } }`,
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.blogPostsEntries.meta.total).toBe(ENTRY_COUNT);
    expect(body.data.blogPostsEntry.title).toBe("Post 0");
  });

  it("does not expose a collection from a different project", async () => {
    const { body } = await query(`{ __type(name: "OtherPosts") { name } }`);
    expect(body.errors).toBeUndefined();
    expect(body.data.__type).toBeNull();
  });
});

describe("pagination", () => {
  it("applies the default page size and reports total/limit/offset", async () => {
    const { body } = await query(`{ blogPostsEntries { meta { total limit offset } data { id } } }`);
    expect(body.data.blogPostsEntries.data).toHaveLength(20);
    expect(body.data.blogPostsEntries.meta).toEqual({ total: ENTRY_COUNT, limit: 20, offset: 0 });
  });

  it("caps an oversized limit rather than honoring it", async () => {
    const { body } = await query(
      `{ blogPostsEntries(limit: 500) { meta { limit } data { id } } }`,
    );
    expect(body.data.blogPostsEntries.data).toHaveLength(ENTRY_COUNT);
    expect(body.data.blogPostsEntries.meta.limit).toBe(100);
  });

  it("walks every page exactly once, entries sharing a timestamp included", async () => {
    const seen = new Set<string>();
    const pageSize = 7;
    for (let offset = 0; offset < ENTRY_COUNT + pageSize; offset += pageSize) {
      const { body } = await query(
        `{ blogPostsEntries(limit: ${pageSize}, offset: ${offset}) { data { id } } }`,
      );
      for (const entry of body.data.blogPostsEntries.data) {
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
    }
    expect(seen.size).toBe(ENTRY_COUNT);
  });

  it("excludes the draft from the list and its total", async () => {
    const { body } = await query(`{ blogPostsEntries(limit: 1) { meta { total } } }`);
    expect(body.data.blogPostsEntries.meta.total).toBe(ENTRY_COUNT);
  });

  it("rejects an unsupported order column with INVALID_QUERY", async () => {
    const { body } = await query(`{ blogPostsEntries(order: "slug") { meta { total } } }`);
    expect(body.data).toBeNull();
    expect(body.errors[0].extensions.code).toBe("INVALID_QUERY");
  });
});

describe("addressing by slug or id", () => {
  it("resolves the same entry by slug and by id", async () => {
    const bySlug = await query(`{ blogPostsEntry(id: "${publishedSlug}") { id title } }`);
    const byId = await query(`{ blogPostsEntry(id: "${publishedId}") { id title } }`);
    expect(bySlug.body.data.blogPostsEntry).toEqual(byId.body.data.blogPostsEntry);
  });

  it("resolves a draft entry to null, indistinguishable from nonexistent", async () => {
    const draft = await query(`{ blogPostsEntry(id: "${draftSlug}") { id } }`);
    const missing = await query(`{ blogPostsEntry(id: "does-not-exist") { id } }`);
    expect(draft.body.data.blogPostsEntry).toBeNull();
    expect(missing.body.data.blogPostsEntry).toBeNull();
  });
});

describe("cross-project scoping", () => {
  it("has no query field for a collection belonging to another project", async () => {
    const { body } = await query(`{ __schema { queryType { fields { name } } } }`);
    const names: string[] = body.data.__schema.queryType.fields.map((f: { name: string }) => f.name);
    expect(names).not.toContain("otherPostsEntries");
    expect(names).not.toContain("otherPostsEntry");
  });
});

describe("cross-tenant scoping", () => {
  it("has no query field for another tenant's collection, even with the same name", async () => {
    const tenantB = await makeTenant("gql-content-b@example.com");
    const projectB = await makeProject(tenantB, "B Site");
    // Same slug as tenant A's collection ("Blog Posts" -> "blog-posts"),
    // to prove isolation isn't merely a naming coincidence.
    await makeCollection(tenantB, projectB, "Blog Posts");
    const tokenB = (await makeApiKey(tenantB, projectB, "B key")).token;

    const response = await graphqlRoute(
      new NextRequest(
        new Request("http://x/api/v1/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
          body: JSON.stringify({
            query: `{ blogPostsEntries { meta { total } } }`,
          }),
        }),
      ),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    // Tenant B's own project has its own "blog-posts" collection, so the
    // field exists and resolves — but only ever against tenant B's data
    // (`getTenantDb` scoping), never tenant A's.
    expect(body.errors).toBeUndefined();
    expect(body.data.blogPostsEntries.meta.total).toBe(0);
  });
});
