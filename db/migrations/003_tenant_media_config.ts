import { Kysely, sql } from "kysely";

/**
 * One Cloudinary configuration per tenant. `tenant_id` is the primary key,
 * not a surrogate id, so "at most one config per tenant" is enforced by the
 * schema rather than application logic.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tenant_media_config")
    .addColumn("tenant_id", "text", (col) =>
      col.primaryKey().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("cloud_name", "text", (col) => col.notNull())
    .addColumn("api_key", "text", (col) => col.notNull())
    .addColumn("api_secret_enc", "text", (col) => col.notNull())
    .addColumn("last_checked_at", "text")
    .addColumn("last_check_ok", "integer")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tenant_media_config").execute();
}
