/**
 * @jest-environment node
 *
 * Webhook delivery: event fan-out, non-blocking content writes, retry
 * backoff, and success. Covers `webhook-delivery`'s requirements and
 * `content-entries`'s event-emission deltas.
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import {
  makeCollection,
  makeEntry,
  makeField,
  makeProject,
  makeTenant,
} from "../helpers/content-fixtures";

const VALID_KEY = "v97uOic9/sbhtkB2rBdyys0hcKELLhdfW8hMCpcTBi8=";
const TARGET_URL = "http://93.184.216.34/hook";
const UNREACHABLE_URL = "http://93.184.216.35/hook";

process.env.MEDIA_CONFIG_ENCRYPTION_KEY = VALID_KEY;

const { cleanup } = setupTempDatabase();

let webhooks: typeof import("@/lib/webhooks/service");
let deliveryModule: typeof import("@/lib/webhooks/delivery");
let entries: typeof import("@/lib/entries/service");
let db: typeof import("@/lib/db/client");

let tenantId: string;
let projectId: string;
let userId: string;

const originalFetch = global.fetch;

beforeAll(async () => {
  await migrateTestDatabase();
  webhooks = await import("@/lib/webhooks/service");
  deliveryModule = await import("@/lib/webhooks/delivery");
  entries = await import("@/lib/entries/service");
  db = await import("@/lib/db/client");

  tenantId = await makeTenant("delivery@example.com");
  projectId = await makeProject(tenantId, "Site");

  const user = await db
    .getRootDb()
    .selectFrom("users")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  userId = user!.id;
});

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("enqueueWebhookDelivery via entry publish/unpublish/delete", () => {
  async function makeHook(name: string, events: string[]) {
    const created = await webhooks.createWebhook(tenantId, projectId, userId, {
      name,
      targetUrl: TARGET_URL,
      events,
    });
    if (!created.ok) throw new Error("expected success");
    return created.webhook;
  }

  it("publishing an entry enqueues a delivery only for a matching webhook", async () => {
    const collection = await makeCollection(tenantId, projectId, "Posts");
    const title = await makeField(tenantId, collection, { key: "title", widget: "string" });
    const entryId = await makeEntry(tenantId, collection, { [title]: "Hello" });

    const matching = await makeHook("Matches published", ["entry.published"]);
    const nonMatching = await makeHook("Only unpublished", ["entry.unpublished"]);

    await entries.setEntryStatus(tenantId, collection, entryId, "published");

    const matchingDeliveries = await webhooks.getWebhookDeliveries(
      tenantId,
      projectId,
      matching.id,
    );
    expect(matchingDeliveries?.some((d) => d.event_type === "entry.published")).toBe(
      true,
    );

    const nonMatchingDeliveries = await webhooks.getWebhookDeliveries(
      tenantId,
      projectId,
      nonMatching.id,
    );
    expect(nonMatchingDeliveries?.length ?? 0).toBe(0);
  });

  it("re-saving the same status emits no additional delivery", async () => {
    const collection = await makeCollection(tenantId, projectId, "Posts2");
    const title = await makeField(tenantId, collection, { key: "title", widget: "string" });
    const entryId = await makeEntry(tenantId, collection, { [title]: "Hello" });
    const hook = await makeHook("No-op check", ["entry.published"]);

    await entries.setEntryStatus(tenantId, collection, entryId, "published");
    const afterFirst = await webhooks.getWebhookDeliveries(tenantId, projectId, hook.id);

    await entries.setEntryStatus(tenantId, collection, entryId, "published");
    const afterSecond = await webhooks.getWebhookDeliveries(tenantId, projectId, hook.id);

    expect(afterSecond?.length).toBe(afterFirst?.length);
  });

  it("deleting a published entry enqueues entry.deleted; deleting a draft does not", async () => {
    const collection = await makeCollection(tenantId, projectId, "Posts3");
    const title = await makeField(tenantId, collection, { key: "title", widget: "string" });
    const hook = await makeHook("Delete watcher", ["entry.deleted"]);

    const publishedId = await makeEntry(tenantId, collection, { [title]: "Pub" });
    await entries.setEntryStatus(tenantId, collection, publishedId, "published");
    await entries.deleteEntry(tenantId, collection, publishedId);

    const draftId = await makeEntry(tenantId, collection, { [title]: "Draft" });
    await entries.deleteEntry(tenantId, collection, draftId);

    const deliveries = await webhooks.getWebhookDeliveries(tenantId, projectId, hook.id);
    const deletedDeliveries = deliveries?.filter((d) => d.event_type === "entry.deleted");
    expect(deletedDeliveries?.length).toBe(1);
  });

  it("disabled webhook receives no delivery", async () => {
    const collection = await makeCollection(tenantId, projectId, "Posts4");
    const title = await makeField(tenantId, collection, { key: "title", widget: "string" });
    const entryId = await makeEntry(tenantId, collection, { [title]: "Hello" });

    const hook = await makeHook("Disabled watcher", ["entry.published"]);
    await webhooks.setWebhookEnabled(tenantId, projectId, hook.id, false);

    await entries.setEntryStatus(tenantId, collection, entryId, "published");

    const deliveries = await webhooks.getWebhookDeliveries(tenantId, projectId, hook.id);
    expect(deliveries?.length ?? 0).toBe(0);
  });

  it("a content write succeeds even though the enqueued delivery's target is unreachable", async () => {
    const collection = await makeCollection(tenantId, projectId, "Posts5");
    const title = await makeField(tenantId, collection, { key: "title", widget: "string" });
    const entryId = await makeEntry(tenantId, collection, { [title]: "Hello" });
    await makeHook("Unreachable target", ["entry.published"]);

    // enqueueing never performs the network call itself — the write must
    // succeed regardless of what the target does at delivery time.
    const result = await entries.setEntryStatus(tenantId, collection, entryId, "published");
    expect(result).toEqual({ ok: true });
  });
});

describe("deliverDueWebhooks", () => {
  it("marks a delivery succeeded on a 2xx response", async () => {
    const created = await webhooks.createWebhook(tenantId, projectId, userId, {
      name: "Success target",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    await webhooks.sendTestPing(tenantId, projectId, created.webhook.id);

    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
    await deliveryModule.deliverDueWebhooks();

    const deliveries = await webhooks.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(deliveries?.[0]?.status).toBe("succeeded");
    expect(deliveries?.[0]?.last_status_code).toBe(200);
  });

  it("signs the outbound request with the webhook's secret", async () => {
    const created = await webhooks.createWebhook(tenantId, projectId, userId, {
      name: "Signature check",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    await webhooks.sendTestPing(tenantId, projectId, created.webhook.id);

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as never;
    await deliveryModule.deliverDueWebhooks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-webhook-signature"]).toMatch(/^sha256=[0-9a-f]+$/);
    expect(headers["x-webhook-event"]).toBe("webhook.test");

    const { verifySignature } = await import("@/lib/webhooks/secret");
    const signature = headers["x-webhook-signature"]!.replace("sha256=", "");
    expect(verifySignature(created.secret, init.body as string, signature)).toBe(true);
  });

  it("reschedules with backoff on failure and eventually marks failed", async () => {
    const created = await webhooks.createWebhook(tenantId, projectId, userId, {
      name: "Retry target",
      targetUrl: UNREACHABLE_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    await webhooks.sendTestPing(tenantId, projectId, created.webhook.id);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as never;

    await deliveryModule.deliverDueWebhooks();
    let deliveries = await webhooks.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(deliveries?.[0]?.status).toBe("pending");
    expect(deliveries?.[0]?.attempt_count).toBe(1);

    // Force every remaining row due now, and exhaust the retry budget.
    for (let i = 0; i < deliveryModule.MAX_DELIVERY_ATTEMPTS; i++) {
      await db
        .getRootDb()
        .updateTable("webhook_deliveries")
        .set({ next_attempt_at: new Date(0).toISOString() })
        .where("webhook_id", "=", created.webhook.id)
        .execute();
      await deliveryModule.deliverDueWebhooks();
    }

    deliveries = await webhooks.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(deliveries?.[0]?.status).toBe("failed");
    expect(deliveries?.[0]?.attempt_count).toBe(deliveryModule.MAX_DELIVERY_ATTEMPTS);
  });

  it("stops retrying once a later attempt succeeds", async () => {
    const created = await webhooks.createWebhook(tenantId, projectId, userId, {
      name: "Eventually ok",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    await webhooks.sendTestPing(tenantId, projectId, created.webhook.id);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
    await deliveryModule.deliverDueWebhooks();

    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
    await db
      .getRootDb()
      .updateTable("webhook_deliveries")
      .set({ next_attempt_at: new Date(0).toISOString() })
      .where("webhook_id", "=", created.webhook.id)
      .execute();
    await deliveryModule.deliverDueWebhooks();

    const deliveries = await webhooks.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(deliveries?.[0]?.status).toBe("succeeded");

    // No further attempt is scheduled for a succeeded delivery.
    (global.fetch as jest.Mock).mockClear();
    await deliveryModule.deliverDueWebhooks();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips delivery when the target now resolves to a private address", async () => {
    const created = await webhooks.createWebhook(tenantId, projectId, userId, {
      name: "Goes private later",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    await webhooks.sendTestPing(tenantId, projectId, created.webhook.id);

    // Simulate the target's DNS having been repointed since creation.
    await db
      .getRootDb()
      .updateTable("webhooks")
      .set({ target_url: "http://127.0.0.1:9/hook" })
      .where("id", "=", created.webhook.id)
      .execute();

    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    await deliveryModule.deliverDueWebhooks();

    expect(fetchMock).not.toHaveBeenCalled();
    const deliveries = await webhooks.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(deliveries?.[0]?.status).toBe("failed");
  });
});
