import { Kysely, sql } from "kysely";

/**
 * `api_keys`: a project-scoped credential that authenticates the content
 * delivery API. It is both tenant-owned content (managed from the dashboard)
 * and a credential lookup (resolved before a tenant context exists) — see
 * `src/lib/api-keys/resolve.ts` and `src/lib/db/tables.ts`.
 *
 * Also adds the composite index the delivery API's hottest query needs:
 * `entries (collection_id, status)`. Only `collection_id` is indexed today.
 *
 * Purely additive — no existing row is read or written, so this is safe to
 * deploy against a live database.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("api_keys")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    // The token's indexed lookup segment. Stored plain — it is not secret,
    // only the secret segment is (see design decision 2/3).
    .addColumn("key_id", "text", (col) => col.notNull())
    .addColumn("secret_hash", "text", (col) => col.notNull())
    .addColumn("mode", "text", (col) => col.notNull().defaultTo("live"))
    .addColumn("created_by_user_id", "text", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("last_used_at", "text")
    .addColumn("revoked_at", "text")
    // Nullable, no creation-UI affordance yet — see design.md's Resolved
    // Questions. Present now so resolve.ts's expiry check has something to
    // check from day one.
    .addColumn("expires_at", "text")
    .execute();

  await db.schema
    .createIndex("api_keys_key_id_unique")
    .on("api_keys")
    .column("key_id")
    .unique()
    .execute();

  await db.schema
    .createIndex("api_keys_project_id_idx")
    .on("api_keys")
    .column("project_id")
    .execute();

  // The content API's hottest predicate: WHERE collection_id = ? AND status =
  // 'published'.
  await db.schema
    .createIndex("entries_collection_status_idx")
    .on("entries")
    .columns(["collection_id", "status"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("entries_collection_status_idx").execute();
  await db.schema.dropIndex("api_keys_project_id_idx").execute();
  await db.schema.dropIndex("api_keys_key_id_unique").execute();
  await db.schema.dropTable("api_keys").execute();
}
