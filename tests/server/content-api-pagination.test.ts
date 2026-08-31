/**
 * @jest-environment node
 *
 * Pagination and ordering on `GET /api/v1/collections/:collection/items`.
 * Covers `content-delivery-api` → "Lists are paginated with a total ordering".
 */
import { NextRequest } from "next/server";

import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import {
  makeApiKey,
  makeCollection,
  makeField,
  makeProject,
  makeTenant,
} from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let itemsRoute: typeof import("@/app/api/v1/collections/[collection]/items/route").GET;

let tenantId: string;
let token: string;
let collectionId: string;
let fieldId: string;

const ENTRY_COUNT = 25;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ GET: itemsRoute } = await import("@/app/api/v1/collections/[collection]/items/route"));

  tenantId = await makeTenant("api-page@example.com");
  const projectId = await makeProject(tenantId, "Page Site");
  token = (await makeApiKey(tenantId, projectId, "Page key")).token;

  collectionId = await makeCollection(tenantId, projectId, "Posts");
  fieldId = await makeField(tenantId, collectionId, { key: "title", widget: "string" });

  const { createEntry, setEntryStatus } = await import("@/lib/entries/service");
  const { getTenantDb } = await import("@/lib/db/client");

  // Seed entries sharing one CURRENT_TIMESTAMP second — the scenario a
  // single-column ORDER BY would let duplicate or skip rows under.
  for (let i = 0; i < ENTRY_COUNT; i++) {
    const created = await createEntry(tenantId, collectionId, {
      values: { [fieldId]: `Post ${i}` },
    });
    if (!created.ok) throw new Error("fixture entry failed");
    await setEntryStatus(tenantId, collectionId, created.entry.id, "published");
  }

  // Force every row onto the exact same second-granular timestamp, so
  // ordering can only be made total by the `id` tiebreak.
  await getTenantDb(tenantId)
    .updateTable("entries")
    .set({ created_at: "2024-06-01 12:00:00" })
    .where("collection_id", "=", collectionId)
    .execute();

  // One draft, to prove it never counts toward `total`.
  await createEntry(tenantId, collectionId, { values: { [fieldId]: "Draft" } });
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

function authedRequest(path: string): NextRequest {
  return new NextRequest(
    new Request(`http://x${path}`, { headers: { Authorization: `Bearer ${token}` } }),
  );
}

async function fetchItems(query = "") {
  const response = await itemsRoute(
    authedRequest(`/api/v1/collections/${collectionId}/items${query}`),
    { params: Promise.resolve({ collection: collectionId }) },
  );
  return { status: response.status, body: await response.json() };
}

describe("default pagination", () => {
  it("applies the default page size and reports total/limit/offset", async () => {
    const { body } = await fetchItems();

    expect(body.data).toHaveLength(20);
    expect(body.meta).toEqual({ total: ENTRY_COUNT, limit: 20, offset: 0 });
  });
});

describe("oversized limit", () => {
  it("is capped rather than honored", async () => {
    const { body } = await fetchItems("?limit=500");
    expect(body.data).toHaveLength(ENTRY_COUNT);
    expect(body.meta.limit).toBe(100);
  });
});

describe("walking every page", () => {
  it("shows every entry exactly once, entries sharing a timestamp included", async () => {
    const seen = new Set<string>();
    let offset = 0;
    const pageSize = 7;

    for (let i = 0; i < 10; i++) {
      const { body } = await fetchItems(`?limit=${pageSize}&offset=${offset}`);
      if (body.data.length === 0) break;

      for (const entry of body.data) {
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
      offset += pageSize;
    }

    expect(seen.size).toBe(ENTRY_COUNT);
  });
});

describe("total counts published entries only", () => {
  it("excludes the draft", async () => {
    const { body } = await fetchItems("?limit=1");
    expect(body.meta.total).toBe(ENTRY_COUNT);
  });
});

describe("invalid query", () => {
  it("rejects an unsupported order column", async () => {
    const { status, body } = await fetchItems("?order=slug");
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_QUERY");
  });

  it("rejects an unknown query parameter rather than ignoring it", async () => {
    const { status, body } = await fetchItems("?limt=5");
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_QUERY");
  });
});
