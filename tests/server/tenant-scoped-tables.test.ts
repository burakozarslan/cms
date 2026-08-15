/**
 * @jest-environment node
 *
 * The standing invariant: a tenant-owned table missing from
 * `TENANT_SCOPED_TABLES` is queried unscoped, which silently breaks isolation.
 * A test is the only thing that catches a migration that forgot the list.
 */
import { sql } from "kysely";

import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

const { cleanup } = setupTempDatabase();

/**
 * Identity tables, deliberately unscoped: they are read before a tenant context
 * exists (registration, credential lookup at login).
 */
const IDENTITY_TABLES = new Set(["tenants", "users"]);

let tablesWithTenantColumn: string[];
let TENANT_SCOPED_TABLES: readonly string[];

beforeAll(async () => {
  await migrateTestDatabase();

  const { getRootDb } = await import("@/lib/db/client");
  ({ TENANT_SCOPED_TABLES } = await import("@/lib/db/tables"));

  const db = getRootDb();

  const tables = await sql<{ name: string }>`
    select name from sqlite_master where type = 'table'
  `.execute(db);

  const names = tables.rows
    .map((row) => row.name)
    .filter(
      (name) => !name.startsWith("sqlite_") && !name.startsWith("kysely_"),
    );

  // "Tenant-owned" is not a guess: it is exactly the set of tables carrying a
  // tenant_id column, read back from the schema the migrations actually built.
  const owned: string[] = [];
  for (const name of names) {
    const columns = await sql<{ name: string }>`
      select name from pragma_table_info(${name})
    `.execute(db);

    if (columns.rows.some((column) => column.name === "tenant_id")) {
      owned.push(name);
    }
  }

  tablesWithTenantColumn = owned;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("TENANT_SCOPED_TABLES", () => {
  it("finds the tables migration 002 added", () => {
    // Guards the guard: if this query stopped seeing tables, the assertion
    // below would pass vacuously.
    expect(tablesWithTenantColumn).toEqual(
      expect.arrayContaining([
        "collections",
        "fields",
        "entries",
        "entry_values",
      ]),
    );
  });

  it("registers every tenant-owned table except the identity tables", () => {
    const missing = tablesWithTenantColumn.filter(
      (name) =>
        !IDENTITY_TABLES.has(name) && !TENANT_SCOPED_TABLES.includes(name),
    );

    expect(missing).toEqual([]);
  });

  it("lists no table that does not exist or carries no tenant_id", () => {
    const spurious = TENANT_SCOPED_TABLES.filter(
      (name) => !tablesWithTenantColumn.includes(name),
    );

    expect(spurious).toEqual([]);
  });
});
