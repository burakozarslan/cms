import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listFields } from "@/lib/collections/service";
import { apiError } from "@/lib/api/errors";
import { parseListQuery } from "@/lib/api/query";
import { listPublishedEntries, resolveCollection } from "@/lib/api/resolve-target";
import { resolveReferences, serializeEntry } from "@/lib/api/serialize";
import { withApiKey } from "@/lib/api/with-api-key";

export const runtime = "nodejs";

type Params = { collection: string };

export const GET = withApiKey<Params>(
  async (request: NextRequest, { tenantId, projectId, params }) => {
    const collection = await resolveCollection(tenantId, projectId, params.collection);
    if (!collection) {
      return apiError("NOT_FOUND", "That collection could not be found.", 404);
    }

    const parsedQuery = parseListQuery(request.nextUrl.searchParams);
    if (!parsedQuery.ok) {
      return apiError("INVALID_QUERY", parsedQuery.message, 400);
    }
    const { limit, offset, order, direction } = parsedQuery.query;

    const fields = await listFields(tenantId, collection.id);
    const { entries, total } = await listPublishedEntries(tenantId, collection.id, {
      order,
      direction,
      limit,
      offset,
    });

    const references = await resolveReferences(tenantId, entries, fields);
    const data = entries.map((entry) => serializeEntry(entry, fields, references));

    return NextResponse.json({ data, meta: { total, limit, offset } });
  },
);
