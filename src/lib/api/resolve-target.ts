import { getTenantDb } from "@/lib/db/client";
import type { Collection } from "@/lib/collections/service";
import type { Entry } from "@/lib/entries/service";

import type { Direction, OrderColumn } from "./query";

const COLLECTION_COLUMNS = [
  "id",
  "project_id",
  "name",
  "slug",
  "title_field_id",
  "schema_version",
  "created_at",
] as const;

/**
 * Resolve a `:collection` URL segment within the key's project — slug first,
 * then id (design decision 14). `project_id` is always the explicit
 * predicate: containment, not just tenant ownership, is what makes a
 * same-tenant, wrong-project collection resolve to nothing.
 */
export async function resolveCollection(
  tenantId: string,
  projectId: string,
  segment: string,
): Promise<Collection | undefined> {
  const db = getTenantDb(tenantId);

  const base = db
    .selectFrom("collections")
    .select(COLLECTION_COLUMNS)
    .where("project_id", "=", projectId);

  return (
    (await base.where("slug", "=", segment).executeTakeFirst()) ??
    (await base.where("id", "=", segment).executeTakeFirst())
  );
}

/**
 * Resolve a `:item` URL segment within a collection — slug first, then id,
 * and always `status = 'published'` (draft is 404, indistinguishable from
 * nonexistent). Mirrors `findEntry`'s value-pivoting, since the delivery API
 * addresses entries the dashboard never does (by slug, filtered to published).
 */
export async function resolveEntry(
  tenantId: string,
  collectionId: string,
  segment: string,
): Promise<Entry | undefined> {
  const db = getTenantDb(tenantId);

  const base = db
    .selectFrom("entries")
    .select(["id", "collection_id", "slug", "status", "created_at", "updated_at"])
    .where("collection_id", "=", collectionId)
    .where("status", "=", "published");

  const entry =
    (await base.where("slug", "=", segment).executeTakeFirst()) ??
    (await base.where("id", "=", segment).executeTakeFirst());

  if (!entry) return undefined;

  const valueRows = await db
    .selectFrom("entry_values")
    .select(["field_id", "value"])
    .where("entry_id", "=", entry.id)
    .execute();

  const values: Record<string, unknown> = {};
  for (const row of valueRows) {
    try {
      values[row.field_id] = JSON.parse(row.value);
    } catch {
      // A row written by an older build (or by hand) that isn't valid JSON is
      // treated as absent, same as `findEntry`.
    }
  }

  return { ...entry, values };
}

/** Published-entry count for the collection schema endpoint — deliberately
 *  separate from `countEntriesByCollection`, which counts every status for
 *  the dashboard's delete-confirmation warning. */
export async function countPublishedEntries(
  tenantId: string,
  collectionId: string,
): Promise<number> {
  const row = await getTenantDb(tenantId)
    .selectFrom("entries")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("collection_id", "=", collectionId)
    .where("status", "=", "published")
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

export type ListPublishedEntriesOptions = {
  order: OrderColumn;
  direction: Direction;
  limit: number;
  offset: number;
};

/**
 * Published entries in one collection, addressed by id, values attached.
 *
 * The relationship-batching counterpart to `resolveEntry`: instead of one
 * slug-or-id lookup, this resolves many ids from the same target collection
 * in a single pair of queries (entries, then their values), the same shape
 * `resolveReferences` already batches for REST. Used by the GraphQL relation
 * loader, which needs full field values for nested selections rather than
 * just the `{ id, slug, collection }` reference REST returns.
 */
export async function findEntriesByIds(
  tenantId: string,
  collectionId: string,
  ids: ReadonlyArray<string>,
): Promise<Entry[]> {
  if (ids.length === 0) return [];

  const db = getTenantDb(tenantId);

  const rows = await db
    .selectFrom("entries")
    .select(["id", "collection_id", "slug", "status", "created_at", "updated_at"])
    .where("collection_id", "=", collectionId)
    .where("status", "=", "published")
    .where("id", "in", ids)
    .execute();

  if (rows.length === 0) return [];

  const valueRows = await db
    .selectFrom("entry_values")
    .select(["entry_id", "field_id", "value"])
    .where(
      "entry_id",
      "in",
      rows.map((row) => row.id),
    )
    .execute();

  const valuesByEntry = new Map<string, Record<string, unknown>>();
  for (const row of valueRows) {
    const values = valuesByEntry.get(row.entry_id) ?? {};
    try {
      values[row.field_id] = JSON.parse(row.value);
    } catch {
      // Treated as absent, same as `findEntry`/`listPublishedEntries`.
    }
    valuesByEntry.set(row.entry_id, values);
  }

  return rows.map((row) => ({ ...row, values: valuesByEntry.get(row.id) ?? {} }));
}

/**
 * A page of a collection's published entries, values attached, plus the
 * total published count.
 *
 * Ordered by `(order, id)`, never `order` alone: `created_at`/`updated_at`
 * default to `CURRENT_TIMESTAMP`, which in SQLite has second granularity, so
 * a single-column order is not total — an offset-paginated walk could show
 * one row twice and never show another (design decision 12).
 */
export async function listPublishedEntries(
  tenantId: string,
  collectionId: string,
  options: ListPublishedEntriesOptions,
): Promise<{ entries: Entry[]; total: number }> {
  const db = getTenantDb(tenantId);

  const totalRow = await db
    .selectFrom("entries")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("collection_id", "=", collectionId)
    .where("status", "=", "published")
    .executeTakeFirst();
  const total = Number(totalRow?.count ?? 0);

  const rows = await db
    .selectFrom("entries")
    .select(["id", "collection_id", "slug", "status", "created_at", "updated_at"])
    .where("collection_id", "=", collectionId)
    .where("status", "=", "published")
    .orderBy(options.order, options.direction)
    .orderBy("id", options.direction)
    .limit(options.limit)
    .offset(options.offset)
    .execute();

  if (rows.length === 0) return { entries: [], total };

  const valueRows = await db
    .selectFrom("entry_values")
    .select(["entry_id", "field_id", "value"])
    .where(
      "entry_id",
      "in",
      rows.map((row) => row.id),
    )
    .execute();

  const valuesByEntry = new Map<string, Record<string, unknown>>();
  for (const row of valueRows) {
    const values = valuesByEntry.get(row.entry_id) ?? {};
    try {
      values[row.field_id] = JSON.parse(row.value);
    } catch {
      // Treated as absent, same as `findEntry`/`resolveEntry`.
    }
    valuesByEntry.set(row.entry_id, values);
  }

  const entries = rows.map((row) => ({
    ...row,
    values: valuesByEntry.get(row.id) ?? {},
  }));

  return { entries, total };
}
