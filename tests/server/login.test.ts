/**
 * @jest-environment node
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

const { cleanup } = setupTempDatabase();

const EMAIL = "member@example.com";
const PASSWORD = "a good enough password";

let authorizeCredentials: typeof import("@/lib/auth/authorize").authorizeCredentials;
let tenantId: string;

beforeAll(async () => {
  await migrateTestDatabase();

  const { registerTenant } = await import("@/lib/tenants/register");
  const result = await registerTenant({ email: EMAIL, password: PASSWORD });
  if (!result.ok) throw new Error("fixture registration failed");
  tenantId = result.tenantId;

  ({ authorizeCredentials } = await import("@/lib/auth/authorize"));
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("authorizeCredentials", () => {
  it("returns the user with their tenantId on correct credentials", async () => {
    const user = await authorizeCredentials({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(user).not.toBeNull();
    expect(user?.email).toBe(EMAIL);
    expect(user?.tenantId).toBe(tenantId);
  });

  it("accepts a differently-cased email", async () => {
    const user = await authorizeCredentials({
      email: "MEMBER@EXAMPLE.COM",
      password: PASSWORD,
    });

    expect(user?.tenantId).toBe(tenantId);
  });

  it("never returns the password hash", async () => {
    const user = await authorizeCredentials({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(JSON.stringify(user)).not.toMatch(/\$2[aby]\$/);
  });

  it("rejects a wrong password", async () => {
    await expect(
      authorizeCredentials({ email: EMAIL, password: "wrong password" }),
    ).resolves.toBeNull();
  });

  it("rejects an unknown email indistinguishably", async () => {
    await expect(
      authorizeCredentials({ email: "nobody@example.com", password: PASSWORD }),
    ).resolves.toBeNull();
  });

  it("rejects malformed input", async () => {
    await expect(
      authorizeCredentials({ email: "not-an-email", password: PASSWORD }),
    ).resolves.toBeNull();

    await expect(
      authorizeCredentials({ email: EMAIL, password: "" }),
    ).resolves.toBeNull();

    await expect(authorizeCredentials({})).resolves.toBeNull();
  });
});

describe("session callbacks", () => {
  it("moves userId and tenantId onto the token at sign-in, then keeps them", async () => {
    const { authConfig } = await import("@/lib/auth/config");
    const jwt = authConfig.callbacks.jwt;

    const signedIn = await jwt({
      token: {},
      user: { id: "user-1", tenantId: "tenant-1" },
    } as Parameters<typeof jwt>[0]);

    expect(signedIn).toMatchObject({ userId: "user-1", tenantId: "tenant-1" });

    // Subsequent requests carry no `user`; the claims must survive.
    const later = await jwt({
      token: signedIn,
    } as Parameters<typeof jwt>[0]);

    expect(later).toMatchObject({ userId: "user-1", tenantId: "tenant-1" });
  });

  it("exposes userId and tenantId on the session", async () => {
    const { authConfig } = await import("@/lib/auth/config");
    const session = await authConfig.callbacks.session({
      session: { user: { email: EMAIL } },
      token: { userId: "user-1", tenantId: "tenant-1" },
    } as unknown as Parameters<typeof authConfig.callbacks.session>[0]);

    expect(session.user.id).toBe("user-1");
    expect(session.user.tenantId).toBe("tenant-1");
  });
});

describe("route protection", () => {
  const authorized = async (pathname: string, signedIn: boolean) => {
    const { authConfig } = await import("@/lib/auth/config");
    return authConfig.callbacks.authorized({
      auth: signedIn ? { user: { id: "u", tenantId: "t" } } : null,
      request: { nextUrl: { pathname } },
    } as unknown as Parameters<typeof authConfig.callbacks.authorized>[0]);
  };

  it("denies /dashboard when signed out", async () => {
    await expect(authorized("/dashboard", false)).resolves.toBe(false);
  });

  it("denies a project workspace when signed out", async () => {
    await expect(authorized("/dashboard/abc-123", false)).resolves.toBe(false);
  });

  it("allows /dashboard when signed in", async () => {
    await expect(authorized("/dashboard", true)).resolves.toBe(true);
  });

  it("leaves the auth pages public", async () => {
    await expect(authorized("/login", false)).resolves.toBe(true);
    await expect(authorized("/register", false)).resolves.toBe(true);
  });
});
