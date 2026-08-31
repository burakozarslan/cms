"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import {
  createWebhook,
  deleteWebhook,
  redeliverEvent,
  rotateWebhookSecret,
  sendTestPing,
  setWebhookEnabled,
} from "@/lib/webhooks/service";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/events";

export type CreateWebhookState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** The raw secret, present only in the response to the create that minted
   *  it — never re-derivable afterwards. */
  createdSecret?: string;
  createdName?: string;
};

export async function createWebhookAction(
  _prev: CreateWebhookState,
  formData: FormData,
): Promise<CreateWebhookState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const name = formData.get("name");
  const targetUrl = formData.get("targetUrl");
  const events = WEBHOOK_EVENT_TYPES.filter(
    (event) => formData.get(`event:${event}`) !== null,
  );

  const result = await createWebhook(session.user.tenantId, projectId, session.user.id, {
    name,
    targetUrl,
    events,
  });

  if (!result.ok) {
    if (result.error === "NOT_FOUND") {
      return { error: "That project could not be found." };
    }
    return { fieldErrors: result.fieldErrors };
  }

  revalidatePath(`/dashboard/${projectId}/settings/webhooks`);
  return { createdSecret: result.secret, createdName: result.webhook.name };
}

export async function setWebhookEnabledAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const webhookId = String(formData.get("webhookId") ?? "");
  const enabled = formData.get("enabled") === "true";

  await setWebhookEnabled(session.user.tenantId, projectId, webhookId, enabled);

  revalidatePath(`/dashboard/${projectId}/settings/webhooks`);
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const webhookId = String(formData.get("webhookId") ?? "");

  await deleteWebhook(session.user.tenantId, projectId, webhookId);

  revalidatePath(`/dashboard/${projectId}/settings/webhooks`);
}

export type RotateSecretState = {
  revealedSecret?: string;
  revealedPrefix?: string;
};

export async function rotateWebhookSecretAction(
  _prev: RotateSecretState,
  formData: FormData,
): Promise<RotateSecretState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const webhookId = String(formData.get("webhookId") ?? "");

  const result = await rotateWebhookSecret(session.user.tenantId, projectId, webhookId);

  revalidatePath(`/dashboard/${projectId}/settings/webhooks`);
  if (!result.ok) return {};
  return { revealedSecret: result.secret, revealedPrefix: result.secretPrefix };
}

export async function sendTestPingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const webhookId = String(formData.get("webhookId") ?? "");

  await sendTestPing(session.user.tenantId, projectId, webhookId);

  revalidatePath(`/dashboard/${projectId}/settings/webhooks/${webhookId}`);
}

export async function redeliverEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const webhookId = String(formData.get("webhookId") ?? "");
  const deliveryId = String(formData.get("deliveryId") ?? "");

  await redeliverEvent(session.user.tenantId, projectId, webhookId, deliveryId);

  revalidatePath(`/dashboard/${projectId}/settings/webhooks/${webhookId}`);
}
