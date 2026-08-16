import { randomUUID } from "node:crypto";

import { sql, type Transaction } from "kysely";
import { z } from "zod";

import { getTenantDb } from "@/lib/db/client";
import type { DB } from "@/lib/db/types";
import { findProject } from "@/lib/projects/service";
import { nextAvailableSlug, slugify } from "@/lib/projects/slug";
import {
  fieldWidgetSchema,
  parseFieldConfig,
  relationshipConfigSchema,
  widgetTypeSchema,
  type FieldParseResult,
  type ParsedField,
  type WidgetType,
} from "@/lib/widgets";

export type Collection = {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  title_field_id: string | null;
  schema_version: number;
  created_at: string;
};

const COLLECTION_COLUMNS = [
  "id",
  "project_id",
  "name",
  "slug",
  "title_field_id",
  "schema_version",
  "created_at",
] as const;

const FIELD_COLUMNS = [
  "id",
  "collection_id",
  "key",
  "label",
  "widget",
  "required",
  "position",
  "config",
] as const;

export const collectionNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a collection name.")
    .max(80, "Collection names are limited to 80 characters."),
});

/**
 * A machine key: lowercase, starts with a letter, and safe to use as an object
 * key in an API payload without quoting or escaping.
 */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const fieldKeySchema = z
  .string()
  .trim()
  .min(1, "Enter a field key.")
  .max(64, "Field keys are limited to 64 characters.")
  .regex(
    FIELD_KEY_PATTERN,
    "Use lowercase letters, digits, and underscores, starting with a letter.",
  );

const fieldBaseSchema = z.object({
  key: fieldKeySchema,
  label: z
    .string()
    .trim()
    .min(1, "Enter a field label.")
    .max(120, "Field labels are limited to 120 characters."),
  required: z.boolean().default(false),
});

export type FieldErrors = Record<string, string[]>;

export type Failure =
  | { ok: false; error: "INVALID"; fieldErrors: FieldErrors }
  | { ok: false; error: "NOT_FOUND" };

export type CreateCollectionResult =
  | { ok: true; collection: Collection }
  | Failure;

export type FieldResult = { ok: true; field: FieldParseResult } | Failure;

export type MutationResult = { ok: true } | Failure;

function invalid(fieldErrors: FieldErrors): Failure {
  return { ok: false, error: "INVALID", fieldErrors };
}

const NOT_FOUND: Failure = { ok: false, error: "NOT_FOUND" };

function flatten(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

/** SQLite reports a violated unique index; the message names the columns. */
function isUniqueViolation(error: unknown, column: string): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed/i.test(error.message) &&
    error.message.includes(column)
  );
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Collections in one project.
 *
 * `projectId` is URL-supplied and untrusted, but the handle is tenant-scoped,
 * so another tenant's project id matches nothing. The explicit `project_id`
 * predicate is the containment half of the check.
 */
export function listCollections(
  tenantId: string,
  projectId: string,
): Promise<Collection[]> {
  return getTenantDb(tenantId)
    .selectFrom("collections")
    .select(COLLECTION_COLUMNS)
    .where("project_id", "=", projectId)
    .orderBy("created_at", "asc")
    .execute();
}

/**
 * One collection, addressed under a project.
 *
 * Containment is verified rather than assumed: tenant scoping alone would let a
 * tenant address their *own* collection under the wrong project's route.
 */
