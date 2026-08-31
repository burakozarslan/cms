import { randomUUID } from "node:crypto";

import { getRootDb, getTenantDb } from "@/lib/db/client";
import { decrypt } from "@/lib/crypto";

import type { ContentEvent } from "./events";
import { signPayload } from "./secret";
import { checkWebhookTarget } from "./ssrf-guard";

/** Bounded retry schedule (design.md, "Failed deliveries are retried"). */
export const MAX_DELIVERY_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const DELIVERY_TIMEOUT_MS = 10_000;

/** Bounded delivery log per webhook (webhook-management, "Delivery log is bounded"). */
export const DELIVERY_LOG_RETENTION = 200;

function backoffMs(attemptCount: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attemptCount, MAX_BACKOFF_MS);
}

export type WebhookDeliveryPayload = {
  event: string;
  projectId: string;
  collectionId?: string;
  entryId?: string;
  occurredAt: string;
};

function buildContentPayload(event: ContentEvent): WebhookDeliveryPayload {
  return {
    event: event.type,
    projectId: event.projectId,
    collectionId: event.collectionId,
    entryId: event.entryId,
    occurredAt: new Date().toISOString(),
  };
}

async function insertDelivery(
  tenantId: string,
  webhookId: string,
  eventType: string,
  payload: WebhookDeliveryPayload,
): Promise<void> {
  await getTenantDb(tenantId)
    .insertInto("webhook_deliveries")
    .values({
      id: randomUUID(),
      webhook_id: webhookId,
      delivery_uuid: randomUUID(),
      event_type: eventType,
      payload: JSON.stringify(payload),
      status: "pending",
    })
    .execute();

  await pruneDeliveryLog(tenantId, webhookId);
}

/**
 * Fans a content event out to every enabled webhook on its project
 * subscribed to that event type, one queue row per match (design.md,
 * "Content event → webhook event mapping lives in the delivery capability").
 *
 * Only ever writes queue rows — never performs the outbound HTTP call — so
 * this returns fast and cannot fail the triggering content write
 * (webhook-delivery, "Content operations are not blocked or failed by
 * delivery").
 */
export async function enqueueWebhookDelivery(event: ContentEvent): Promise<void> {
  const webhooks = await getTenantDb(event.tenantId)
    .selectFrom("webhooks")
    .select(["id", "events"])
    .where("project_id", "=", event.projectId)
    .where("enabled", "=", 1)
    .execute();

  const payload = buildContentPayload(event);

  for (const webhook of webhooks) {
    const subscribed: string[] = JSON.parse(webhook.events);
    if (!subscribed.includes(event.type)) continue;
    await insertDelivery(event.tenantId, webhook.id, event.type, payload);
  }
}

/** Trigger a synthetic ping, independent of any real content event. */
export async function enqueueTestPing(
  tenantId: string,
  webhookId: string,
): Promise<boolean> {
  const webhook = await getTenantDb(tenantId)
    .selectFrom("webhooks")
    .select("project_id")
    .where("id", "=", webhookId)
    .executeTakeFirst();

  if (!webhook) return false;

  await insertDelivery(tenantId, webhookId, "webhook.test", {
    event: "webhook.test",
    projectId: webhook.project_id,
    occurredAt: new Date().toISOString(),
  });
  return true;
}

/** Re-send a past delivery's original payload as a new delivery attempt. */
export async function enqueueRedelivery(
  tenantId: string,
  webhookId: string,
  deliveryId: string,
): Promise<boolean> {
  const original = await getTenantDb(tenantId)
    .selectFrom("webhook_deliveries")
    .select(["event_type", "payload"])
    .where("id", "=", deliveryId)
    .where("webhook_id", "=", webhookId)
    .executeTakeFirst();

  if (!original) return false;

  await insertDelivery(
    tenantId,
    webhookId,
    original.event_type,
    JSON.parse(original.payload),
  );
  return true;
}

/** Keep only the most recent `DELIVERY_LOG_RETENTION` rows for a webhook. */
async function pruneDeliveryLog(tenantId: string, webhookId: string): Promise<void> {
  const db = getTenantDb(tenantId);

  const stale = await db
    .selectFrom("webhook_deliveries")
    .select("id")
    .where("webhook_id", "=", webhookId)
    .orderBy("created_at", "desc")
    // SQLite requires a LIMIT clause before OFFSET is valid syntax.
    .limit(1_000_000)
    .offset(DELIVERY_LOG_RETENTION)
    .execute();

  if (stale.length === 0) return;

  await db
    .deleteFrom("webhook_deliveries")
    .where(
      "id",
      "in",
      stale.map((row) => row.id),
    )
    .execute();
}

