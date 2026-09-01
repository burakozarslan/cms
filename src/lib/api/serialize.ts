import { getTenantDb } from "@/lib/db/client";
import type { Collection } from "@/lib/collections/service";
import type { Entry } from "@/lib/entries/service";
import {
  isRelationshipToApiValue,
  widgetDefinition,
  type DatetimeConfig,
  type FieldParseResult,
  type NumberConfig,
  type ParsedField,
  type RelationshipConfig,
  type RelationshipToApiValue,
} from "@/lib/widgets";

// ---------------------------------------------------------------------------
// Collection schema
// ---------------------------------------------------------------------------

export type SerializedFieldSchema = {
  key: string;
  widget: string;
  required: boolean;
} & Record<string, unknown>;

export type SerializedCollectionSchema = {
  id: string;
  slug: string;
  name: string;
  fields: SerializedFieldSchema[];
};

/**
 * Only the configuration that determines a field's *output type* — not the
 * whole config blob (design.md 5.1). A consumer needs to know a `number`
 * field stays a string, or a `relationship` field is an array, to write a
 * typed client against it.
 */
function outputRelevantConfig(field: ParsedField): Record<string, unknown> {
  switch (field.widget) {
    case "number": {
      const { valueType } = field.config as NumberConfig;
      return { valueType };
    }
    case "datetime": {
      const { dateOnly } = field.config as DatetimeConfig;
      return dateOnly ? { dateOnly: true } : {};
    }
    case "relationship": {
      const { multiple } = field.config as RelationshipConfig;
      return { multiple: multiple === true };
    }
    default:
      return {};
  }
}

/**
 * A collection's field schema, for `GET /api/v1/collections/:collection`.
 *
 * Misconfigured fields are left out: their widget type may not even be one
 * this build recognizes, so there is no output type to describe. They still
 * surface per-entry, as a `null` value plus a `_warnings` entry.
 */
export function serializeCollection(
  collection: Pick<Collection, "id" | "slug" | "name">,
  fields: ReadonlyArray<FieldParseResult>,
): SerializedCollectionSchema {
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    fields: fields
      .filter((field): field is ParsedField => field.ok)
      .map((field) => ({
        key: field.key,
        widget: field.widget,
        required: field.required,
        ...outputRelevantConfig(field),
      })),
  };
}

// ---------------------------------------------------------------------------
// Reference resolution (relationship fields)
// ---------------------------------------------------------------------------

export type EntryReference = { id: string; slug: string; collection: string };

/** Keyed by `${targetCollectionId}:${entryId}` — an id is only meaningful
 *  within the collection it was resolved against. */
export type ReferenceMap = Map<string, EntryReference>;

type EntryLike = Pick<Entry, "values">;

/**
 * Batch-resolve every relationship reference across a whole response.
 *
 * One `WHERE id IN (...)` per distinct target collection (design decision
 * 8), so the extra work this adds is bounded by the number of relationship
 * *fields* in the schema, not by the number of entries or references. An id
 * that does not resolve — deleted, or not published — is simply absent from
 * the returned map; `serializeEntry` treats "absent" as the dangling case.
 */
export async function resolveReferences(
  tenantId: string,
  entries: ReadonlyArray<EntryLike>,
  fields: ReadonlyArray<FieldParseResult>,
): Promise<ReferenceMap> {
  const relationshipFields = fields.filter(
    (field): field is ParsedField => field.ok && field.widget === "relationship",
  );
  if (relationshipFields.length === 0) return new Map();

  const idsByCollection = new Map<string, Set<string>>();

  for (const entry of entries) {
    for (const field of relationshipFields) {
      const raw = entry.values[field.id];
      if (raw === undefined) continue;

      const { targetCollectionId } = field.config as RelationshipConfig;
      const ids = Array.isArray(raw) ? raw : [raw];
      const set = idsByCollection.get(targetCollectionId) ?? new Set<string>();
      for (const id of ids) {
        if (typeof id === "string") set.add(id);
      }
      idsByCollection.set(targetCollectionId, set);
    }
  }

  const references: ReferenceMap = new Map();
  if (idsByCollection.size === 0) return references;

  const db = getTenantDb(tenantId);

  const collectionRows = await db
    .selectFrom("collections")
    .select(["id", "slug"])
    .where("id", "in", [...idsByCollection.keys()])
    .execute();
  const collectionSlugs = new Map(collectionRows.map((row) => [row.id, row.slug]));

  for (const [targetCollectionId, ids] of idsByCollection) {
    const collectionSlug = collectionSlugs.get(targetCollectionId);
    // The target collection itself no longer exists — every id under it is
    // unresolvable, same as an individually dangling reference.
    if (!collectionSlug) continue;

    const rows = await db
      .selectFrom("entries")
      .select(["id", "slug"])
      .where("collection_id", "=", targetCollectionId)
      .where("status", "=", "published")
      .where("id", "in", [...ids])
      .execute();

    for (const row of rows) {
      references.set(`${targetCollectionId}:${row.id}`, {
        id: row.id,
        slug: row.slug,
        collection: collectionSlug,
      });
    }
  }

  return references;
}

function resolveRelationshipValue(
  value: RelationshipToApiValue,
  references: ReferenceMap,
): EntryReference | EntryReference[] | null {
  const resolved = value.ids
    .map((id) => references.get(`${value.targetCollectionId}:${id}`))
    .filter((ref): ref is EntryReference => ref !== undefined);

  return value.multiple ? resolved : (resolved[0] ?? null);
}

// ---------------------------------------------------------------------------
// Entry serialization
// ---------------------------------------------------------------------------

export type EntryWarning = { field: string; reason: string };

export type SerializedEntry = {
  id: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  fields: Record<string, unknown>;
  _warnings?: EntryWarning[];
};

/** Stored timestamps are `CURRENT_TIMESTAMP` strings, not ISO — normalize on
 *  the way out, same as `datetime` (design decision 5.5). */
function normalizeTimestamp(raw: string): string {
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
}

/**
 * One entry, serialized for delivery.
 *
 * Iterates the *field list*, not `entry.values` — so every declared field
 * appears on every entry, `null` when the value is absent or the field is
 * misconfigured (design decision 10). A pure function over already-fetched
 * rows: no database access here, so it is unit-testable without one.
 */
export function serializeEntry(
  entry: Pick<Entry, "id" | "slug" | "status" | "created_at" | "updated_at" | "values">,
  fields: ReadonlyArray<FieldParseResult>,
  references: ReferenceMap,
): SerializedEntry {
  const out: Record<string, unknown> = {};
  const warnings: EntryWarning[] = [];

  for (const field of fields) {
    if (!field.ok) {
      out[field.key] = null;
      warnings.push({ field: field.key, reason: field.reason });
      continue;
    }

    const raw = entry.values[field.id];
    if (raw === undefined) {
      out[field.key] = null;
      continue;
    }

    const widget = widgetDefinition(field.widget);
    const value = widget.toApi ? widget.toApi(raw, field.config) : raw;

    out[field.key] = isRelationshipToApiValue(value)
      ? resolveRelationshipValue(value, references)
      : value;
  }

  const serialized: SerializedEntry = {
    id: entry.id,
    slug: entry.slug,
    status: entry.status,
    createdAt: normalizeTimestamp(entry.created_at),
    updatedAt: normalizeTimestamp(entry.updated_at),
    fields: out,
  };

  if (warnings.length > 0) serialized._warnings = warnings;
  return serialized;
}
