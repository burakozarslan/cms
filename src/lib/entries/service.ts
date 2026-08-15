import { randomUUID } from "node:crypto";

import { sql, type Transaction } from "kysely";
import { z } from "zod";

import {
  ENTRY_TITLE_PLACEHOLDER,
  findCollectionById,
  listFields,
  resolveTitleField,
  type Collection,
  type FieldErrors,
  type Failure,
  type MutationResult,
} from "@/lib/collections/service";
import { getTenantDb } from "@/lib/db/client";
import type { DB } from "@/lib/db/types";
import { nextAvailableSlug, slugify } from "@/lib/projects/slug";
import {
  getEntrySchema,
  isEmptyValue,
  validateEntryValues,
  type FieldParseResult,
  type ParsedField,
} from "@/lib/widgets";

export const ENTRY_STATUSES = ["draft", "published"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export const entryStatusSchema = z.enum(ENTRY_STATUSES);

export type EntryListItem = {
  id: string;
  slug: string;
  status: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type Entry = {
  id: string;
  collection_id: string;
  slug: string;
  status: string;
  created_at: string;
  updated_at: string;
  /** Decoded values keyed by `field_id`. */
  values: Record<string, unknown>;
};

export type SaveEntryResult = { ok: true; entry: Entry } | Failure;

const NOT_FOUND: Failure = { ok: false, error: "NOT_FOUND" };

function invalid(fieldErrors: FieldErrors): Failure {
  return { ok: false, error: "INVALID", fieldErrors };
}

/**
 * A stored value is JSON, but a row written by an older build (or by hand) may
 * not be. Treat unreadable as absent rather than throwing mid-render.
 */
function decodeValue(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The label shown for an entry: title value → slug → placeholder. */
function entryLabel(titleValue: unknown, slug: string): string {
  if (typeof titleValue === "string" && titleValue.trim() !== "") {
    return titleValue.trim();
  }
  if (typeof titleValue === "number" || typeof titleValue === "boolean") {
    return String(titleValue);
  }
  return slug || ENTRY_TITLE_PLACEHOLDER;
}

/**
 * List a collection's entries, labelled.
 *
 * The label lives in `entry_values`, not on `entries`, which makes this the
 * most likely N+1 in the system. It is resolved with a single LEFT JOIN pinned
 * to the collection's title field — so the query count is three (collection,
 * fields, entries) no matter how many entries come back (design decision 7).
 */
export async function listEntries(
  tenantId: string,
  collectionId: string,
): Promise<EntryListItem[]> {
  const collection = await findCollectionById(tenantId, collectionId);
  if (!collection) return [];

  const fields = await listFields(tenantId, collectionId);
  const titleField = resolveTitleField(collection, fields);

  const db = getTenantDb(tenantId);

  const base = db
    .selectFrom("entries")
    .where("entries.collection_id", "=", collectionId)
    .orderBy("entries.created_at", "desc");

  const rows = titleField
    ? await base
        .leftJoin("entry_values", (join) =>
          join
            .onRef("entry_values.entry_id", "=", "entries.id")
            .on("entry_values.field_id", "=", titleField.id),
        )
        .select([
          "entries.id",
          "entries.slug",
          "entries.status",
          "entries.created_at",
          "entries.updated_at",
          "entry_values.value as title_value",
        ])
        .execute()
    : (
        await base
          .select([
            "entries.id",
            "entries.slug",
            "entries.status",
            "entries.created_at",
            "entries.updated_at",
          ])
          .execute()
      ).map((row) => ({ ...row, title_value: null as string | null }));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    title: entryLabel(decodeValue(row.title_value), row.slug),
  }));
}

/**
 * One entry with its values pivoted by `field_id`.
 *
 * The `collection_id` predicate is the containment check: an entry the tenant
 * genuinely owns, addressed under the wrong collection's route, resolves to
 * nothing.
 */
export async function findEntry(
  tenantId: string,
  collectionId: string,
  entryId: string,
): Promise<Entry | undefined> {
  const db = getTenantDb(tenantId);

  const entry = await db
    .selectFrom("entries")
    .select([
      "id",
      "collection_id",
      "slug",
      "status",
      "created_at",
      "updated_at",
    ])
    .where("id", "=", entryId)
    .where("collection_id", "=", collectionId)
    .executeTakeFirst();

  if (!entry) return undefined;

  const valueRows = await db
    .selectFrom("entry_values")
    .select(["field_id", "value"])
    .where("entry_id", "=", entryId)
    .execute();

  const values: Record<string, unknown> = {};
  for (const row of valueRows) {
    const decoded = decodeValue(row.value);
    if (decoded !== undefined) values[row.field_id] = decoded;
  }

  return { ...entry, values };
}

/** The collection plus its current fields and derived validator. */
async function loadSchema(tenantId: string, collectionId: string) {
  const collection = await findCollectionById(tenantId, collectionId);
  if (!collection) return undefined;

  // Read fresh every time: a save must validate against the field definitions
  // in effect *now*, not the ones the editor rendered from.
  const fields = await listFields(tenantId, collectionId);
  const schema = getEntrySchema(
    collection.id,
    collection.schema_version,
    fields,
  );

  return { collection, fields, schema };
}

