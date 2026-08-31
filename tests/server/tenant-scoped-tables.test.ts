/**
 * @jest-environment node
 *
 * The standing invariant: a tenant-owned table missing from
 * `TENANT_SCOPED_TABLES` is queried unscoped, which silently breaks isolation.
 * A test is the only thing that catches a migration that forgot the list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

/**
 * The `getRootDb()` carve-out does not spread (design decision 4 /
 * `tenant-data-access` → "The carve-out does not spread"). Every module that
 * imports it must be either the module that defines it, an identity flow that
 * predates a tenant context (registration, login, password change — all of
 * which touch only the `users`/`tenants` identity tables), or the single
 * `api_keys` credential-resolution module.
 */
describe("getRootDb() importers", () => {
  const SRC_ROOT = join(__dirname, "..", "..", "src");

  const ALLOWED_IMPORTERS = new Set([
    "lib/db/client.ts", // defines getRootDb
    "lib/auth/authorize.ts", // login: reads `users` before a tenant context exists
    "lib/auth/change-password.ts", // reads `users` by session-provided id
    "lib/tenants/register.ts", // registration: no tenant context yet
    "lib/api-keys/resolve.ts", // the one credential-resolution carve-out
  ]);

  const IMPORT_PATTERN =
    /import\s*(?:type\s*)?\{[^}]*\bgetRootDb\b[^}]*\}\s*from\s*["'][^"']*\/db\/client["']/;

  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) walk(full, files);
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(full);
    }
    return files;
  }

  it("is limited to the identity flows and the single resolve.ts carve-out", () => {
    const importers = walk(SRC_ROOT)
      .filter((file) => IMPORT_PATTERN.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC_ROOT, file));

    const unexpected = importers.filter((file) => !ALLOWED_IMPORTERS.has(file));
    expect(unexpected).toEqual([]);
  });

  it("guards the guard: the scan actually finds the known carve-outs", () => {
    const importers = walk(SRC_ROOT)
      .filter((file) => IMPORT_PATTERN.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC_ROOT, file));

    expect(importers).toEqual(
      expect.arrayContaining(["lib/api-keys/resolve.ts", "lib/auth/authorize.ts"]),
    );
  });
});
