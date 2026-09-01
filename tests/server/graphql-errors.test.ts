/**
 * @jest-environment node
 *
 * Error handling on `POST /api/v1/graphql`. Covers
 * `content-delivery-graphql-api` -> "The GraphQL endpoint reuses REST
 * authentication and scoping" (mutation rejection), "Errors use a
 * GraphQL-native envelope drawn from the same closed code set", and the
 * query-depth guard from design.md.
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
  makeField,
  makeProject,
  makeTenant,
} from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let graphqlRoute: typeof import("@/app/api/v1/graphql/route").POST;

let token: string;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ POST: graphqlRoute } = await import("@/app/api/v1/graphql/route"));

  const tenantId = await makeTenant("gql-errors@example.com");
  const projectId = await makeProject(tenantId, "Errors Site");
  const postsId = await makeCollection(tenantId, projectId, "Posts");
  await makeField(tenantId, postsId, { key: "title", widget: "string" });
  const authorsId = await makeCollection(tenantId, projectId, "Authors");
  await makeField(tenantId, authorsId, { key: "name", widget: "string" });

  token = (await makeApiKey(tenantId, projectId, "Errors key")).token;
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

describe("malformed request", () => {
  it("400s a body with no query string", async () => {
    const response = await graphqlRoute(
      new NextRequest(
        new Request("http://x/api/v1/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        }),
      ),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });
});

describe("mutation rejected", () => {
  it("rejects a mutation operation with an INVALID_QUERY-coded error, never executing it", async () => {
    const { body } = await query(`mutation { deletePost(id: "x") }`);
    expect(body.data).toBeNull();
    expect(body.errors).toBeDefined();
    expect(body.errors[0].extensions.code).toBe("INVALID_QUERY");
  });
});

describe("query depth limit", () => {
  it("rejects a pathologically deep query with INVALID_QUERY", async () => {
    // Each level nests the same relationship field name (`author`) on the
    // Posts type — invalid past the schema's actual depth, but the depth
    // rule must trip before that field-existence error even matters.
    const deep = "a".repeat(0); // placeholder to keep structure obvious
    const nested = Array.from({ length: 25 }, () => "author { name").join(" ");
    const closing = "}".repeat(25);
    const doc = `{ postsEntries { data { title ${nested} ${closing} } } }`;
    void deep;

    const { body } = await query(doc);
    expect(body.data).toBeNull();
    expect(body.errors).toBeDefined();
    expect(body.errors.some((e: { extensions: { code: string } }) => e.extensions.code === "INVALID_QUERY")).toBe(
      true,
    );
  });
});

describe("unexpected resolver failure", () => {
  it("surfaces as an opaque INTERNAL error with no leaked detail, without blocking sibling fields", async () => {
    jest.resetModules();
    jest.doMock("@/lib/api/resolve-target", () => {
      const actual = jest.requireActual("@/lib/api/resolve-target");
      return {
        ...actual,
        resolveEntry: () => {
          throw new Error("simulated database explosion with a secret path /etc/passwd");
        },
      };
    });

    const { POST: brokenRoute } = await import("@/app/api/v1/graphql/route");

    const response = await brokenRoute(
      new NextRequest(
        new Request("http://x/api/v1/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            query: `{ postsEntry(id: "x") { title } authorsEntries { meta { total } } }`,
          }),
        }),
      ),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.postsEntry).toBeNull();
    expect(body.data.authorsEntries.meta.total).toBe(0);
    expect(body.errors[0].extensions.code).toBe("INTERNAL");
    expect(body.errors[0].message).toBe("An unexpected error occurred.");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("/etc/passwd");

    jest.dontMock("@/lib/api/resolve-target");
    jest.resetModules();
  });
});

describe("no permissive CORS header", () => {
  it("never grants cross-origin access on an error response", async () => {
    const response = await graphqlRoute(
      new NextRequest(
        new Request("http://x/api/v1/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: `mutation { deletePost(id: "x") }` }),
        }),
      ),
      { params: Promise.resolve({}) },
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
