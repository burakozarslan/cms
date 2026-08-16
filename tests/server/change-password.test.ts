/**
 * @jest-environment node
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

const { cleanup } = setupTempDatabase();

let changePassword: typeof import("@/lib/auth/change-password").changePassword;
let getRootDb: typeof import("@/lib/db/client").getRootDb;
let verifyPassword: typeof import("@/lib/auth/password").verifyPassword;
let userId: string;

beforeAll(async () => {
  await migrateTestDatabase();

  ({ changePassword } = await import("@/lib/auth/change-password"));
  ({ getRootDb } = await import("@/lib/db/client"));
  ({ verifyPassword } = await import("@/lib/auth/password"));

  const { registerTenant } = await import("@/lib/tenants/register");
  const registered = await registerTenant({
    email: "change-password@example.com",
    password: "original password",
  });
  if (!registered.ok) throw new Error("fixture registration failed");
  userId = registered.userId;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("changePassword", () => {
  it("rejects an incorrect current password without mutating the row", async () => {
    const before = await getRootDb()
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();

    const result = await changePassword(userId, {
      currentPassword: "wrong password",
      newPassword: "a brand new password",
    });

    expect(result).toEqual({ ok: false, error: "INCORRECT_PASSWORD" });

    const after = await getRootDb()
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();

    expect(after.password_hash).toBe(before.password_hash);
  });

  it("rejects a new password below the minimum length via zod", async () => {
    const before = await getRootDb()
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();

    const result = await changePassword(userId, {
      currentPassword: "original password",
      newPassword: "short",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
    if (result.error !== "INVALID") return;
    expect(result.fieldErrors.newPassword).toBeDefined();

    const after = await getRootDb()
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();

    expect(after.password_hash).toBe(before.password_hash);
  });

  it("updates the hash when the current password is correct and the new password is valid", async () => {
    const result = await changePassword(userId, {
      currentPassword: "original password",
      newPassword: "a brand new password",
    });

    expect(result).toEqual({ ok: true });

    const user = await getRootDb()
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();

    await expect(
      verifyPassword("a brand new password", user.password_hash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("original password", user.password_hash),
    ).resolves.toBe(false);
  });
});
