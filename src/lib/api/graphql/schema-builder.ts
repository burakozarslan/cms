import {
  GraphQLError,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  type GraphQLFieldConfigMap,
} from "graphql";

import { listCollections, listFields, type Collection } from "@/lib/collections/service";
import { listPublishedEntries, resolveEntry } from "@/lib/api/resolve-target";
import type { Entry } from "@/lib/entries/service";
import { widgetDefinition, type ParsedField } from "@/lib/widgets";

import { parseGraphQLListArgs, type GraphQLListArgs } from "./list-args";
import { camelCaseFromSlug, pascalCaseFromSlug } from "./naming";
import {
  EntryMetaType,
  relationshipIsMultiple,
  relationshipTargetCollectionId,
  scalarOutputType,
} from "./type-map";
import type { GraphQLRequestContext } from "./reference-loader";

type EntryLike = Pick<Entry, "id" | "slug" | "status" | "created_at" | "updated_at" | "values">;

function fixedEntryFields(): GraphQLFieldConfigMap<EntryLike, GraphQLRequestContext> {
  return {
    id: { type: new GraphQLNonNull(GraphQLString), resolve: (entry) => entry.id },
    slug: { type: new GraphQLNonNull(GraphQLString), resolve: (entry) => entry.slug },
    status: { type: new GraphQLNonNull(GraphQLString), resolve: (entry) => entry.status },
    createdAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (entry) => normalizeTimestamp(entry.created_at),
    },
    updatedAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (entry) => normalizeTimestamp(entry.updated_at),
    },
  };
}

/** Stored timestamps are `CURRENT_TIMESTAMP` strings, not ISO — normalize on
 *  the way out, same as REST's `serializeEntry`. */
function normalizeTimestamp(raw: string): string {
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
}

function scalarFieldResolver(field: ParsedField) {
  return (entry: EntryLike) => {
    const raw = entry.values[field.id];
    if (raw === undefined) return null;
    const widget = widgetDefinition(field.widget);
    return widget.toApi ? widget.toApi(raw, field.config) : raw;
  };
}

function relationshipFieldResolver(field: ParsedField) {
  const multiple = relationshipIsMultiple(field);
  const targetCollectionId = relationshipTargetCollectionId(field);

  return async (entry: EntryLike, _args: unknown, context: GraphQLRequestContext) => {
    const raw = entry.values[field.id];
    if (raw === undefined) return multiple ? [] : null;

    const ids = (Array.isArray(raw) ? raw : [raw]).filter(
      (id): id is string => typeof id === "string",
    );
    if (ids.length === 0) return multiple ? [] : null;

    const loader = context.getLoader(targetCollectionId);
    const resolved = await loader.loadMany(ids);
    const entries = resolved.filter(
      (row): row is Entry => row !== null && !(row instanceof Error),
    );

    return multiple ? entries : (entries[0] ?? null);
  };
}

type BuildState = {
  types: Map<string, GraphQLObjectType>;
  fieldsByCollection: Map<string, ParsedField[]>;
};

/**
 * Builds one collection's object type. Relationship fields reference other
 * collections' types through `state.types`, which is why every type is
 * created (name only) before any type's `fields` thunk is evaluated —
 * `graphql-js` calls the thunk lazily, so a forward reference to a
 * not-yet-populated map entry resolves fine by the time it is read.
 */
function buildCollectionType(collection: Collection, state: BuildState): GraphQLObjectType {
  return new GraphQLObjectType({
    name: pascalCaseFromSlug(collection.slug),
    fields: (): GraphQLFieldConfigMap<EntryLike, GraphQLRequestContext> => {
      const fields = fixedEntryFields();
      const parsedFields = state.fieldsByCollection.get(collection.id) ?? [];

      for (const field of parsedFields) {
        if (field.widget === "relationship") {
          const targetType = state.types.get(relationshipTargetCollectionId(field));
          if (!targetType) continue; // Target collection vanished or is unresolvable — omit, same as REST.

          const multiple = relationshipIsMultiple(field);
          fields[field.key] = {
            type: multiple ? new GraphQLList(targetType) : targetType,
            resolve: relationshipFieldResolver(field),
          };
          continue;
        }

        fields[field.key] = {
          type: scalarOutputType(field),
          resolve: scalarFieldResolver(field),
        };
      }

      return fields;
    },
  });
}

