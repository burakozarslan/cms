/**
 * @jest-environment node
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

const { cleanup } = setupTempDatabase();

let service: typeof import("@/lib/projects/service");
let tenantA: string;
let tenantB: string;
let projectB: string;

beforeAll(async () => {
  await migrateTestDatabase();

  const { registerTenant } = await import("@/lib/tenants/register");
  service = await import("@/lib/projects/service");

  const a = await registerTenant({ email: "a@example.com", password: "password one" });
  const b = await registerTenant({ email: "b@example.com", password: "password two" });
  if (!a.ok || !b.ok) throw new Error("fixture registration failed");

  tenantA = a.tenantId;
  tenantB = b.tenantId;

  await service.createProject(tenantA, { name: "A Blog" });

  const created = await service.createProject(tenantB, { name: "B Private" });
  if (!created.ok) throw new Error("fixture project failed");
  projectB = created.project.id;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("project list isolation", () => {
  it("lists only the acting tenant's projects", async () => {
    const listA = await service.listProjects(tenantA);
    const listB = await service.listProjects(tenantB);

    expect(listA.map((p) => p.name)).toEqual(["A Blog"]);
    expect(listB.map((p) => p.name)).toEqual(["B Private"]);
  });

  it("gives a new tenant an empty list, driving the empty state", async () => {
    const { registerTenant } = await import("@/lib/tenants/register");
    const fresh = await registerTenant({
      email: "fresh@example.com",
      password: "password three",
    });
    if (!fresh.ok) throw new Error("fixture registration failed");

    await expect(service.listProjects(fresh.tenantId)).resolves.toEqual([]);
  });
});

describe("project lookup by url-supplied id", () => {
  it("denies another tenant's project id", async () => {
    // The /dashboard/[projectId] route calls exactly this and notFound()s on
    // undefined — so id substitution is indistinguishable from a typo.
    await expect(service.findProject(tenantA, projectB)).resolves.toBeUndefined();
  });

  it("returns the project for its owner", async () => {
    const project = await service.findProject(tenantB, projectB);
    expect(project?.name).toBe("B Private");
  });

  it("returns undefined for an id that does not exist at all", async () => {
    await expect(
      service.findProject(tenantA, "nonexistent-id"),
    ).resolves.toBeUndefined();
  });
});

describe("project creation", () => {
  it("assigns the created project to the acting tenant", async () => {
    const result = await service.createProject(tenantA, { name: "Second" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await expect(
      service.findProject(tenantB, result.project.id),
    ).resolves.toBeUndefined();
    await expect(
      service.findProject(tenantA, result.project.id),
    ).resolves.toBeDefined();
  });

  it("rejects an empty name", async () => {
    const result = await service.createProject(tenantA, { name: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.name).toBeDefined();
  });

  it("slugifies the name", async () => {
    const result = await service.createProject(tenantA, {
      name: "My Personal Blog!",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slug).toBe("my-personal-blog");
  });

  it("disambiguates a slug collision within the tenant", async () => {
    const first = await service.createProject(tenantA, { name: "Repeat" });
    const second = await service.createProject(tenantA, { name: "Repeat" });
    const third = await service.createProject(tenantA, { name: "repeat" });

    if (!first.ok || !second.ok || !third.ok) throw new Error("creation failed");

    expect(first.project.slug).toBe("repeat");
    expect(second.project.slug).toBe("repeat-2");
    expect(third.project.slug).toBe("repeat-3");
  });

  it("lets a different tenant reuse the same slug", async () => {
    const result = await service.createProject(tenantB, { name: "Repeat" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Slugs are unique per tenant, not globally.
    expect(result.project.slug).toBe("repeat");
  });
});
