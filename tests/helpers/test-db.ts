import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Point the app at a throwaway SQLite file and run migrations against it.
 *
 * This drives the real `getRootDb()` / `getTenantDb()` code path rather than a
 * test-only handle, so the isolation guarantees under test are the ones the app
 * actually uses. Call before importing any module that touches the database.
 */
export function setupTempDatabase(): { cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "cms-test-"));
  process.env.DATABASE_PATH = join(dir, "test.db");

  return {
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export async function migrateTestDatabase(): Promise<void> {
  const { getRootDb } = await import("@/lib/db/client");
  const { createMigrator } = await import("@/lib/db/migrator");

  const { error } = await createMigrator(getRootDb()).migrateToLatest();
  if (error) throw error;
}

export async function destroyTestDatabase(): Promise<void> {
  const { getRootDb } = await import("@/lib/db/client");
  await getRootDb().destroy();
}

export function tempDatabaseDir(): string {
  return dirname(process.env.DATABASE_PATH!);
}
