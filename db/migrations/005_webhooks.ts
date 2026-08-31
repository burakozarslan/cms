import { Kysely, sql } from "kysely";

/**
 * `webhooks`: project-scoped subscriptions that notify an external target
 * URL (e.g. a static-site host's build hook) when content changes.
 *
 * `webhook_deliveries` doubles as both the delivery log shown in the
 * dashboard and the delivery queue the worker polls (`status = 'pending'
 * AND next_attempt_at <= now`) — see design.md, "Delivery worker".
 *
 * Purely additive — no existing row is read or written, so this is safe to
 * deploy against a live database.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("webhooks")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("target_url", "text", (col) => col.notNull())
    // JSON array of subscribed event type strings.
    .addColumn("events", "text", (col) => col.notNull())
    // `encrypt()`-produced `<iv>:<tag>:<ciphertext>` — never the plaintext.
    .addColumn("secret_enc", "text", (col) => col.notNull())
    // The masked form shown in the list after creation, e.g. `whsec_ab12…`.
    .addColumn("secret_prefix", "text", (col) => col.notNull())
    // SQLite has no boolean: 0 or 1.
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_by_user_id", "text", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("webhooks_project_id_idx")
    .on("webhooks")
    .column("project_id")
    .execute();

  await db.schema
    .createTable("webhook_deliveries")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("webhook_id", "text", (col) =>
      col.notNull().references("webhooks.id").onDelete("cascade"),
    )
    .addColumn("delivery_uuid", "text", (col) => col.notNull())
    .addColumn("event_type", "text", (col) => col.notNull())
    // The exact JSON body sent (or to be sent) — kept for signing on retry
    // and for manual redelivery.
    .addColumn("payload", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("attempt_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("next_attempt_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("last_status_code", "integer")
    .addColumn("last_error", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // The worker's hottest predicate: WHERE status = 'pending' AND
  // next_attempt_at <= ?.
  await db.schema
    .createIndex("webhook_deliveries_pending_idx")
    .on("webhook_deliveries")
    .columns(["status", "next_attempt_at"])
    .execute();

  // The delivery log's listing query: one webhook, most recent first.
  await db.schema
    .createIndex("webhook_deliveries_webhook_created_idx")
    .on("webhook_deliveries")
    .columns(["webhook_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("webhook_deliveries_webhook_created_idx").execute();
  await db.schema.dropIndex("webhook_deliveries_pending_idx").execute();
  await db.schema.dropTable("webhook_deliveries").execute();
  await db.schema.dropIndex("webhooks_project_id_idx").execute();
  await db.schema.dropTable("webhooks").execute();
}
