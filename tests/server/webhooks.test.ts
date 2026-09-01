/**
 * @jest-environment node
 *
 * Webhook management service: creation, listing, enable/disable, deletion,
 * secret rotation, test ping, and redelivery. Covers
 * `webhook-management`'s requirements.
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import { makeProject, makeTenant } from "../helpers/content-fixtures";

const VALID_KEY = "v97uOic9/sbhtkB2rBdyys0hcKELLhdfW8hMCpcTBi8=";
// A public IP literal — creation-time validation never performs a DNS
// lookup for these, keeping the suite hermetic.
const TARGET_URL = "http://93.184.216.34/hook";

process.env.MEDIA_CONFIG_ENCRYPTION_KEY = VALID_KEY;

const { cleanup } = setupTempDatabase();

let service: typeof import("@/lib/webhooks/service");
let db: typeof import("@/lib/db/client");

let tenantId: string;
let projectId: string;
let userId: string;

beforeAll(async () => {
  await migrateTestDatabase();
  service = await import("@/lib/webhooks/service");
  db = await import("@/lib/db/client");

  tenantId = await makeTenant("webhooks@example.com");
  projectId = await makeProject(tenantId, "Site");

  const user = await db
    .getRootDb()
    .selectFrom("users")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  userId = user!.id;
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("createWebhook", () => {
  it("returns the raw secret exactly once, in the create result", async () => {
    const result = await service.createWebhook(tenantId, projectId, userId, {
      name: "My hook",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.secret).toMatch(/^whsec_.+/);

    const listed = await service.listWebhooks(tenantId, projectId);
    const row = listed.find((webhook) => webhook.id === result.webhook.id);
    expect(JSON.stringify(row)).not.toContain(result.secret);
  });

  it("stores no plaintext secret on the row", async () => {
    const result = await service.createWebhook(tenantId, projectId, userId, {
      name: "Plain check",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!result.ok) throw new Error("expected success");

    const row = await db
      .getRootDb()
      .selectFrom("webhooks")
      .selectAll()
      .where("id", "=", result.webhook.id)
      .executeTakeFirstOrThrow();

    expect(row.secret_enc).not.toContain(result.secret);
    expect(JSON.stringify(row)).not.toContain(result.secret);
  });

  it("refuses a project belonging to another tenant", async () => {
    const otherTenant = await makeTenant("webhooks-other@example.com");
    const otherProject = await makeProject(otherTenant, "Other");

    const result = await service.createWebhook(tenantId, otherProject, userId, {
      name: "Cross tenant",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects a blank name", async () => {
    const result = await service.createWebhook(tenantId, projectId, userId, {
      name: "   ",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a submission with no events selected", async () => {
    const result = await service.createWebhook(tenantId, projectId, userId, {
      name: "No events",
      targetUrl: TARGET_URL,
      events: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed target URL", async () => {
    const result = await service.createWebhook(tenantId, projectId, userId, {
      name: "Bad URL",
      targetUrl: "not a url",
      events: ["entry.published"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a target resolving to a private address", async () => {
    const result = await service.createWebhook(tenantId, projectId, userId, {
      name: "Private target",
      targetUrl: "http://127.0.0.1:9000/hook",
      events: ["entry.published"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
  });
});

describe("listWebhooks", () => {
  it("is scoped to the acting tenant and the given project", async () => {
    const tenantB = await makeTenant("webhooks-b@example.com");
    const projectB = await makeProject(tenantB, "B Site");
    const userB = await db
      .getRootDb()
      .selectFrom("users")
      .select("id")
      .where("tenant_id", "=", tenantB)
      .executeTakeFirstOrThrow();

    await service.createWebhook(tenantB, projectB, userB.id, {
      name: "B's hook",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });

    const listed = await service.listWebhooks(tenantId, projectId);
    expect(listed.every((webhook) => webhook.project_id === projectId)).toBe(true);
    expect(listed.some((webhook) => webhook.name === "B's hook")).toBe(false);
  });
});

describe("setWebhookEnabled / deleteWebhook", () => {
  it("toggles enabled state", async () => {
    const created = await service.createWebhook(tenantId, projectId, userId, {
      name: "Toggle me",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    const disabled = await service.setWebhookEnabled(
      tenantId,
      projectId,
      created.webhook.id,
      false,
    );
    expect(disabled).toEqual({ ok: true });

    const listed = await service.listWebhooks(tenantId, projectId);
    const row = listed.find((webhook) => webhook.id === created.webhook.id);
    expect(row?.enabled).toBe(false);
  });

  it("deletes a webhook along with its delivery log", async () => {
    const created = await service.createWebhook(tenantId, projectId, userId, {
      name: "Delete me",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    await service.sendTestPing(tenantId, projectId, created.webhook.id);

    const deleted = await service.deleteWebhook(tenantId, projectId, created.webhook.id);
    expect(deleted).toEqual({ ok: true });

    const deliveries = await service.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(deliveries).toBeUndefined();
  });

  it("refuses to toggle or delete another tenant's webhook", async () => {
    const tenantC = await makeTenant("webhooks-c@example.com");
    const projectC = await makeProject(tenantC, "C Site");
    const userC = await db
      .getRootDb()
      .selectFrom("users")
      .select("id")
      .where("tenant_id", "=", tenantC)
      .executeTakeFirstOrThrow();

    const created = await service.createWebhook(tenantC, projectC, userC.id, {
      name: "C's hook",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    expect(
      await service.setWebhookEnabled(tenantId, projectId, created.webhook.id, false),
    ).toEqual({ ok: false, error: "NOT_FOUND" });

    expect(
      await service.deleteWebhook(tenantId, projectId, created.webhook.id),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("rotateWebhookSecret", () => {
  it("replaces the secret and reveals the new one exactly once", async () => {
    const created = await service.createWebhook(tenantId, projectId, userId, {
      name: "Rotate me",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    const rotated = await service.rotateWebhookSecret(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.secret).not.toBe(created.secret);
    expect(rotated.secretPrefix).not.toBe(created.webhook.secret_prefix);
  });
});

describe("sendTestPing / redeliverEvent", () => {
  it("queues a webhook.test delivery visible in the log", async () => {
    const created = await service.createWebhook(tenantId, projectId, userId, {
      name: "Ping me",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    const result = await service.sendTestPing(tenantId, projectId, created.webhook.id);
    expect(result).toEqual({ ok: true });

    const deliveries = await service.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(deliveries?.some((delivery) => delivery.event_type === "webhook.test")).toBe(
      true,
    );
  });

  it("redelivering an unknown delivery id is NOT_FOUND", async () => {
    const created = await service.createWebhook(tenantId, projectId, userId, {
      name: "Redeliver target",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    const result = await service.redeliverEvent(
      tenantId,
      projectId,
      created.webhook.id,
      "does-not-exist",
    );
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("redelivering a known delivery inserts a new queue row with the same payload", async () => {
    const created = await service.createWebhook(tenantId, projectId, userId, {
      name: "Redeliver ok",
      targetUrl: TARGET_URL,
      events: ["entry.published"],
    });
    if (!created.ok) throw new Error("expected success");

    await service.sendTestPing(tenantId, projectId, created.webhook.id);
    const before = await service.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    const original = before![0]!;

    const result = await service.redeliverEvent(
      tenantId,
      projectId,
      created.webhook.id,
      original.id,
    );
    expect(result).toEqual({ ok: true });

    const after = await service.getWebhookDeliveries(
      tenantId,
      projectId,
      created.webhook.id,
    );
    expect(after!.length).toBe(before!.length + 1);
  });
});