function slugSource(
  collection: Collection,
  fields: ReadonlyArray<FieldParseResult>,
  values: Record<string, unknown>,
): string {
  const titleField: ParsedField | undefined = resolveTitleField(
    collection,
    fields,
  );
  if (!titleField) return "";

  const raw = values[titleField.id];
  return typeof raw === "string" ? raw : "";
}

const createEntryInputSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  status: entryStatusSchema.default("draft"),
});

export async function createEntry(
  tenantId: string,
  collectionId: string,
  input: unknown,
): Promise<SaveEntryResult> {
  const parsedInput = createEntryInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return invalid({ status: ["Status must be draft or published."] });
  }

  const loaded = await loadSchema(tenantId, collectionId);
  if (!loaded) return NOT_FOUND;

  const { collection, fields, schema } = loaded;

  const validated = validateEntryValues(
    fields,
    parsedInput.data.values,
    schema,
  );
  if (!validated.ok) return invalid(validated.fieldErrors);

  const db = getTenantDb(tenantId);

  const taken = await db
    .selectFrom("entries")
    .select("slug")
    .where("collection_id", "=", collectionId)
    .execute();

  // Derived from the title value where there is one; otherwise a generated
  // fallback, so an entry with no usable title still gets a stable slug.
  const base = slugify(slugSource(collection, fields, validated.values));
  const slug = nextAvailableSlug(
    base || "entry",
    new Set(taken.map((row) => row.slug)),
  );

  const id = randomUUID();

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("entries")
      .values({
        id,
        collection_id: collectionId,
        slug,
        status: parsedInput.data.status,
      })
      .execute();

    await writeValues(trx, id, validated.values);
  });

  const entry = await findEntry(tenantId, collectionId, id);
  if (!entry) throw new Error("Entry vanished immediately after insert.");

  return { ok: true, entry };
}

/** Values are written as one row per (entry, field); empties write nothing. */
async function writeValues(
  trx: Transaction<DB>,
  entryId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const rows = Object.entries(values)
    .filter(([, value]) => !isEmptyValue(value))
    .map(([fieldId, value]) => ({
      id: randomUUID(),
      entry_id: entryId,
      field_id: fieldId,
      value: JSON.stringify(value),
    }));

  if (rows.length > 0) {
    await trx.insertInto("entry_values").values(rows).execute();
  }
}

const updateEntryInputSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Replace an entry's values.
 *
 * The editor submits the whole field set, so the entry's values become exactly
 * the validated set — which is also how an optional field gets cleared. Slug
 * is deliberately untouched: renaming a title does not silently re-slug an
 * entry that may already be linked to (design decision 8).
 */
export async function updateEntry(
  tenantId: string,
  collectionId: string,
  entryId: string,
  input: unknown,
): Promise<SaveEntryResult> {
  const parsedInput = updateEntryInputSchema.safeParse(input);
  if (!parsedInput.success) return invalid({ _: ["Malformed submission."] });

  const existing = await findEntry(tenantId, collectionId, entryId);
  if (!existing) return NOT_FOUND;

  const loaded = await loadSchema(tenantId, collectionId);
  if (!loaded) return NOT_FOUND;

  const validated = validateEntryValues(
    loaded.fields,
    parsedInput.data.values,
    loaded.schema,
  );
  if (!validated.ok) return invalid(validated.fieldErrors);

  const db = getTenantDb(tenantId);

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("entry_values").where("entry_id", "=", entryId).execute();
    await writeValues(trx, entryId, validated.values);

    await trx
      .updateTable("entries")
      .set({ updated_at: sql<string>`CURRENT_TIMESTAMP` })
      .where("id", "=", entryId)
      .where("collection_id", "=", collectionId)
      .execute();
  });

  const entry = await findEntry(tenantId, collectionId, entryId);
  if (!entry) throw new Error("Entry vanished immediately after update.");

  return { ok: true, entry };
}

/** Hard delete; `entry_values.entry_id` cascades, so no orphan survives. */
export async function deleteEntry(
  tenantId: string,
  collectionId: string,
  entryId: string,
): Promise<MutationResult> {
  const existing = await findEntry(tenantId, collectionId, entryId);
  if (!existing) return NOT_FOUND;

  await getTenantDb(tenantId)
    .deleteFrom("entries")
    .where("id", "=", entryId)
    .where("collection_id", "=", collectionId)
    .execute();

  return { ok: true };
}

export async function setEntryStatus(
  tenantId: string,
  collectionId: string,
  entryId: string,
  status: unknown,
): Promise<MutationResult> {
  const parsed = entryStatusSchema.safeParse(status);
  if (!parsed.success) {
    return invalid({ status: ["Status must be draft or published."] });
  }

  const existing = await findEntry(tenantId, collectionId, entryId);
  if (!existing) return NOT_FOUND;

  await getTenantDb(tenantId)
    .updateTable("entries")
    .set({ status: parsed.data, updated_at: sql<string>`CURRENT_TIMESTAMP` })
    .where("id", "=", entryId)
    .where("collection_id", "=", collectionId)
    .execute();

  return { ok: true };
}
