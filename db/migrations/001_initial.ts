import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tenants")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("password_hash", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("users_email_unique")
    .on("users")
    .column("email")
    .unique()
    .execute();

  await db.schema
    .createTable("projects")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("projects_tenant_id_idx")
    .on("projects")
    .column("tenant_id")
    .execute();

  // Slugs identify a project within its tenant, so uniqueness is per tenant and
  // enforced by the database — an application-level check alone would race.
  await db.schema
    .createIndex("projects_tenant_slug_unique")
    .on("projects")
    .columns(["tenant_id", "slug"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("projects").execute();
  await db.schema.dropTable("users").execute();
  await db.schema.dropTable("tenants").execute();
}
