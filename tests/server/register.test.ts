/**
 * @jest-environment node
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

const { cleanup } = setupTempDatabase();

let registerTenant: typeof import("@/lib/tenants/register").registerTenant;
let getRootDb: typeof import("@/lib/db/client").getRootDb;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ registerTenant } = await import("@/lib/tenants/register"));
  ({ getRootDb } = await import("@/lib/db/client"));
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("registerTenant", () => {
  it("creates exactly one tenant and one user", async () => {
    const result = await registerTenant({
      email: "owner@example.com",
      password: "correct horse battery",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const users = await getRootDb()
      .selectFrom("users")
      .selectAll()
      .where("email", "=", "owner@example.com")
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].tenant_id).toBe(result.tenantId);

    const tenants = await getRootDb()
      .selectFrom("tenants")
      .selectAll()
      .where("id", "=", result.tenantId)
      .execute();

    expect(tenants).toHaveLength(1);
  });

  it("stores a hash, never the plaintext password", async () => {
    const password = "super secret password";
    const result = await registerTenant({
      email: "hashed@example.com",
      password,
    });
    expect(result.ok).toBe(true);

    const user = await getRootDb()
      .selectFrom("users")
      .select("password_hash")
      .where("email", "=", "hashed@example.com")
      .executeTakeFirstOrThrow();

    expect(user.password_hash).not.toBe(password);
    expect(user.password_hash).toMatch(/^\$2[aby]\$/);

    const { verifyPassword } = await import("@/lib/auth/password");
    await expect(verifyPassword(password, user.password_hash)).resolves.toBe(true);
  });

  it("normalizes the email before storing it", async () => {
    const result = await registerTenant({
      email: "  MiXeD@Example.COM  ",
      password: "another password",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email).toBe("mixed@example.com");
  });

  it("rejects a duplicate email without creating records", async () => {
    await registerTenant({
      email: "dupe@example.com",
      password: "first password",
    });

    const before = await getRootDb()
      .selectFrom("tenants")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();

    const result = await registerTenant({
      email: "dupe@example.com",
      password: "second password",
    });

    expect(result).toEqual({ ok: false, error: "EMAIL_TAKEN" });

    const after = await getRootDb()
      .selectFrom("tenants")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();

    expect(after.count).toBe(before.count);
  });

  it("treats a differently-cased duplicate as taken", async () => {
    await registerTenant({ email: "case@example.com", password: "a password" });

    const result = await registerTenant({
      email: "CASE@EXAMPLE.COM",
      password: "a password",
    });

    expect(result).toEqual({ ok: false, error: "EMAIL_TAKEN" });
  });

  it("rejects an invalid email", async () => {
    const result = await registerTenant({
      email: "not-an-email",
      password: "a valid password",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
    if (result.error !== "INVALID") return;
    expect(result.fieldErrors.email).toBeDefined();
  });

  it("rejects a password below the minimum length", async () => {
    const result = await registerTenant({
      email: "short@example.com",
      password: "short",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
    if (result.error !== "INVALID") return;
    expect(result.fieldErrors.password).toBeDefined();

    const users = await getRootDb()
      .selectFrom("users")
      .selectAll()
      .where("email", "=", "short@example.com")
      .execute();

    expect(users).toHaveLength(0);
  });
});