export function findCollection(
  tenantId: string,
  projectId: string,
  collectionId: string,
): Promise<Collection | undefined> {
  return getTenantDb(tenantId)
    .selectFrom("collections")
    .select(COLLECTION_COLUMNS)
    .where("id", "=", collectionId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();
}

/** Used by the entry layer, which addresses a collection without a project. */
export function findCollectionById(
  tenantId: string,
  collectionId: string,
): Promise<Collection | undefined> {
  return getTenantDb(tenantId)
    .selectFrom("collections")
    .select(COLLECTION_COLUMNS)
    .where("id", "=", collectionId)
    .executeTakeFirst();
}

export async function createCollection(
  tenantId: string,
  projectId: string,
  input: unknown,
): Promise<CreateCollectionResult> {
  const parsed = collectionNameSchema.safeParse(input);
  if (!parsed.success) return invalid(flatten(parsed.error));

  // The collection must land in a project this tenant owns; a foreign project
  // id resolves to nothing on the scoped handle.
  const project = await findProject(tenantId, projectId);
  if (!project) return NOT_FOUND;

  const db = getTenantDb(tenantId);
  const { name } = parsed.data;

  const taken = await db
    .selectFrom("collections")
    .select("slug")
    .where("project_id", "=", projectId)
    .execute();

  const slug = nextAvailableSlug(
    slugify(name) || "collection",
    new Set(taken.map((row) => row.slug)),
  );

  const id = randomUUID();

  // tenant_id is injected by the tenant-scoped handle.
  await db
    .insertInto("collections")
    .values({ id, project_id: projectId, name, slug, title_field_id: null })
    .execute();

  const collection = await findCollection(tenantId, projectId, id);
  if (!collection) {
    throw new Error("Collection vanished immediately after insert.");
  }

  return { ok: true, collection };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/**
 * A collection's fields in display order, each validated against its widget
 * type on the way out.
 *
 * Misconfigured rows come back as `ok: false` rather than throwing, so one bad
 * row cannot take down the whole collection.
 */
export async function listFields(
  tenantId: string,
  collectionId: string,
): Promise<FieldParseResult[]> {
  const rows = await getTenantDb(tenantId)
    .selectFrom("fields")
    .select(FIELD_COLUMNS)
    .where("collection_id", "=", collectionId)
    .orderBy("position", "asc")
    .orderBy("created_at", "asc")
    .execute();

  return rows.map(parseFieldConfig);
}

export async function findField(
  tenantId: string,
  collectionId: string,
  fieldId: string,
): Promise<FieldParseResult | undefined> {
  const row = await getTenantDb(tenantId)
    .selectFrom("fields")
    .select(FIELD_COLUMNS)
    .where("id", "=", fieldId)
    .where("collection_id", "=", collectionId)
    .executeTakeFirst();

  return row ? parseFieldConfig(row) : undefined;
}

/** Bumping the version is what invalidates the derived-schema cache. */
function bumpSchemaVersion(trx: Transaction<DB>, collectionId: string) {
  return trx
    .updateTable("collections")
    .set({ schema_version: sql<number>`schema_version + 1` })
    .where("id", "=", collectionId)
    .execute();
}

/**
 * A `relationship` field's target must be a collection that exists, belongs to
 * the same project as the field's own collection, and is not the collection
 * itself. None of that is expressible in `relationshipConfigSchema` alone — it
 * needs a database read — so it runs here, once per field create/update,
 * rather than in the widget's own (synchronous) config schema.
 */
async function validateRelationshipConfig(
  tenantId: string,
  ownCollection: Collection,
  config: unknown,
): Promise<string | null> {
  const parsed = relationshipConfigSchema.safeParse(config);
  // Malformed shape is already caught by `fieldWidgetSchema` before this runs.
  if (!parsed.success) return null;

  const { targetCollectionId } = parsed.data;

  if (targetCollectionId === ownCollection.id) {
    return "A relationship field cannot target its own collection.";
  }

  const target = await findCollectionById(tenantId, targetCollectionId);
  if (!target) {
    return "The target collection could not be found.";
  }
  if (target.project_id !== ownCollection.project_id) {
    return "The target collection must belong to the same project.";
  }

  return null;
}

const createFieldSchema = fieldBaseSchema.extend({
  widget: widgetTypeSchema,
  config: z.unknown(),
});

export async function createField(
  tenantId: string,
  collectionId: string,
  input: unknown,
): Promise<FieldResult> {
  const parsed = createFieldSchema.safeParse(input);
  if (!parsed.success) return invalid(flatten(parsed.error));

  const { key, label, required, widget, config } = parsed.data;

  // Config is validated against the widget type it was submitted with, so
  // configuration belonging to a different widget is rejected rather than
  // stored where the widget cannot use it.
  const widgetParsed = fieldWidgetSchema.safeParse({ widget, config });
  if (!widgetParsed.success) {
    return invalid({ config: [z.prettifyError(widgetParsed.error)] });
  }

  const collection = await findCollectionById(tenantId, collectionId);
  if (!collection) return NOT_FOUND;

  if (widget === "relationship") {
    const message = await validateRelationshipConfig(
      tenantId,
      collection,
      widgetParsed.data.config,
    );
    if (message) return invalid({ config: [message] });
  }

  const db = getTenantDb(tenantId);
  const id = randomUUID();

  try {
    await db.transaction().execute(async (trx) => {
      const last = await trx
        .selectFrom("fields")
        .select((eb) => eb.fn.max("position").as("max_position"))
        .where("collection_id", "=", collectionId)
        .executeTakeFirst();

      const position =
        last?.max_position === null || last?.max_position === undefined
          ? 0
          : Number(last.max_position) + 1;

      await trx
        .insertInto("fields")
        .values({
          id,
          collection_id: collectionId,
          key,
          label,
          widget,
          required: required ? 1 : 0,
          position,
          config: JSON.stringify(widgetParsed.data.config),
        })
        .execute();

      await bumpSchemaVersion(trx, collectionId);
    });
  } catch (error) {
    // Keys are unique per collection; the index is what makes the check
    // race-proof, so the violation is translated rather than pre-empted.
    if (isUniqueViolation(error, "key")) {
      return invalid({ key: ["A field with this key already exists."] });
    }
    throw error;
  }

  const field = await findField(tenantId, collectionId, id);
  if (!field) throw new Error("Field vanished immediately after insert.");

  return { ok: true, field };
}

const updateFieldSchema = fieldBaseSchema.extend({
  config: z.unknown(),
  /**
   * Accepted only so a submission naming a different widget can be *rejected*
   * rather than silently ignored — the type is immutable once values exist,
   * because there is no defined conversion between widget types.
   */
  widget: widgetTypeSchema.optional(),
});

export async function updateField(
  tenantId: string,
  collectionId: string,
  fieldId: string,
  input: unknown,
): Promise<FieldResult> {
  const parsed = updateFieldSchema.safeParse(input);
  if (!parsed.success) return invalid(flatten(parsed.error));

  const existing = await findField(tenantId, collectionId, fieldId);
  if (!existing) return NOT_FOUND;

  const { key, label, required, config, widget } = parsed.data;

  if (widget !== undefined && widget !== existing.widget) {
    return invalid({
      widget: [
        "A field's widget type cannot be changed. Delete the field and create a new one.",
      ],
    });
  }

  if (!existing.ok) {
    // The stored widget is not one this build knows, so there is no schema to
    // validate a new config against. Deleting the field is the way out.
    return invalid({ widget: [existing.reason] });
  }

  const widgetParsed = fieldWidgetSchema.safeParse({
    widget: existing.widget,
    config,
  });
  if (!widgetParsed.success) {
    return invalid({ config: [z.prettifyError(widgetParsed.error)] });
  }

  if (existing.widget === "relationship") {
    const collection = await findCollectionById(tenantId, collectionId);
    if (!collection) return NOT_FOUND;

    const message = await validateRelationshipConfig(
      tenantId,
      collection,
      widgetParsed.data.config,
    );
    if (message) return invalid({ config: [message] });
  }

  const db = getTenantDb(tenantId);

  try {
    await db.transaction().execute(async (trx) => {
      // Renaming touches this row only. Values are keyed by field_id, so a key
      // or label change moves nothing and loses nothing.
      await trx
        .updateTable("fields")
        .set({
          key,
          label,
          required: required ? 1 : 0,
          config: JSON.stringify(widgetParsed.data.config),
        })
        .where("id", "=", fieldId)
        .where("collection_id", "=", collectionId)
        .execute();

      await bumpSchemaVersion(trx, collectionId);
    });
  } catch (error) {
    if (isUniqueViolation(error, "key")) {
      return invalid({ key: ["A field with this key already exists."] });
    }
    throw error;
  }

  const field = await findField(tenantId, collectionId, fieldId);
  if (!field) throw new Error("Field vanished immediately after update.");

  return { ok: true, field };
}

/**
 * Rewrite a collection's field order.
 *
 * The client sends the complete ordered id list and the server rewrites every
 * position in one transaction: idempotent, no fractional-index drift, and a
 * duplicated or reordered request cannot corrupt the order (design decision
 * 10).
 */
export async function reorderFields(
  tenantId: string,
  collectionId: string,
  orderedFieldIds: ReadonlyArray<string>,
): Promise<MutationResult> {
  const collection = await findCollectionById(tenantId, collectionId);
  if (!collection) return NOT_FOUND;

  const db = getTenantDb(tenantId);

  const existing = await db
    .selectFrom("fields")
    .select("id")
    .where("collection_id", "=", collectionId)
    .execute();

  const existingIds = new Set(existing.map((row) => row.id));
  const submitted = new Set(orderedFieldIds);

  // The submitted set must match the collection's fields exactly. Anything
  // else — a foreign field id, a duplicate, a missing one — is refused whole,
  // so a partial order can never be written.
  const matches =
    submitted.size === orderedFieldIds.length &&
    submitted.size === existingIds.size &&
    orderedFieldIds.every((id) => existingIds.has(id));

  if (!matches) {
    return invalid({
      order: ["The submitted order does not match this collection's fields."],
    });
  }

  await db.transaction().execute(async (trx) => {
    for (const [position, id] of orderedFieldIds.entries()) {
      await trx
        .updateTable("fields")
        .set({ position })
        .where("id", "=", id)
        .where("collection_id", "=", collectionId)
        .execute();
    }

    await bumpSchemaVersion(trx, collectionId);
  });

  return { ok: true };
}

/** Drives the delete confirmation: "values in N entries will be deleted". */
export async function countFieldValues(
  tenantId: string,
  collectionId: string,
  fieldId: string,
): Promise<number> {
  const field = await findField(tenantId, collectionId, fieldId);
  if (!field) return 0;

  const row = await getTenantDb(tenantId)
    .selectFrom("entry_values")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("field_id", "=", fieldId)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

/**
 * Value counts for every field in a collection, in one grouped query.
 *
 * The field builder needs a count per field to render its delete confirmation;
 * calling `countFieldValues` in a loop would make the builder's query count
 * grow with the field count for no reason.
 */
export async function countValuesByField(
  tenantId: string,
  collectionId: string,
): Promise<Map<string, number>> {
  const rows = await getTenantDb(tenantId)
    .selectFrom("entry_values")
    .innerJoin("fields", "fields.id", "entry_values.field_id")
    .select((eb) => [
      "entry_values.field_id as field_id",
      eb.fn.countAll().as("count"),
    ])
    .where("fields.collection_id", "=", collectionId)
    .groupBy("entry_values.field_id")
    .execute();

  return new Map(rows.map((row) => [row.field_id, Number(row.count)]));
}

/**
 * Hard-delete a field.
 *
 * `entry_values.field_id` cascades, so the field's values go with it and no
 * orphan can survive — and `collections.title_field_id` is ON DELETE SET NULL,
 * so deleting the title field clears the designation instead of failing.
 */
export async function deleteField(
  tenantId: string,
  collectionId: string,
  fieldId: string,
): Promise<MutationResult> {
  const field = await findField(tenantId, collectionId, fieldId);
  if (!field) return NOT_FOUND;

  const db = getTenantDb(tenantId);

  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("fields")
      .where("id", "=", fieldId)
      .where("collection_id", "=", collectionId)
      .execute();

    await bumpSchemaVersion(trx, collectionId);
  });

  return { ok: true };
}

/** Drives the delete confirmation: "N entries will be deleted". */
export async function countEntriesByCollection(
  tenantId: string,
  collectionId: string,
): Promise<number> {
  const row = await getTenantDb(tenantId)
    .selectFrom("entries")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("collection_id", "=", collectionId)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

/**
 * Drives the collection-delete warning: how many `relationship` fields
 * elsewhere target this collection. A pure `fields`-table scan — cheap,
 * unlike the entry-reference count in `src/lib/entries/service.ts`, which has
 * to look inside `entry_values.value` JSON (design decision 4).
 */
export async function countRelationshipFieldsTargeting(
  tenantId: string,
  collectionId: string,
): Promise<number> {
  const row = await getTenantDb(tenantId)
    .selectFrom("fields")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("widget", "=", "relationship")
    .where(
      sql<boolean>`json_extract(config, '$.targetCollectionId') = ${collectionId}`,
    )
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

/**
 * Hard-delete a collection.
 *
 * `fields.collection_id` and `entries.collection_id` cascade, and
 * `entry_values` cascades from both `entries` and `fields`, so the
 * collection's fields, entries, and entry values go with it — no orphan can
 * survive.
 */
export async function deleteCollection(
  tenantId: string,
  projectId: string,
  collectionId: string,
): Promise<MutationResult> {
  const collection = await findCollection(tenantId, projectId, collectionId);
  if (!collection) return NOT_FOUND;

  await getTenantDb(tenantId)
    .deleteFrom("collections")
    .where("id", "=", collectionId)
    .execute();

  return { ok: true };
}

/** Designate the field whose value labels this collection's entries. */
export async function setTitleField(
  tenantId: string,
  collectionId: string,
  fieldId: string | null,
): Promise<MutationResult> {
  const collection = await findCollectionById(tenantId, collectionId);
  if (!collection) return NOT_FOUND;

  if (fieldId !== null) {
    const field = await findField(tenantId, collectionId, fieldId);
    if (!field) return NOT_FOUND;
  }

  await getTenantDb(tenantId)
    .updateTable("collections")
    .set({ title_field_id: fieldId })
    .where("id", "=", collectionId)
    .execute();

  return { ok: true };
}

/**
 * The field whose value labels an entry, or `undefined` if there is none.
 *
 * Designated first; otherwise the first `string` field by position. When
 * neither exists — or the value is empty — the caller falls back to the entry
 * slug and then a placeholder (design decision 7).
 */
export function resolveTitleField(
  collection: Pick<Collection, "title_field_id">,
  fields: ReadonlyArray<FieldParseResult>,
): ParsedField | undefined {
  const usable = fields.filter((field): field is ParsedField => field.ok);

  if (collection.title_field_id) {
    const designated = usable.find(
      (field) => field.id === collection.title_field_id,
    );
    if (designated) return designated;
  }

  return usable
    .slice()
    .sort((a, b) => a.position - b.position)
    .find((field) => field.widget === ("string" satisfies WidgetType));
}

export const ENTRY_TITLE_PLACEHOLDER = "Untitled";
