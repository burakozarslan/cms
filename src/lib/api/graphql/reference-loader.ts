import DataLoader from "dataloader";

import { findEntriesByIds } from "@/lib/api/resolve-target";
import type { Entry } from "@/lib/entries/service";

/**
 * One request's relationship resolution context.
 *
 * A `DataLoader` is created lazily per target collection and memoized for
 * the lifetime of the request, so every relationship field across a query's
 * selection set that targets the same collection shares one loader — and
 * therefore one batched query per tick, matching `resolveReferences`'s REST
 * batching guarantee but generalized to work across arbitrarily nested
 * resolver ticks (design.md, "Relationship fields as resolver functions
 * over the shared reference map").
 */
export type GraphQLRequestContext = {
  tenantId: string;
  projectId: string;
  getLoader(targetCollectionId: string): DataLoader<string, Entry | null>;
};

export function createRequestContext(
  tenantId: string,
  projectId: string,
): GraphQLRequestContext {
  const loaders = new Map<string, DataLoader<string, Entry | null>>();

  return {
    tenantId,
    projectId,
    getLoader(targetCollectionId: string) {
      const existing = loaders.get(targetCollectionId);
      if (existing) return existing;

      const loader = new DataLoader<string, Entry | null>(async (ids) => {
        const rows = await findEntriesByIds(tenantId, targetCollectionId, [
          ...new Set(ids),
        ]);
        const byId = new Map(rows.map((row) => [row.id, row]));
        return ids.map((id) => byId.get(id) ?? null);
      });

      loaders.set(targetCollectionId, loader);
      return loader;
    },
  };
}
