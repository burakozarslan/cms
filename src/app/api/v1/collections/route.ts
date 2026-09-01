import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listCollections } from "@/lib/collections/service";
import { withApiKey } from "@/lib/api/with-api-key";

export const runtime = "nodejs";

/**
 * The key's project's collections — a summary listing. Field schemas are the
 * item endpoint's job (`GET /api/v1/collections/:collection`), so this stays
 * one query regardless of how many collections a project has.
 */
export const GET = withApiKey(async (_request: NextRequest, { tenantId, projectId }) => {
  const collections = await listCollections(tenantId, projectId);

  const data = collections.map((collection) => ({
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
  }));

  return NextResponse.json({ data });
});
