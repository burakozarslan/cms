import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listFields } from "@/lib/collections/service";
import { apiError } from "@/lib/api/errors";
import { countPublishedEntries, resolveCollection } from "@/lib/api/resolve-target";
import { serializeCollection } from "@/lib/api/serialize";
import { withApiKey } from "@/lib/api/with-api-key";

export const runtime = "nodejs";

type Params = { collection: string };

export const GET = withApiKey<Params>(
  async (_request: NextRequest, { tenantId, projectId, params }) => {
    const collection = await resolveCollection(tenantId, projectId, params.collection);
    if (!collection) {
      return apiError("NOT_FOUND", "That collection could not be found.", 404);
    }

    const fields = await listFields(tenantId, collection.id);
    const entryCount = await countPublishedEntries(tenantId, collection.id);

    return NextResponse.json({
      data: { ...serializeCollection(collection, fields), entryCount },
    });
  },
);
