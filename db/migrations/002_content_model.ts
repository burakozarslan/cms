import { Kysely, sql } from "kysely";

/**
 * The content model: collections own ordered field definitions (schema), and
 * entries own one value row per field (content).
 *
 * Purely additive — no existing table is altered and no existing row is read or
 * written, so this is safe to deploy against a live database.
 *
 * `collections.title_field_id` and `fields.collection_id` reference each other,
 * so the two CREATE TABLEs cannot both come after their target. SQLite resolves
 * foreign key targets at DML time rather than at CREATE TABLE time, so
 * `collections` may name `fields` before `fields` exists — the constraint starts
 * being enforced as soon as the second table lands. Verified by 1.6's up/down/up
 * run and by the migration test.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("collections")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull())
    // Deleting the designated title field must not delete the collection, so
    // the designation clears and the entry list falls back (design decision 7).
    .addColumn("title_field_id", "text", (col) =>
      col.references("fields.id").onDelete("set null"),
    )
    // Bumped by every field create/update/reorder/delete; the derived-schema
    // cache is keyed on it, which makes invalidation a miss rather than an
    // eviction (design decision 6).
    .addColumn("schema_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("collections_project_id_idx")
    .on("collections")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("collections_project_slug_unique")
    .on("collections")
    .columns(["project_id", "slug"])
    .unique()
    .execute();

  await db.schema
    .createTable("fields")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("collection_id", "text", (col) =>
      col.notNull().references("collections.id").onDelete("cascade"),
    )
    .addColumn("key", "text", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    // Deliberately no CHECK constraint: SQLite cannot alter one without
    // rebuilding the table, which would turn "add a widget type" into a
    // migration. The permitted set is enforced by the Zod registry on every
    // write and parsed again on read (design decision 3).
    .addColumn("widget", "text", (col) => col.notNull())
    .addColumn("required", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("config", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("fields_collection_id_idx")
    .on("fields")
    .column("collection_id")
    .execute();

  await db.schema
    .createIndex("fields_collection_key_unique")
    .on("fields")
    .columns(["collection_id", "key"])
    .unique()
    .execute();

  await db.schema
    .createTable("entries")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("collection_id", "text", (col) =>
      col.notNull().references("collections.id").onDelete("cascade"),
    )
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("draft"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("entries_collection_id_idx")
    .on("entries")
    .column("collection_id")
    .execute();

  await db.schema
    .createIndex("entries_collection_slug_unique")
    .on("entries")
    .columns(["collection_id", "slug"])
    .unique()
    .execute();

  await db.schema
    .createTable("entry_values")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("entry_id", "text", (col) =>
      col.notNull().references("entries.id").onDelete("cascade"),
    )
    // Hard-deleting a field deletes its values for free — the required
    // behaviour, with no application bookkeeping (design decision 4).
    .addColumn("field_id", "text", (col) =>
      col.notNull().references("fields.id").onDelete("cascade"),
    )
    .addColumn("value", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("entry_values_entry_field_unique")
    .on("entry_values")
    .columns(["entry_id", "field_id"])
    .unique()
    .execute();

  // Keeps the field-delete cascade and the entry-list title join cheap.
  await db.schema
    .createIndex("entry_values_field_id_idx")
    .on("entry_values")
    .column("field_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse FK order. `collections` last, because `fields` references it and
  // it references `fields` back.
  await db.schema.dropTable("entry_values").execute();
  await db.schema.dropTable("entries").execute();
  await db.schema.dropTable("fields").execute();
  await db.schema.dropTable("collections").execute();
}
