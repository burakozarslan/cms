import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge, Button, Card, CardBody, CardTitle } from "@frontend/ui";

import { requireSession } from "@/lib/auth";
import { findProject } from "@/lib/projects/service";
import { getWebhookDeliveries, listWebhooks } from "@/lib/webhooks/service";

import { sendTestPingAction } from "../actions";
import { DeliveryLog } from "./delivery-log";
import { RotateSecretForm } from "./rotate-secret-form";

export const metadata: Metadata = { title: "Webhook" };

type Params = { params: Promise<{ projectId: string; webhookId: string }> };

export default async function WebhookDetailPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId, webhookId } = await params;

  const project = await findProject(session.user.tenantId, projectId);
  if (!project) notFound();

  const webhooks = await listWebhooks(session.user.tenantId, projectId);
  const webhook = webhooks.find((entry) => entry.id === webhookId);
  if (!webhook) notFound();

  const deliveries = await getWebhookDeliveries(
    session.user.tenantId,
    projectId,
    webhookId,
  );
  if (!deliveries) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/dashboard/${projectId}/settings/webhooks`}
        className="link link-primary text-sm"
      >
        ← Webhooks
      </Link>

      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <div className="flex items-center justify-between">
            <CardTitle>{webhook.name}</CardTitle>
            {webhook.enabled ? (
              <Badge tone="success">Enabled</Badge>
            ) : (
              <Badge tone="neutral">Disabled</Badge>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-base-content/60">Target URL</dt>
            <dd className="break-all">{webhook.target_url}</dd>
            <dt className="text-base-content/60">Events</dt>
            <dd className="flex flex-wrap gap-1">
              {webhook.events.map((event) => (
                <Badge key={event} tone="info">
                  {event}
                </Badge>
              ))}
            </dd>
            <dt className="text-base-content/60">Secret</dt>
            <dd>
              <code className="text-xs">{webhook.secret_prefix}</code>
            </dd>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <form action={sendTestPingAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="webhookId" value={webhookId} />
              <Button type="submit" variant="secondary" size="sm">
                Send test ping
              </Button>
            </form>

            <RotateSecretForm projectId={projectId} webhookId={webhookId} />
          </div>
        </CardBody>
      </Card>

      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <CardTitle className="text-base">Delivery log</CardTitle>
          <DeliveryLog
            projectId={projectId}
            webhookId={webhookId}
            deliveries={deliveries.map((delivery) => ({
              id: delivery.id,
              eventType: delivery.event_type,
              status: delivery.status,
              attemptCount: delivery.attempt_count,
              lastStatusCode: delivery.last_status_code,
              lastError: delivery.last_error,
              createdAt: delivery.created_at,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