function buildListType(itemType: GraphQLObjectType): GraphQLObjectType {
  return new GraphQLObjectType({
    name: `${itemType.name}List`,
    fields: {
      data: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(itemType))) },
      meta: { type: new GraphQLNonNull(EntryMetaType) },
    },
  });
}

function buildQueryType(
  collections: readonly Collection[],
  state: BuildState,
): GraphQLObjectType {
  const queryFields: GraphQLFieldConfigMap<unknown, GraphQLRequestContext> = {};

  for (const collection of collections) {
    const collectionType = state.types.get(collection.id);
    if (!collectionType) continue;

    const baseName = camelCaseFromSlug(collection.slug);
    const listType = buildListType(collectionType);

    queryFields[`${baseName}Entries`] = {
      type: new GraphQLNonNull(listType),
      args: {
        limit: { type: GraphQLInt },
        offset: { type: GraphQLInt },
        order: { type: GraphQLString },
        direction: { type: GraphQLString },
      },
      resolve: async (_source, args: GraphQLListArgs, context) => {
        const parsed = parseGraphQLListArgs(args);
        if (!parsed.ok) {
          throw new GraphQLError(parsed.message, { extensions: { code: "INVALID_QUERY" } });
        }

        const { entries, total } = await listPublishedEntries(
          context.tenantId,
          collection.id,
          parsed.query,
        );

        return {
          data: entries,
          meta: { total, limit: parsed.query.limit, offset: parsed.query.offset },
        };
      },
    };

    queryFields[`${baseName}Entry`] = {
      type: collectionType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: async (_source, args: { id: string }, context) => {
        return (await resolveEntry(context.tenantId, collection.id, args.id)) ?? null;
      },
    };
  }

  return new GraphQLObjectType({ name: "Query", fields: queryFields });
}

async function buildSchema(tenantId: string, projectId: string): Promise<GraphQLSchema> {
  const collections = await listCollections(tenantId, projectId);

  const state: BuildState = { types: new Map(), fieldsByCollection: new Map() };

  for (const collection of collections) {
    const fields = await listFields(tenantId, collection.id);
    // Misconfigured fields are left out of the generated type — no output
    // type can describe a widget that no longer parses (matches REST's
    // `serializeCollection`); they simply do not appear as selectable.
    state.fieldsByCollection.set(
      collection.id,
      fields.filter((field): field is ParsedField => field.ok),
    );
  }

  for (const collection of collections) {
    state.types.set(collection.id, buildCollectionType(collection, state));
  }

  const query = buildQueryType(collections, state);
  return new GraphQLSchema({ query });
}

type CacheEntry = { version: string; schema: Promise<GraphQLSchema> };

/**
 * Per-project schema cache, keyed by `projectId` and invalidated by content
 * rather than by a timer: the cache key includes every collection's id,
 * slug, and `schema_version` (bumped by every field-mutating transaction —
 * `bumpSchemaVersion` in `src/lib/collections/service.ts` — and changed
 * implicitly whenever a collection itself is added, removed, or renamed).
 * A stale cached schema is therefore structurally unreachable: a change to
 * collections or fields changes the key, so the next request misses and
 * rebuilds, the same "unreachable rather than wrong" cache-invalidation
 * pattern `src/lib/widgets/schema-cache.ts` already uses for entry
 * validation schemas — no write-path invalidation hook needed.
 */
const MAX_CACHED_PROJECTS = 128;
const cache = new Map<string, CacheEntry>();

function cacheKeyVersion(collections: readonly Collection[]): string {
  return collections
    .map((collection) => `${collection.id}:${collection.slug}:${collection.schema_version}`)
    .sort()
    .join(",");
}

export async function getProjectSchema(
  tenantId: string,
  projectId: string,
): Promise<GraphQLSchema> {
  const collections = await listCollections(tenantId, projectId);
  const version = cacheKeyVersion(collections);

  const hit = cache.get(projectId);
  if (hit && hit.version === version) return hit.schema;

  const schemaPromise = buildSchema(tenantId, projectId);

  if (cache.size >= MAX_CACHED_PROJECTS && !cache.has(projectId)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(projectId, { version, schema: schemaPromise });

  try {
    return await schemaPromise;
  } catch (error) {
    // Don't poison the cache with a rejected build.
    cache.delete(projectId);
    throw error;
  }
}

/** For tests, which need a cold cache between cases. */
export function clearGraphQLSchemaCache(): void {
  cache.clear();
}
