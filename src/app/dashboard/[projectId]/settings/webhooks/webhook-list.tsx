"use client";

import Link from "next/link";

import { Badge, Button, ConfirmDialog } from "@frontend/ui";

import { deleteWebhookAction, setWebhookEnabledAction } from "./actions";

export type WebhookView = {
  id: string;
  name: string;
  targetUrl: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function WebhookList({
  projectId,
  webhooks,
}: {
  projectId: string;
  webhooks: WebhookView[];
}) {
  if (webhooks.length === 0) {
    return (
      <p className="text-base-content/60 text-sm">
        No webhooks yet. Create one below to notify a build hook when
        content changes.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target</th>
            <th>Events</th>
            <th>Status</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {webhooks.map((webhook) => (
            <tr key={webhook.id}>
              <td>
                <Link
                  href={`/dashboard/${projectId}/settings/webhooks/${webhook.id}`}
                  className="link link-primary"
                >
                  {webhook.name}
                </Link>
              </td>
              <td className="text-base-content/70 max-w-xs truncate text-sm">
                {webhook.targetUrl}
              </td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {webhook.events.map((event) => (
                    <Badge key={event} tone="info">
                      {event}
                    </Badge>
                  ))}
                </div>
              </td>
              <td>
                {webhook.enabled ? (
                  <Badge tone="success">Enabled</Badge>
                ) : (
                  <Badge tone="neutral">Disabled</Badge>
                )}
              </td>
              <td className="text-base-content/70 text-sm">
                {formatDate(webhook.createdAt)}
              </td>
              <td>
                <div className="flex items-center gap-1">
                  <form action={setWebhookEnabledAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="webhookId" value={webhook.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={webhook.enabled ? "false" : "true"}
                    />
                    <Button type="submit" variant="ghost" size="xs">
                      {webhook.enabled ? "Disable" : "Enable"}
                    </Button>
                  </form>

                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="ghost" size="xs">
                        Delete
                      </Button>
                    }
                    title={`Delete "${webhook.name}"?`}
                    confirmLabel="Delete webhook"
                    destructive
                    action={deleteWebhookAction}
                    hidden={{ projectId, webhookId: webhook.id }}
                  >
                    This webhook and its delivery log will be removed
                    immediately. This cannot be undone.
                  </ConfirmDialog>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
