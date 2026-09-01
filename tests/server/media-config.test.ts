/**
 * @jest-environment node
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

process.env.MEDIA_CONFIG_ENCRYPTION_KEY = "v97uOic9/sbhtkB2rBdyys0hcKELLhdfW8hMCpcTBi8=";

const { cleanup } = setupTempDatabase();

let service: typeof import("@/lib/media-config/service");
let getRootDb: typeof import("@/lib/db/client").getRootDb;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  await migrateTestDatabase();

  service = await import("@/lib/media-config/service");
  ({ getRootDb } = await import("@/lib/db/client"));

  const { registerTenant } = await import("@/lib/tenants/register");
  const a = await registerTenant({ email: "media-a@example.com", password: "password one" });
  const b = await registerTenant({ email: "media-b@example.com", password: "password two" });
  if (!a.ok || !b.ok) throw new Error("fixture registration failed");

  tenantA = a.tenantId;
  tenantB = b.tenantId;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("getMediaConfigStatus", () => {
  it("reports not configured when no row exists", async () => {
    await expect(service.getMediaConfigStatus(tenantA)).resolves.toEqual({
      configured: false,
      cloudName: null,
      apiKey: null,
      lastCheckedAt: null,
      lastCheckOk: null,
    });
  });
});

describe("saveMediaConfig", () => {
  it("rejects an empty cloud_name or api_key", async () => {
    const result = await service.saveMediaConfig(tenantA, {
      cloudName: "",
      apiKey: "",
      apiSecret: "shh",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.cloudName).toBeDefined();
    expect(result.fieldErrors.apiKey).toBeDefined();
  });

  it("rejects a first save with no api_secret", async () => {
    const result = await service.saveMediaConfig(tenantA, {
      cloudName: "acme",
      apiKey: "123",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.apiSecret).toBeDefined();
  });

  it("creates a config on first save and never stores the secret in plaintext", async () => {
    const result = await service.saveMediaConfig(tenantA, {
      cloudName: "acme",
      apiKey: "key-123",
      apiSecret: "top-secret-value",
    });

    expect(result).toEqual({ ok: true });

    const row = await getRootDb()
      .selectFrom("tenant_media_config")
      .selectAll()
      .where("tenant_id", "=", tenantA)
      .executeTakeFirstOrThrow();

    expect(row.cloud_name).toBe("acme");
    expect(row.api_key).toBe("key-123");
    expect(row.api_secret_enc).not.toContain("top-secret-value");

    await expect(service.getMediaConfigStatus(tenantA)).resolves.toEqual({
      configured: true,
      cloudName: "acme",
      apiKey: "key-123",
      lastCheckedAt: null,
      lastCheckOk: null,
    });
  });

  it("blank api_secret on update preserves the existing encrypted secret", async () => {
    const before = await getRootDb()
      .selectFrom("tenant_media_config")
      .select("api_secret_enc")
      .where("tenant_id", "=", tenantA)
      .executeTakeFirstOrThrow();

    const result = await service.saveMediaConfig(tenantA, {
      cloudName: "acme-renamed",
      apiKey: "key-123",
    });

    expect(result).toEqual({ ok: true });

    const after = await getRootDb()
      .selectFrom("tenant_media_config")
      .select(["cloud_name", "api_secret_enc"])
      .where("tenant_id", "=", tenantA)
      .executeTakeFirstOrThrow();

    expect(after.cloud_name).toBe("acme-renamed");
    expect(after.api_secret_enc).toBe(before.api_secret_enc);
  });

  it("non-blank api_secret on update rotates the stored secret", async () => {
    const before = await getRootDb()
      .selectFrom("tenant_media_config")
      .select("api_secret_enc")
      .where("tenant_id", "=", tenantA)
      .executeTakeFirstOrThrow();

    const result = await service.saveMediaConfig(tenantA, {
      cloudName: "acme-renamed",
      apiKey: "key-123",
      apiSecret: "rotated-secret",
    });

    expect(result).toEqual({ ok: true });

    const after = await getRootDb()
      .selectFrom("tenant_media_config")
      .select("api_secret_enc")
      .where("tenant_id", "=", tenantA)
      .executeTakeFirstOrThrow();

    expect(after.api_secret_enc).not.toBe(before.api_secret_enc);
  });

  it("resets the last check result whenever the config is saved", async () => {
    await service.recordConnectionCheck(tenantA, true);
    await expect(service.getMediaConfigStatus(tenantA)).resolves.toMatchObject({
      lastCheckOk: true,
    });

    await service.saveMediaConfig(tenantA, {
      cloudName: "acme-renamed",
      apiKey: "key-123",
      apiSecret: "another-rotation",
    });

    await expect(service.getMediaConfigStatus(tenantA)).resolves.toMatchObject({
      lastCheckedAt: null,
      lastCheckOk: null,
    });
  });
});

describe("tenant isolation", () => {
  it("keeps each tenant's config separate", async () => {
    await service.saveMediaConfig(tenantB, {
      cloudName: "beta-cloud",
      apiKey: "beta-key",
      apiSecret: "beta-secret",
    });

    await expect(service.getMediaConfigStatus(tenantB)).resolves.toMatchObject({
      cloudName: "beta-cloud",
      apiKey: "beta-key",
    });
    await expect(service.getMediaConfigStatus(tenantA)).resolves.toMatchObject({
      cloudName: "acme-renamed",
    });
  });

  it("credentials decrypted for one tenant never leak the other tenant's secret", async () => {
    const credsA = await service.getMediaCredentials(tenantA);
    const credsB = await service.getMediaCredentials(tenantB);

    expect(credsA?.apiSecret).not.toBe(credsB?.apiSecret);
    expect(credsB?.apiSecret).toBe("beta-secret");
  });

  it("a fresh tenant with no config gets undefined credentials, not another tenant's", async () => {
    const { registerTenant } = await import("@/lib/tenants/register");
    const fresh = await registerTenant({
      email: "media-fresh@example.com",
      password: "password three",
    });
    if (!fresh.ok) throw new Error("fixture registration failed");

    await expect(
      service.getMediaCredentials(fresh.tenantId),
    ).resolves.toBeUndefined();
  });
});
