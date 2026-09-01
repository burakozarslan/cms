/**
 * @jest-environment node
 *
 * Key management service: creation, listing, revocation, and resolution.
 * Covers `api-key-management`'s requirements.
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import { makeProject, makeTenant } from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let service: typeof import("@/lib/api-keys/service");
let resolve: typeof import("@/lib/api-keys/resolve");
let db: typeof import("@/lib/db/client");

let tenantId: string;
let projectId: string;
let userId: string;

beforeAll(async () => {
  await migrateTestDatabase();
  service = await import("@/lib/api-keys/service");
  resolve = await import("@/lib/api-keys/resolve");
  db = await import("@/lib/db/client");

  tenantId = await makeTenant("keys@example.com");
  projectId = await makeProject(tenantId, "Site");

  const user = await db
    .getRootDb()
    .selectFrom("users")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  userId = user!.id;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("createApiKey", () => {
  it("returns the raw token exactly once, in the create result", async () => {
    const result = await service.createApiKey(tenantId, projectId, userId, "My key");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).toMatch(/^cms_live_[0-9a-f]{16}_.+$/);

    const listed = await service.listApiKeys(tenantId, projectId);
    const row = listed.find((key) => key.id === result.apiKey.id);
    // No listing/read function exposes anything resembling the raw token.
    expect(JSON.stringify(row)).not.toContain(result.token.split("_").at(-1));
  });

  it("stores no plaintext secret on the row", async () => {
    const result = await service.createApiKey(tenantId, projectId, userId, "Plain check");
    if (!result.ok) throw new Error("expected success");

    const row = await db
      .getRootDb()
      .selectFrom("api_keys")
      .selectAll()
      .where("id", "=", result.apiKey.id)
      .executeTakeFirstOrThrow();

    const secret = result.token.split("_").slice(3).join("_");
    expect(row.secret_hash).not.toBe(secret);
    expect(JSON.stringify(row)).not.toContain(secret);
  });

  it("refuses a project belonging to another tenant", async () => {
    const otherTenant = await makeTenant("keys-other@example.com");
    const otherProject = await makeProject(otherTenant, "Other");

    const result = await service.createApiKey(tenantId, otherProject, userId, "Cross tenant");
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects a blank name", async () => {
    const result = await service.createApiKey(tenantId, projectId, userId, "   ");
    expect(result.ok).toBe(false);
  });
});

describe("listApiKeys / countActiveApiKeys", () => {
  it("is scoped to the acting tenant and the given project", async () => {
    const tenantB = await makeTenant("keys-b@example.com");
    const projectB = await makeProject(tenantB, "B Site");
    const userB = await db
      .getRootDb()
      .selectFrom("users")
      .select("id")
      .where("tenant_id", "=", tenantB)
      .executeTakeFirstOrThrow();

    await service.createApiKey(tenantB, projectB, userB.id, "B's key");

    const listed = await service.listApiKeys(tenantId, projectId);
    expect(listed.every((key) => key.project_id === projectId)).toBe(true);
    expect(listed.some((key) => key.name === "B's key")).toBe(false);
  });

  it("counts only non-revoked keys", async () => {
    const project = await makeProject(tenantId, "Count Project");
    const before = await service.countActiveApiKeys(tenantId, project);
    expect(before).toBe(0);

    const created = await service.createApiKey(tenantId, project, userId, "Countable");
    if (!created.ok) throw new Error("expected success");

    expect(await service.countActiveApiKeys(tenantId, project)).toBe(1);

    await service.revokeApiKey(tenantId, project, created.apiKey.id);
    expect(await service.countActiveApiKeys(tenantId, project)).toBe(0);
  });
});

describe("revokeApiKey", () => {
  it("stops the key from resolving, before any content query would run", async () => {
    const created = await service.createApiKey(tenantId, projectId, userId, "To revoke");
    if (!created.ok) throw new Error("expected success");

    expect(await resolve.resolveApiKey(created.token)).toBeDefined();

    const revoked = await service.revokeApiKey(tenantId, projectId, created.apiKey.id);
    expect(revoked).toEqual({ ok: true });

    expect(await resolve.resolveApiKey(created.token)).toBeUndefined();
  });

  it("records revocation rather than deleting the row", async () => {
    const created = await service.createApiKey(tenantId, projectId, userId, "Stays visible");
    if (!created.ok) throw new Error("expected success");

    await service.revokeApiKey(tenantId, projectId, created.apiKey.id);

    const listed = await service.listApiKeys(tenantId, projectId);
    const row = listed.find((key) => key.id === created.apiKey.id);
    expect(row).toBeDefined();
    expect(row?.revoked_at).not.toBeNull();
  });

  it("is a no-op (NOT_FOUND) for an already-revoked key", async () => {
    const created = await service.createApiKey(tenantId, projectId, userId, "Double revoke");
    if (!created.ok) throw new Error("expected success");

    await service.revokeApiKey(tenantId, projectId, created.apiKey.id);
    const second = await service.revokeApiKey(tenantId, projectId, created.apiKey.id);
    expect(second).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("resolveApiKey", () => {
  it("resolves an expired key to undefined", async () => {
    const created = await service.createApiKey(tenantId, projectId, userId, "Expiring");
    if (!created.ok) throw new Error("expected success");

    await db
      .getRootDb()
      .updateTable("api_keys")
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where("id", "=", created.apiKey.id)
      .execute();

    expect(await resolve.resolveApiKey(created.token)).toBeUndefined();
  });

  it("resolves an unknown token to undefined", async () => {
    expect(
      await resolve.resolveApiKey("cms_live_0000000000000000_doesnotexist"),
    ).toBeUndefined();
  });

  it("resolves a structurally malformed token to undefined without a lookup", async () => {
    expect(await resolve.resolveApiKey("not-a-token")).toBeUndefined();
  });
});

describe("touchLastUsed", () => {
  it("writes on a cold key and skips on a warm one", async () => {
    const created = await service.createApiKey(tenantId, projectId, userId, "Touch test");
    if (!created.ok) throw new Error("expected success");

    const keyId = created.apiKey.key_id;

    const before = await db
      .getRootDb()
      .selectFrom("api_keys")
      .select("last_used_at")
      .where("key_id", "=", keyId)
      .executeTakeFirstOrThrow();
    expect(before.last_used_at).toBeNull();

    await resolve.touchLastUsed(keyId);

    const afterFirst = await db
      .getRootDb()
      .selectFrom("api_keys")
      .select("last_used_at")
      .where("key_id", "=", keyId)
      .executeTakeFirstOrThrow();
    expect(afterFirst.last_used_at).not.toBeNull();

    // Warm: a second call moments later must not overwrite the timestamp.
    await resolve.touchLastUsed(keyId);
    const afterSecond = await db
      .getRootDb()
      .selectFrom("api_keys")
      .select("last_used_at")
      .where("key_id", "=", keyId)
      .executeTakeFirstOrThrow();
    expect(afterSecond.last_used_at).toBe(afterFirst.last_used_at);
  });

  it("never throws for an unknown keyId", async () => {
    await expect(resolve.touchLastUsed("does-not-exist")).resolves.toBeUndefined();
  });
});
