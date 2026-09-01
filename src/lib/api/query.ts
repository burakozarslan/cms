const ALLOWED_PARAMS = new Set(["limit", "offset", "order", "direction"]);

/** A closed set, never interpolated — see `resolve-target.ts` and the route
 *  handlers, which map these directly to `orderBy` calls. Exported so the
 *  GraphQL list-field arguments (`src/lib/api/graphql/list-args.ts`) validate
 *  against the exact same set rather than a second, driftable copy. */
export const ORDER_COLUMNS = ["created_at", "updated_at"] as const;
export type OrderColumn = (typeof ORDER_COLUMNS)[number];

export const DIRECTIONS = ["asc", "desc"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export type ListQuery = {
  limit: number;
  offset: number;
  order: OrderColumn;
  direction: Direction;
};

export type ListQueryResult = { ok: true; query: ListQuery } | { ok: false; message: string };

export function isOrderColumn(value: string): value is OrderColumn {
  return (ORDER_COLUMNS as readonly string[]).includes(value);
}

export function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

/**
 * Parse a list endpoint's pagination/ordering query string.
 *
 * An unknown parameter or an unparseable value is rejected outright, rather
 * than ignored — a typo'd `?limt=100` must surface immediately, not silently
 * fall back to the default (design decision 12). An oversized `limit` is the
 * one exception: it is capped, not rejected.
 */
export function parseListQuery(searchParams: URLSearchParams): ListQueryResult {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      return { ok: false, message: `Unknown query parameter "${key}".` };
    }
  }

  const limitRaw = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw) || Number(limitRaw) < 1) {
      return { ok: false, message: '"limit" must be a positive integer.' };
    }
    limit = Math.min(Number(limitRaw), MAX_LIMIT);
  }

  const offsetRaw = searchParams.get("offset");
  let offset = 0;
  if (offsetRaw !== null) {
    if (!/^\d+$/.test(offsetRaw)) {
      return { ok: false, message: '"offset" must be a non-negative integer.' };
    }
    offset = Number(offsetRaw);
  }

  const orderRaw = searchParams.get("order") ?? "created_at";
  if (!isOrderColumn(orderRaw)) {
    return {
      ok: false,
      message: `"order" must be one of: ${ORDER_COLUMNS.join(", ")}.`,
    };
  }

  const directionRaw = searchParams.get("direction") ?? "desc";
  if (!isDirection(directionRaw)) {
    return {
      ok: false,
      message: `"direction" must be one of: ${DIRECTIONS.join(", ")}.`,
    };
  }

  return { ok: true, query: { limit, offset, order: orderRaw, direction: directionRaw } };
}
