import { createDb, databasePath } from "../src/lib/db/client";
import { createMigrator } from "../src/lib/db/migrator";

async function main() {
  const direction = process.argv[2] ?? "up";
  const db = createDb();
  const migrator = createMigrator(db);

  const { error, results } =
    direction === "down"
      ? await migrator.migrateDown()
      : await migrator.migrateToLatest();

  for (const result of results ?? []) {
    const label = `${result.direction} ${result.migrationName}`;
    if (result.status === "Success") {
      console.log(`✓ ${label}`);
    } else if (result.status === "Error") {
      console.error(`✗ ${label}`);
    }
  }

  if (error) {
    console.error("Migration failed:", error);
    await db.destroy();
    process.exit(1);
  }

  if ((results ?? []).length === 0) {
    console.log("No migrations to run.");
  }

  console.log(`Database: ${databasePath()}`);
  await db.destroy();
}

main();
