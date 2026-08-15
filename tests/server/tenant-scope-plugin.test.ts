/**
 * @jest-environment node
 */
import { setupTempDatabase, migrateTestDatabase, destroyTestDatabase } from "../helpers/test-db";

const { cleanup } = setupTempDatabase();

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

let getRootDb: typeof import("@/lib/db/client").getRootDb;
let getTenantDb: typeof import("@/lib/db/client").getTenantDb;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ getRootDb, getTenantDb } = await import("@/lib/db/client"));

  await getRootDb()
    .insertInto("tenants")
    .values([
      { id: TENANT_A, name: "Tenant A" },
      { id: TENANT_B, name: "Tenant B" },
    ])
    .execute();

  // Seeded through the root handle so each tenant genuinely owns its own rows.
  await getRootDb()
    .insertInto("projects")
    .values([
      { id: "a-blog", tenant_id: TENANT_A, name: "A Blog", slug: "a-blog" },
      { id: "a-shop", tenant_id: TENANT_A, name: "A Shop", slug: "a-shop" },
      { id: "b-secret", tenant_id: TENANT_B, name: "B Secret", slug: "b-secret" },
    ])
    .execute();
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("select scoping", () => {
  it("returns only the acting tenant's rows", async () => {
    const rows = await getTenantDb(TENANT_A)
      .selectFrom("projects")
      .select(["id"])
      .execute();

    expect(rows.map((r) => r.id).sort()).toEqual(["a-blog", "a-shop"]);
  });

  it("returns nothing when looking up another tenant's row by id", async () => {
    const row = await getTenantDb(TENANT_A)
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", "b-secret")
      .executeTakeFirst();

    expect(row).toBeUndefined();
  });

  it("keeps the caller's own predicates intact", async () => {
    const row = await getTenantDb(TENANT_A)
      .selectFrom("projects")
      .selectAll()
      .where("slug", "=", "a-shop")
      .executeTakeFirst();

    expect(row?.id).toBe("a-shop");
  });

  it("scopes aliased tables", async () => {
    const rows = await getTenantDb(TENANT_A)
      .selectFrom("projects as p")
      .select(["p.id"])
      .execute();

    expect(rows.map((r) => r.id).sort()).toEqual(["a-blog", "a-shop"]);
  });

  it("scopes subqueries", async () => {
    const rows = await getTenantDb(TENANT_A)
      .selectFrom("projects")
      .select(["id"])
      .where(
        "slug",
        "in",
        getTenantDb(TENANT_A).selectFrom("projects").select("slug"),
      )
      .execute();

    expect(rows.map((r) => r.id).sort()).toEqual(["a-blog", "a-shop"]);
  });

  it("does not scope tables that are not tenant-owned", async () => {
    const rows = await getTenantDb(TENANT_A).selectFrom("tenants").select("id").execute();

    expect(rows.map((r) => r.id).sort()).toEqual([TENANT_A, TENANT_B]);
  });
});

describe("insert scoping", () => {
  it("stamps the acting tenant onto inserted rows", async () => {
    await getTenantDb(TENANT_A)
      .insertInto("projects")
      .values({ id: "a-new", name: "A New", slug: "a-new" })
      .execute();

    const row = await getRootDb()
      .selectFrom("projects")
      .select("tenant_id")
      .where("id", "=", "a-new")
      .executeTakeFirstOrThrow();

    expect(row.tenant_id).toBe(TENANT_A);
  });

  it("overrides a caller-supplied tenant_id", async () => {
    await getTenantDb(TENANT_A)
      .insertInto("projects")
      .values({
        id: "a-forged",
        name: "Forged",
        slug: "a-forged",
        tenant_id: TENANT_B,
      })
      .execute();

    const row = await getRootDb()
      .selectFrom("projects")
      .select("tenant_id")
      .where("id", "=", "a-forged")
      .executeTakeFirstOrThrow();

    expect(row.tenant_id).toBe(TENANT_A);
  });

  it("stamps every row of a multi-row insert", async () => {
    await getTenantDb(TENANT_A)
      .insertInto("projects")
      .values([
        { id: "a-multi-1", name: "M1", slug: "a-multi-1" },
        { id: "a-multi-2", name: "M2", slug: "a-multi-2" },
      ])
      .execute();

    const rows = await getRootDb()
      .selectFrom("projects")
      .select("tenant_id")
      .where("id", "in", ["a-multi-1", "a-multi-2"])
      .execute();

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });
});

describe("update and delete scoping", () => {
  it("cannot update another tenant's row", async () => {
    const result = await getTenantDb(TENANT_A)
      .updateTable("projects")
      .set({ name: "Hijacked" })
      .where("id", "=", "b-secret")
      .executeTakeFirst();

    expect(Number(result.numUpdatedRows)).toBe(0);

    const row = await getRootDb()
      .selectFrom("projects")
      .select("name")
      .where("id", "=", "b-secret")
      .executeTakeFirstOrThrow();

    expect(row.name).toBe("B Secret");
  });

  it("cannot delete another tenant's row", async () => {
    const result = await getTenantDb(TENANT_A)
      .deleteFrom("projects")
      .where("id", "=", "b-secret")
      .executeTakeFirst();

    expect(Number(result.numDeletedRows)).toBe(0);

    const row = await getRootDb()
      .selectFrom("projects")
      .select("id")
      .where("id", "=", "b-secret")
      .executeTakeFirst();

    expect(row?.id).toBe("b-secret");
  });

  it("still updates the acting tenant's own row", async () => {
    const result = await getTenantDb(TENANT_A)
      .updateTable("projects")
      .set({ name: "Renamed" })
      .where("id", "=", "a-blog")
      .executeTakeFirst();

    expect(Number(result.numUpdatedRows)).toBe(1);
  });
});

describe("plugin construction", () => {
  it("refuses an empty tenant id", () => {
    expect(() => getTenantDb("")).toThrow(/requires a tenantId/i);
  });
});
