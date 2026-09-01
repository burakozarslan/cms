/**
 * @jest-environment node
 *
 * Nested relationship resolution on `POST /api/v1/graphql`. Covers
 * `content-delivery-graphql-api` -> "Relationship fields resolve as nested
 * selectable fields".
 */
import SQLite from "better-sqlite3";
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
let postsId: string;
let authorsId: string;
let authorAId: string;
let danglingAuthorId: string;
let postWithAuthorId: string;
let postWithDanglingAuthorId: string;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ POST: graphqlRoute } = await import("@/app/api/v1/graphql/route"));

  tenantId = await makeTenant("gql-rel@example.com");
  const projectId = await makeProject(tenantId, "Rel Site");
  token = (await makeApiKey(tenantId, projectId, "Rel key")).token;

  authorsId = await makeCollection(tenantId, projectId, "Authors");
  const authorNameField = await makeField(tenantId, authorsId, { key: "name", widget: "string" });

  postsId = await makeCollection(tenantId, projectId, "Posts");
  const postTitleField = await makeField(tenantId, postsId, { key: "title", widget: "string" });
  const authorField = await makeField(tenantId, postsId, {
    key: "author",
    widget: "relationship",
    config: { targetCollectionId: authorsId, multiple: false },
  });

  const { setEntryStatus, createEntry } = await import("@/lib/entries/service");

  authorAId = await makeEntry(tenantId, authorsId, { [authorNameField]: "Ada" });
  await setEntryStatus(tenantId, authorsId, authorAId, "published");

  // A reference is only ever validated as it exists *at creation time* —
  // referencing an entry that is later deleted or unpublished is exactly
  // how a real dangling reference arises (spec: "referencing an entry that
  // is deleted or unpublished").
  danglingAuthorId = await makeEntry(tenantId, authorsId, { [authorNameField]: "Soon gone" });
  await setEntryStatus(tenantId, authorsId, danglingAuthorId, "published");

  const withAuthor = await createEntry(tenantId, postsId, {
    values: { [postTitleField]: "With author", [authorField]: authorAId },
  });
  if (!withAuthor.ok) throw new Error("fixture failed");
  postWithAuthorId = withAuthor.entry.id;
  await setEntryStatus(tenantId, postsId, postWithAuthorId, "published");

  const withDangling = await createEntry(tenantId, postsId, {
    values: { [postTitleField]: "Dangling author", [authorField]: danglingAuthorId },
  });
  if (!withDangling.ok) throw new Error("fixture failed");
  postWithDanglingAuthorId = withDangling.entry.id;
  await setEntryStatus(tenantId, postsId, postWithDanglingAuthorId, "published");

  // Now unpublish the referenced author, so the post's reference dangles.
  await setEntryStatus(tenantId, authorsId, danglingAuthorId, "draft");
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

async function query(source: string) {
  const response = await graphqlRoute(
    new NextRequest(
      new Request("http://x/api/v1/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: source }),
      }),
    ),
    { params: Promise.resolve({}) },
  );
  return { status: response.status, body: await response.json() };
}

describe("nested relationship selection", () => {
  it("returns fields from the referenced entry in the same request", async () => {
    const { body } = await query(
      `{ postsEntry(id: "${postWithAuthorId}") { title author { name } } }`,
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.postsEntry).toEqual({
      title: "With author",
      author: { name: "Ada" },
    });
  });

  it("resolves a dangling reference to null rather than an error", async () => {
    const { body } = await query(
      `{ postsEntry(id: "${postWithDanglingAuthorId}") { title author { name } } }`,
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.postsEntry).toEqual({ title: "Dangling author", author: null });
  });
});

describe("batched reference resolution", () => {
  it("resolves reference lookups through a query count independent of how many entries reference the target", async () => {
    const { createEntry, setEntryStatus } = await import("@/lib/entries/service");
    const { listFields } = await import("@/lib/collections/service");
    const postFields = await listFields(tenantId, postsId);
    const titleFieldId = postFields.find((f) => f.ok && f.key === "title")!.id;
    const authorFieldId = postFields.find((f) => f.ok && f.key === "author")!.id;

    async function addPostsReferencingAuthor(n: number) {
      for (let i = 0; i < n; i++) {
        const created = await createEntry(tenantId, postsId, {
          values: { [titleFieldId]: `Extra ${i}`, [authorFieldId]: authorAId },
        });
        if (!created.ok) throw new Error("fixture failed");
        await setEntryStatus(tenantId, postsId, created.entry.id, "published");
      }
    }

    // Clear the schema cache between runs so schema (re)construction cost —
    // itself query-bearing — isn't counted as part of resolving the query.
    const { clearGraphQLSchemaCache } = await import("@/lib/api/graphql/schema-builder");

    await addPostsReferencingAuthor(3);
    clearGraphQLSchemaCache();
    await query(`{ postsEntries(limit: 100) { data { title } } }`); // warm the schema cache
    const prepare = jest.spyOn(SQLite.prototype, "prepare");
    prepare.mockClear();
    const small = await query(`{ postsEntries(limit: 100) { data { title author { name } } } }`);
    const smallCount = prepare.mock.calls.length;
    expect(small.body.errors).toBeUndefined();

    await addPostsReferencingAuthor(20);
    prepare.mockClear();
    const large = await query(`{ postsEntries(limit: 100) { data { title author { name } } } }`);
    const largeCount = prepare.mock.calls.length;
    expect(large.body.errors).toBeUndefined();

    prepare.mockRestore();

    // 23 additional posts all referencing the same author must not add 23
    // more prepared statements — reference resolution is batched per target
    // collection, not per referencing entry.
    expect(largeCount).toBeLessThanOrEqual(smallCount + 2);
  });
});
