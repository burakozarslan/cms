/**
 * @jest-environment node
 *
 * Authentication on the content delivery API. Covers `content-delivery-api`
 * → "Content endpoints require a valid API key" and the error envelope.
 */
import { NextRequest } from "next/server";

import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import { makeApiKey, makeCollection, makeProject, makeTenant } from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let collectionsRoute: typeof import("@/app/api/v1/collections/route").GET;

let token: string;
let tenantId: string;
let projectId: string;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ GET: collectionsRoute } = await import("@/app/api/v1/collections/route"));

  tenantId = await makeTenant("api-auth@example.com");
  projectId = await makeProject(tenantId, "Auth Site");
  await makeCollection(tenantId, projectId, "Posts");

  token = (await makeApiKey(tenantId, projectId, "Auth key")).token;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new Request("http://x/api/v1/collections", { headers }));
}

async function call(headers: Record<string, string> = {}) {
  const response = await collectionsRoute(request(headers), { params: Promise.resolve({}) });
  return { status: response.status, body: await response.json(), response };
}

describe("missing/malformed credentials", () => {
  it("401s with no key header at all", async () => {
    const { status, body } = await call();
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("401s a structurally malformed bearer token", async () => {
    const { status, body } = await call({ Authorization: "Bearer not-a-real-token" });
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("401s a well-formed but unknown token", async () => {
    const { status } = await call({
      Authorization: "Bearer cms_live_0000000000000000_doesnotexist",
    });
    expect(status).toBe(401);
  });
});

describe("both header forms authenticate identically", () => {
  it("accepts Authorization: Bearer", async () => {
    const { status } = await call({ Authorization: `Bearer ${token}` });
    expect(status).toBe(200);
  });

  it("accepts X-API-Key", async () => {
    const { status } = await call({ "X-API-Key": token });
    expect(status).toBe(200);
  });
});

describe("revoked and expired credentials", () => {
  it("401s a revoked key", async () => {
    const created = await makeApiKey(tenantId, projectId, "To revoke");
    const { revokeApiKey } = await import("@/lib/api-keys/service");
    const { getRootDb } = await import("@/lib/db/client");

    const row = await getRootDb()
      .selectFrom("api_keys")
      .select("id")
      .where("key_id", "=", created.keyId)
      .executeTakeFirstOrThrow();

    await revokeApiKey(tenantId, projectId, row.id);

    const { status, body } = await call({ Authorization: `Bearer ${created.token}` });
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("401s an expired key", async () => {
    const created = await makeApiKey(tenantId, projectId, "To expire");
    const { getRootDb } = await import("@/lib/db/client");

    await getRootDb()
      .updateTable("api_keys")
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where("key_id", "=", created.keyId)
      .execute();

    const { status } = await call({ Authorization: `Bearer ${created.token}` });
    expect(status).toBe(401);
  });
});

describe("unexpected handler errors", () => {
  it("surfaces as 500 INTERNAL with no leaked detail", async () => {
    jest.resetModules();
    jest.doMock("@/lib/collections/service", () => ({
      listCollections: () => {
        throw new Error("simulated database explosion with a secret path /etc/passwd");
      },
    }));

    const { GET: brokenRoute } = await import("@/app/api/v1/collections/route");
    const response = await brokenRoute(
      new NextRequest(
        new Request("http://x/api/v1/collections", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: { code: "INTERNAL", message: "An unexpected error occurred." },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("/etc/passwd");

    jest.dontMock("@/lib/collections/service");
    jest.resetModules();
  });
});

describe("rate limit headers", () => {
  it("are present on both success and failure responses", async () => {
    const ok = await call({ Authorization: `Bearer ${token}` });
    const failed = await call();

    expect(ok.response.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(failed.response.headers.get("X-RateLimit-Limit")).toBeTruthy();
  });
});

describe("no permissive CORS header", () => {
  it("never grants cross-origin access", async () => {
    const { response } = await call({ Authorization: `Bearer ${token}` });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
