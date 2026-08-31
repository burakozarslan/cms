import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Card, CardBody, CardTitle } from "@frontend/ui";

import { requireSession } from "@/lib/auth";
import { findProject } from "@/lib/projects/service";
import { listWebhooks } from "@/lib/webhooks/service";

import { CreateWebhookForm } from "./create-webhook-form";
import { WebhookList } from "./webhook-list";

export const metadata: Metadata = { title: "Webhooks" };

type Params = { params: Promise<{ projectId: string }> };

export default async function WebhooksPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId } = await params;

  const project = await findProject(session.user.tenantId, projectId);
  if (!project) notFound();

  const webhooks = await listWebhooks(session.user.tenantId, projectId);

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <CardTitle>Webhooks</CardTitle>
          <p className="text-base-content/70 text-sm">
            Notify an external URL — a static-site host&apos;s build hook,
            for example — when content changes in{" "}
            <strong>{project.name}</strong>.
          </p>

          <WebhookList
            projectId={projectId}
            webhooks={webhooks.map((webhook) => ({
              id: webhook.id,
              name: webhook.name,
              targetUrl: webhook.target_url,
              events: webhook.events,
              enabled: webhook.enabled,
              createdAt: webhook.created_at,
            }))}
          />
        </CardBody>
      </Card>

      <Card className="bg-base-100 max-w-md shadow-sm">
        <CardBody className="gap-4">
          <CardTitle className="text-base">New webhook</CardTitle>
          <CreateWebhookForm projectId={projectId} />
        </CardBody>
      </Card>
    </div>
  );
}
