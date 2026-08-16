/**
 * @jest-environment node
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

const { cleanup } = setupTempDatabase();

jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: jest.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

const requireSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  requireSession: () => requireSession(),
  signOut: jest.fn(),
}));

let DashboardPage: typeof import("@/app/dashboard/page").default;
let ProjectPage: typeof import("@/app/dashboard/[projectId]/page").default;
let SettingsLayout: typeof import("@/app/dashboard/settings/layout").default;
let tenantA: string;
let tenantB: string;
let projectB: string;

beforeAll(async () => {
  await migrateTestDatabase();

  const { registerTenant } = await import("@/lib/tenants/register");
  const { createProject } = await import("@/lib/projects/service");

  const a = await registerTenant({ email: "guard-a@example.com", password: "password one" });
  const b = await registerTenant({ email: "guard-b@example.com", password: "password two" });
  if (!a.ok || !b.ok) throw new Error("fixture registration failed");

  tenantA = a.tenantId;
  tenantB = b.tenantId;

  const created = await createProject(tenantB, { name: "B Private" });
  if (!created.ok) throw new Error("fixture project failed");
  projectB = created.project.id;

  DashboardPage = (await import("@/app/dashboard/page")).default;
  ProjectPage = (await import("@/app/dashboard/[projectId]/page")).default;
  SettingsLayout = (await import("@/app/dashboard/settings/layout")).default;
});

afterEach(() => {
  requireSession.mockReset();
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

const asTenant = (tenantId: string) => ({
  user: { id: "user", tenantId, email: "someone@example.com" },
});

describe("unauthenticated access", () => {
  it("redirects /dashboard to /login", async () => {
    requireSession.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects a project workspace to /login", async () => {
    requireSession.mockResolvedValue(null);

    await expect(
      ProjectPage({ params: Promise.resolve({ projectId: projectB }) }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects settings to /login", async () => {
    requireSession.mockResolvedValue(null);

    await expect(
      SettingsLayout({ children: null }),
    ).rejects.toThrow("REDIRECT:/login");
  });
});

describe("authenticated access to a project workspace", () => {
  it("is denied for another tenant's project id", async () => {
    requireSession.mockResolvedValue(asTenant(tenantA));

    await expect(
      ProjectPage({ params: Promise.resolve({ projectId: projectB }) }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("is denied for an id that does not exist", async () => {
    requireSession.mockResolvedValue(asTenant(tenantA));

    await expect(
      ProjectPage({ params: Promise.resolve({ projectId: "no-such-id" }) }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("is allowed for the owning tenant", async () => {
    requireSession.mockResolvedValue(asTenant(tenantB));

    await expect(
      ProjectPage({ params: Promise.resolve({ projectId: projectB }) }),
    ).resolves.toBeTruthy();
  });
});
