/**
 * @jest-environment node
 *
 * Authentication and CORS posture on `POST /api/v1/graphql`. Covers
 * `content-delivery-graphql-api` -> "The GraphQL endpoint reuses REST
 * authentication and scoping" and "The endpoint is not exposed to
 * cross-origin browser callers".
 */
import { NextRequest } from "next/server";

import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import { makeApiKey, makeCollection, makeProject, makeTenant } from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let graphqlRoute: typeof import("@/app/api/v1/graphql/route").POST;

let token: string;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ POST: graphqlRoute } = await import("@/app/api/v1/graphql/route"));

  const tenantId = await makeTenant("gql-auth@example.com");
  const projectId = await makeProject(tenantId, "Auth Site");
  await makeCollection(tenantId, projectId, "Posts");

  token = (await makeApiKey(tenantId, projectId, "Auth key")).token;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("http://x/api/v1/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

async function call(body: unknown, headers: Record<string, string> = {}) {
  const response = await graphqlRoute(request(body, headers), { params: Promise.resolve({}) });
  return { status: response.status, body: await response.json(), response };
}

describe("missing/malformed credentials", () => {
  it("401s with no key header at all", async () => {
    const { status, body } = await call({ query: "{ postsEntries { meta { total } } }" });
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("401s a well-formed but unknown token", async () => {
    const { status } = await call(
      { query: "{ postsEntries { meta { total } } }" },
      { Authorization: "Bearer cms_live_0000000000000000_doesnotexist" },
    );
    expect(status).toBe(401);
  });
});

describe("both header forms authenticate identically", () => {
  it("accepts Authorization: Bearer", async () => {
    const { status } = await call(
      { query: "{ postsEntries { meta { total } } }" },
      { Authorization: `Bearer ${token}` },
    );
    expect(status).toBe(200);
  });

  it("accepts X-API-Key", async () => {
    const { status } = await call(
      { query: "{ postsEntries { meta { total } } }" },
      { "X-API-Key": token },
    );
    expect(status).toBe(200);
  });
});

describe("no permissive CORS header", () => {
  it("never grants cross-origin access", async () => {
    const { response } = await call(
      { query: "{ postsEntries { meta { total } } }" },
      { Authorization: `Bearer ${token}` },
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
