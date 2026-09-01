/**
 * @jest-environment node
 *
 * Schema (re)construction and caching. Covers
 * `content-delivery-graphql-api` -> "The schema is derived from live
 * collection and field definitions" (rebuild-on-change and
 * misconfigured-field-omission scenarios).
 */
import { NextRequest } from "next/server";

import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import { makeApiKey, makeCollection, makeField, makeProject, makeTenant } from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let graphqlRoute: typeof import("@/app/api/v1/graphql/route").POST;

let tenantId: string;
let projectId: string;
let token: string;
let collectionId: string;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ POST: graphqlRoute } = await import("@/app/api/v1/graphql/route"));

  tenantId = await makeTenant("gql-schema@example.com");
  projectId = await makeProject(tenantId, "Schema Site");
  token = (await makeApiKey(tenantId, projectId, "Schema key")).token;

  collectionId = await makeCollection(tenantId, projectId, "Posts");
  await makeField(tenantId, collectionId, { key: "title", widget: "string" });
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

async function fieldNamesOn(typeName: string): Promise<string[]> {
  const { body } = await query(
    `{ __type(name: "${typeName}") { fields { name } } }`,
  );
  return (body.data.__type.fields as { name: string }[]).map((f) => f.name);
}

describe("schema reflects live field changes", () => {
  it("includes a field added after the schema was already served once", async () => {
    const before = await fieldNamesOn("Posts");
    expect(before).toContain("title");
    expect(before).not.toContain("subtitle");

    await makeField(tenantId, collectionId, { key: "subtitle", widget: "string" });

    const after = await fieldNamesOn("Posts");
    expect(after).toContain("subtitle");
  });
});

describe("misconfigured fields are omitted", () => {
  it("leaves a field with unparseable stored config out of the generated type", async () => {
    const { getTenantDb } = await import("@/lib/db/client");
    const { randomUUID } = await import("node:crypto");

    await getTenantDb(tenantId)
      .insertInto("fields")
      .values({
        id: randomUUID(),
        collection_id: collectionId,
        key: "broken",
        label: "Broken",
        widget: "mystery-widget",
        required: 0,
        position: 99,
        config: "not valid json",
      })
      .execute();

    // Bump schema_version directly so the cache key changes and the schema
    // is rebuilt against the corrupted row (mirrors what `createField` would
    // otherwise do transactionally).
    await getTenantDb(tenantId)
      .updateTable("collections")
      .set((eb) => ({ schema_version: eb("schema_version", "+", 1) }))
      .where("id", "=", collectionId)
      .execute();

    const names = await fieldNamesOn("Posts");
    expect(names).not.toContain("broken");
    expect(names).toContain("title");
  });
});
