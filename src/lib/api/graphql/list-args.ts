import {
  DEFAULT_LIMIT,
  DIRECTIONS,
  isDirection,
  isOrderColumn,
  MAX_LIMIT,
  ORDER_COLUMNS,
  type Direction,
  type OrderColumn,
} from "@/lib/api/query";

export type GraphQLListArgs = {
  limit?: number | null;
  offset?: number | null;
  order?: string | null;
  direction?: string | null;
};

export type ParsedListArgs = {
  limit: number;
  offset: number;
  order: OrderColumn;
  direction: Direction;
};

export type ListArgsResult =
  | { ok: true; query: ParsedListArgs }
  | { ok: false; message: string };

/**
 * Validates GraphQL list-field arguments against the same rules
 * `parseListQuery` (`src/lib/api/query.ts`) applies to REST's `?limit=` /
 * `?offset=` / `?order=` / `?direction=` — same defaults, same cap-rather-
 * than-reject behavior for an oversized limit, same closed `order` column
 * set — so the two entry points cannot silently diverge (design.md, Risks).
 */
export function parseGraphQLListArgs(args: GraphQLListArgs): ListArgsResult {
  let limit = DEFAULT_LIMIT;
  if (args.limit !== undefined && args.limit !== null) {
    if (!Number.isInteger(args.limit) || args.limit < 1) {
      return { ok: false, message: '"limit" must be a positive integer.' };
    }
    limit = Math.min(args.limit, MAX_LIMIT);
  }

  let offset = 0;
  if (args.offset !== undefined && args.offset !== null) {
    if (!Number.isInteger(args.offset) || args.offset < 0) {
      return { ok: false, message: '"offset" must be a non-negative integer.' };
    }
    offset = args.offset;
  }

  const orderRaw = args.order ?? "created_at";
  if (!isOrderColumn(orderRaw)) {
    return {
      ok: false,
      message: `"order" must be one of: ${ORDER_COLUMNS.join(", ")}.`,
    };
  }

  const directionRaw = args.direction ?? "desc";
  if (!isDirection(directionRaw)) {
    return {
      ok: false,
      message: `"direction" must be one of: ${DIRECTIONS.join(", ")}.`,
    };
  }

  return { ok: true, query: { limit, offset, order: orderRaw, direction: directionRaw } };
}
