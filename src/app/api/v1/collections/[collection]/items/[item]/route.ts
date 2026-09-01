import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listFields } from "@/lib/collections/service";
import { apiError } from "@/lib/api/errors";
import { resolveCollection, resolveEntry } from "@/lib/api/resolve-target";
import { resolveReferences, serializeEntry } from "@/lib/api/serialize";
import { withApiKey } from "@/lib/api/with-api-key";

export const runtime = "nodejs";

type Params = { collection: string; item: string };

export const GET = withApiKey<Params>(
  async (_request: NextRequest, { tenantId, projectId, params }) => {
    const collection = await resolveCollection(tenantId, projectId, params.collection);
    if (!collection) {
      return apiError("NOT_FOUND", "That collection could not be found.", 404);
    }

    // `resolveEntry` already filters to `status = 'published'`, so a draft
    // entry's slug or id resolves to nothing — indistinguishable from one
    // that never existed.
    const entry = await resolveEntry(tenantId, collection.id, params.item);
    if (!entry) {
      return apiError("NOT_FOUND", "That item could not be found.", 404);
    }

    const fields = await listFields(tenantId, collection.id);
    const references = await resolveReferences(tenantId, [entry], fields);

    return NextResponse.json({ data: serializeEntry(entry, fields, references) });
  },
);
