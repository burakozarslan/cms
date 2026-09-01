import { randomUUID } from "node:crypto";

import { z } from "zod";

import { encrypt } from "@/lib/crypto";
import { getTenantDb } from "@/lib/db/client";
import { findProject } from "@/lib/projects/service";

import { enqueueRedelivery, enqueueTestPing } from "./delivery";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "./events";
import { checkWebhookTarget } from "./ssrf-guard";
import { generateWebhookSecret, webhookSecretPrefix } from "./secret";

export type Webhook = {
  id: string;
  project_id: string;
  name: string;
  target_url: string;
  events: WebhookEventType[];
  secret_prefix: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type FieldErrors = Record<string, string[]>;

export type Failure =
  | { ok: false; error: "INVALID"; fieldErrors: FieldErrors }
  | { ok: false; error: "NOT_FOUND" };

export type MutationResult = { ok: true } | Failure;

const NOT_FOUND: Failure = { ok: false, error: "NOT_FOUND" };

function invalid(fieldErrors: FieldErrors): Failure {
  return { ok: false, error: "INVALID", fieldErrors };
}

const WEBHOOK_COLUMNS = [
  "id",
  "project_id",
  "name",
  "target_url",
  "events",
  "secret_prefix",
  "enabled",
  "created_at",
  "updated_at",
] as const;

type WebhookRow = {
  id: string;
  project_id: string;
  name: string;
  target_url: string;
  events: string;
  secret_prefix: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

function toWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    target_url: row.target_url,
    events: JSON.parse(row.events),
    secret_prefix: row.secret_prefix,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const webhookInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for this webhook.").max(80, "Names are limited to 80 characters."),
  targetUrl: z.string().trim().min(1, "Enter a target URL."),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, "Select at least one event."),
});

/** A project's webhooks, most recent first. */
export function listWebhooks(
  tenantId: string,
  projectId: string,
): Promise<Webhook[]> {
  return getTenantDb(tenantId)
    .selectFrom("webhooks")
    .select(WEBHOOK_COLUMNS)
    .where("project_id", "=", projectId)
    .orderBy("created_at", "desc")
    .execute()
    .then((rows) => rows.map(toWebhook));
}

export type CreateWebhookResult = { ok: true; webhook: Webhook; secret: string } | Failure;

/**
 * Create a project-scoped webhook. The raw secret is returned here, in this
 * result, and nowhere else (webhook-management, "Secret is unrecoverable
 * afterwards").
 */
export async function createWebhook(
  tenantId: string,
  projectId: string,
  userId: string,
  input: unknown,
): Promise<CreateWebhookResult> {
  const parsed = webhookInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const project = await findProject(tenantId, projectId);
  if (!project) return NOT_FOUND;

  const targetCheck = await checkWebhookTarget(parsed.data.targetUrl);
  if (!targetCheck.allowed) {
    return invalid({ targetUrl: [targetCheck.reason] });
  }

  const secret = generateWebhookSecret();
  const id = randomUUID();

  await getTenantDb(tenantId)
    .insertInto("webhooks")
    .values({
      id,
      project_id: projectId,
      name: parsed.data.name,
      target_url: parsed.data.targetUrl,
      events: JSON.stringify(parsed.data.events),
      secret_enc: encrypt(secret),
      secret_prefix: webhookSecretPrefix(secret),
      created_by_user_id: userId,
    })
    .execute();

  const row = await getTenantDb(tenantId)
    .selectFrom("webhooks")
    .select(WEBHOOK_COLUMNS)
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) throw new Error("Webhook vanished immediately after insert.");

  return { ok: true, webhook: toWebhook(row), secret };
}

/** Toggle a webhook's enabled state. */
export async function setWebhookEnabled(
  tenantId: string,
  projectId: string,
  webhookId: string,
  enabled: boolean,
): Promise<MutationResult> {
  const result = await getTenantDb(tenantId)
    .updateTable("webhooks")
    .set({ enabled: enabled ? 1 : 0, updated_at: new Date().toISOString() })
    .where("id", "=", webhookId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();

  if (result.numUpdatedRows === 0n) return NOT_FOUND;
  return { ok: true };
}

export async function deleteWebhook(
  tenantId: string,
  projectId: string,
  webhookId: string,
): Promise<MutationResult> {
  const result = await getTenantDb(tenantId)
    .deleteFrom("webhooks")
    .where("id", "=", webhookId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) return NOT_FOUND;
  return { ok: true };
}

export type RotateSecretResult = { ok: true; secretPrefix: string; secret: string } | Failure;

export async function rotateWebhookSecret(
  tenantId: string,
  projectId: string,
  webhookId: string,
): Promise<RotateSecretResult> {
  const existing = await getTenantDb(tenantId)
    .selectFrom("webhooks")
    .select("id")
    .where("id", "=", webhookId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();
  if (!existing) return NOT_FOUND;

  const secret = generateWebhookSecret();
  const secretPrefix = webhookSecretPrefix(secret);

  await getTenantDb(tenantId)
    .updateTable("webhooks")
    .set({
      secret_enc: encrypt(secret),
      secret_prefix: secretPrefix,
      updated_at: new Date().toISOString(),
    })
    .where("id", "=", webhookId)
    .where("project_id", "=", projectId)
    .execute();

  return { ok: true, secretPrefix, secret };
}

export type WebhookDelivery = {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** Bounded delivery history for one webhook, most recent first. */
export async function getWebhookDeliveries(
  tenantId: string,
  projectId: string,
  webhookId: string,
): Promise<WebhookDelivery[] | undefined> {
  const webhook = await getTenantDb(tenantId)
    .selectFrom("webhooks")
    .select("id")
    .where("id", "=", webhookId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();
  if (!webhook) return undefined;

  return getTenantDb(tenantId)
    .selectFrom("webhook_deliveries")
    .select([
      "id",
      "event_type",
      "status",
      "attempt_count",
      "last_status_code",
      "last_error",
      "created_at",
      "updated_at",
    ])
    .where("webhook_id", "=", webhookId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function sendTestPing(
  tenantId: string,
  projectId: string,
  webhookId: string,
): Promise<MutationResult> {
  const webhook = await getTenantDb(tenantId)
    .selectFrom("webhooks")
    .select("id")
    .where("id", "=", webhookId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();
  if (!webhook) return NOT_FOUND;

  const enqueued = await enqueueTestPing(tenantId, webhookId);
  if (!enqueued) return NOT_FOUND;
  return { ok: true };
}

export async function redeliverEvent(
  tenantId: string,
  projectId: string,
  webhookId: string,
  deliveryId: string,
): Promise<MutationResult> {
  const webhook = await getTenantDb(tenantId)
    .selectFrom("webhooks")
    .select("id")
    .where("id", "=", webhookId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();
  if (!webhook) return NOT_FOUND;

  const redelivered = await enqueueRedelivery(tenantId, webhookId, deliveryId);
  if (!redelivered) return NOT_FOUND;
  return { ok: true };
}