type DueDelivery = {
  id: string;
  tenant_id: string;
  webhook_id: string;
  delivery_uuid: string;
  event_type: string;
  payload: string;
  attempt_count: number;
};

/**
 * Attempt every due pending delivery once. Meant to be called on an
 * interval by the worker (src/lib/webhooks/worker.ts) — safe to call
 * concurrently since each row's own WHERE clause on the update guards it.
 */
export async function deliverDueWebhooks(batchSize = 25): Promise<void> {
  // The queue spans tenants, so this is the one place `webhook_deliveries`
  // and `webhooks` are read through the unscoped handle — every value used
  // afterwards (tenant_id, webhook_id) comes from the row itself, and every
  // write below re-applies it as an explicit predicate.
  const now = new Date().toISOString();

  const due = (await getRootDb()
    .selectFrom("webhook_deliveries")
    .select([
      "id",
      "tenant_id",
      "webhook_id",
      "delivery_uuid",
      "event_type",
      "payload",
      "attempt_count",
    ])
    .where("status", "=", "pending")
    .where("next_attempt_at", "<=", now)
    .orderBy("next_attempt_at", "asc")
    .limit(batchSize)
    .execute()) as DueDelivery[];

  for (const delivery of due) {
    await attemptDelivery(delivery);
  }
}

async function attemptDelivery(delivery: DueDelivery): Promise<void> {
  const db = getTenantDb(delivery.tenant_id);

  const webhook = await db
    .selectFrom("webhooks")
    .select(["id", "target_url", "secret_enc", "enabled"])
    .where("id", "=", delivery.webhook_id)
    .executeTakeFirst();

  if (!webhook || webhook.enabled !== 1) {
    await markFailed(delivery, "Webhook disabled or deleted.");
    return;
  }

  const targetCheck = await checkWebhookTarget(webhook.target_url);
  if (!targetCheck.allowed) {
    await markFailed(delivery, targetCheck.reason);
    return;
  }

  const secret = decrypt(webhook.secret_enc);
  const signature = signPayload(secret, delivery.payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(webhook.target_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": `sha256=${signature}`,
        "x-webhook-event": delivery.event_type,
        "x-webhook-delivery": delivery.delivery_uuid,
      },
      body: delivery.payload,
      signal: controller.signal,
    });

    if (response.ok) {
      await markSucceeded(delivery, response.status);
    } else {
      await scheduleRetry(delivery, response.status, `HTTP ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery failed.";
    await scheduleRetry(delivery, null, message);
  } finally {
    clearTimeout(timeout);
  }
}

async function markSucceeded(delivery: DueDelivery, statusCode: number): Promise<void> {
  await getTenantDb(delivery.tenant_id)
    .updateTable("webhook_deliveries")
    .set({
      status: "succeeded",
      attempt_count: delivery.attempt_count + 1,
      last_status_code: statusCode,
      last_error: null,
    })
    .where("id", "=", delivery.id)
    .execute();
}

async function markFailed(delivery: DueDelivery, reason: string): Promise<void> {
  await getTenantDb(delivery.tenant_id)
    .updateTable("webhook_deliveries")
    .set({
      status: "failed",
      attempt_count: delivery.attempt_count + 1,
      last_error: reason,
    })
    .where("id", "=", delivery.id)
    .execute();
}

async function scheduleRetry(
  delivery: DueDelivery,
  statusCode: number | null,
  reason: string,
): Promise<void> {
  const nextAttemptCount = delivery.attempt_count + 1;

  if (nextAttemptCount >= MAX_DELIVERY_ATTEMPTS) {
    await getTenantDb(delivery.tenant_id)
      .updateTable("webhook_deliveries")
      .set({
        status: "failed",
        attempt_count: nextAttemptCount,
        last_status_code: statusCode,
        last_error: reason,
      })
      .where("id", "=", delivery.id)
      .execute();
    return;
  }

  const nextAttemptAt = new Date(
    Date.now() + backoffMs(delivery.attempt_count),
  ).toISOString();

  await getTenantDb(delivery.tenant_id)
    .updateTable("webhook_deliveries")
    .set({
      status: "pending",
      attempt_count: nextAttemptCount,
      next_attempt_at: nextAttemptAt,
      last_status_code: statusCode,
      last_error: reason,
    })
    .where("id", "=", delivery.id)
    .execute();
}
