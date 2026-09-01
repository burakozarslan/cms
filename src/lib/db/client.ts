import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

import type { DB } from "./types";
import { TenantScopePlugin } from "./tenant-scope-plugin";

export function databasePath(): string {
  const configured = process.env.DATABASE_PATH ?? "data/cms.db";
  // The location is deliberately runtime-configurable, so the bundler cannot
  // statically scope it; opt out of file tracing rather than have it pull the
  // whole project into the server bundle.
  return isAbsolute(configured)
    ? configured
    : join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

export function createDb(path: string = databasePath()): Kysely<DB> {
  mkdirSync(dirname(path), { recursive: true });

  const database = new SQLite(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return new Kysely<DB>({ dialect: new SqliteDialect({ database }) });
}

let rootDb: Kysely<DB> | undefined;

/**
 * The UNSCOPED database handle.
 *
 * Reserved for migrations and identity flows that run before a tenant context
 * exists (registration, credential lookup at login). Route handlers, server
 * actions, and pages MUST use `getTenantDb()` for tenant-owned data — see
 * `TENANT_SCOPED_TABLES`.
 */
export function getRootDb(): Kysely<DB> {
  rootDb ??= createDb();
  return rootDb;
}

/**
 * A database handle bound to one tenant.
 *
 * Every query against a tenant-scoped table is automatically filtered to
 * `tenantId`, so a lookup by a URL-supplied id cannot return another tenant's
 * row — the ownership check and the existence check are the same query.
 *
 * `tenantId` must come from the session, never from request input.
 */
export function getTenantDb(tenantId: string): Kysely<DB> {
  return getRootDb().withPlugin(new TenantScopePlugin(tenantId));
}
