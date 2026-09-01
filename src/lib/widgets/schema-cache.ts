import type { z } from "zod";

import { buildEntrySchema } from "./entry-schema";
import type { FieldParseResult } from "./registry";

/**
 * Building a Zod schema from field definitions happens on every entry render
 * and every entry save, so it is worth memoizing — but a cache that has to be
 * *evicted* on a field edit needs cross-process invalidation in any deployment
 * with more than one worker.
 *
 * Keying on `collection_id:schema_version` sidesteps that entirely: a field
 * edit bumps the version in the same transaction, so the next request looks up
 * a key that was never populated. Staleness is structurally impossible — a
 * stale entry is unreachable rather than wrong — and the only cost is that old
 * entries linger until the LRU evicts them (design decision 6).
 */
const MAX_ENTRIES = 128;

const cache = new Map<string, z.ZodType<Record<string, unknown>>>();

export function schemaCacheKey(
  collectionId: string,
  schemaVersion: number,
): string {
  return `${collectionId}:${schemaVersion}`;
}

export function getEntrySchema(
  collectionId: string,
  schemaVersion: number,
  fields: ReadonlyArray<FieldParseResult>,
): z.ZodType<Record<string, unknown>> {
  const key = schemaCacheKey(collectionId, schemaVersion);

  const hit = cache.get(key);
  if (hit) {
    // Re-insert to mark as recently used.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const schema = buildEntrySchema(fields);

  if (cache.size >= MAX_ENTRIES) {
    // Map iterates in insertion order, so the first key is the coldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, schema);

  return schema;
}

/** For tests, which need a cold cache between cases. */
export function clearSchemaCache(): void {
  cache.clear();
}

export function schemaCacheSize(): number {
  return cache.size;
}
