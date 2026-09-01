/**
 * @jest-environment node
 *
 * The content delivery API's isolation suite, following
 * `content-isolation.test.ts`'s pattern. Covers `content-delivery-api` →
 * "Scope derives solely from the API key" and "Only published entries are
 * delivered".
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
  makeEntry,
  makeField,
  makeProject,
  makeTenant,
} from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let itemsRoute: typeof import("@/app/api/v1/collections/[collection]/items/route").GET;
let itemRoute: typeof import("@/app/api/v1/collections/[collection]/items/[item]/route").GET;
let collectionRoute: typeof import("@/app/api/v1/collections/[collection]/route").GET;

let tenantA: string;
let tokenA: string;

let projectB: string;
let collectionB: string;
let entryBSlug: string;

/** Tenant A's own second project — same tenant, wrong project. */
let projectA2: string;
let collectionA2: string;

/** A draft entry in tenant A's own, key-scoped collection. */
let collectionA: string;
let draftSlug: string;

beforeAll(async () => {
  await migrateTestDatabase();
  ({ GET: itemsRoute } = await import("@/app/api/v1/collections/[collection]/items/route"));
  ({ GET: itemRoute } = await import(
    "@/app/api/v1/collections/[collection]/items/[item]/route"
  ));
  ({ GET: collectionRoute } = await import("@/app/api/v1/collections/[collection]/route"));

  tenantA = await makeTenant("api-iso-a@example.com");
  const projectA = await makeProject(tenantA, "A Site");
  const key = await makeApiKey(tenantA, projectA, "A key");
  tokenA = key.token;

  const { findEntry, setEntryStatus } = await import("@/lib/entries/service");

  collectionA = await makeCollection(tenantA, projectA, "A Posts");
  const fieldA = await makeField(tenantA, collectionA, { key: "title", widget: "string" });
  const published = await makeEntry(tenantA, collectionA, { [fieldA]: "Published in A" });
  await setEntryStatus(tenantA, collectionA, published, "published");
  const draft = await makeEntry(tenantA, collectionA, { [fieldA]: "Draft in A" });

  projectA2 = await makeProject(tenantA, "A Second Site");
  collectionA2 = await makeCollection(tenantA, projectA2, "A2 Posts");
  const fieldA2 = await makeField(tenantA, collectionA2, { key: "title", widget: "string" });
  await makeEntry(tenantA, collectionA2, { [fieldA2]: "In A2" });

  const tenantB = await makeTenant("api-iso-b@example.com");
  projectB = await makeProject(tenantB, "B Site");
  collectionB = await makeCollection(tenantB, projectB, "B Posts");
  const fieldB = await makeField(tenantB, collectionB, { key: "title", widget: "string" });
  const entryB = await makeEntry(tenantB, collectionB, { [fieldB]: "B's secret" });

  const tenantBRow = await findEntry(tenantB, collectionB, entryB);
  entryBSlug = tenantBRow!.slug;

  const draftRow = await findEntry(tenantA, collectionA, draft);
  draftSlug = draftRow!.slug;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

function authedRequest(url: string, token: string = tokenA): NextRequest {
  return new NextRequest(new Request(url, { headers: { Authorization: `Bearer ${token}` } }));
}

async function json(response: Response) {
  return response.json();
}

describe("cross-tenant content is unreachable", () => {
  it("404s a collection belonging to another tenant", async () => {
    const response = await collectionRoute(authedRequest(`http://x/api/v1/collections/${collectionB}`), {
      params: Promise.resolve({ collection: collectionB }),
    });
    expect(response.status).toBe(404);
    expect((await json(response)).error.code).toBe("NOT_FOUND");
  });

  it("404s an item lookup addressed at another tenant's collection", async () => {
    const response = await itemRoute(
      authedRequest(`http://x/api/v1/collections/${collectionB}/items/${entryBSlug}`),
      { params: Promise.resolve({ collection: collectionB, item: entryBSlug }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("cross-project content (same tenant) is unreachable", () => {
  it("404s a same-tenant collection belonging to a different project", async () => {
    const response = await collectionRoute(
      authedRequest(`http://x/api/v1/collections/${collectionA2}`),
      { params: Promise.resolve({ collection: collectionA2 }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("only published entries are delivered", () => {
  it("excludes a draft entry from the list and its total", async () => {
    const response = await itemsRoute(authedRequest(`http://x/api/v1/collections/${collectionA}/items`), {
      params: Promise.resolve({ collection: collectionA }),
    });
    const body = await json(response);

    expect(body.meta.total).toBe(1);
    expect(body.data.every((entry: { status: string }) => entry.status === "published")).toBe(
      true,
    );
  });

  it("404s a draft entry addressed directly, indistinguishable from nonexistent", async () => {
    const draftResponse = await itemRoute(
      authedRequest(`http://x/api/v1/collections/${collectionA}/items/${draftSlug}`),
      { params: Promise.resolve({ collection: collectionA, item: draftSlug }) },
    );
    const missingResponse = await itemRoute(
      authedRequest(`http://x/api/v1/collections/${collectionA}/items/does-not-exist`),
      { params: Promise.resolve({ collection: collectionA, item: "does-not-exist" }) },
    );

    expect(draftResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    expect(await json(draftResponse)).toEqual(await json(missingResponse));
  });
});
