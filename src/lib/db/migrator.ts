import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";

import type { DB } from "./types";

export const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

export function createMigrator(db: Kysely<DB>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: MIGRATIONS_DIR,
    }),
  });
}
