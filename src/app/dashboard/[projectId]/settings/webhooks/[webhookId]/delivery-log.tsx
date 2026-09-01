"use client";

import { Badge, Button } from "@frontend/ui";

import { redeliverEventAction } from "../actions";

export type DeliveryView = {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function statusTone(status: string): "success" | "warning" | "error" {
  if (status === "succeeded") return "success";
  if (status === "pending") return "warning";
  return "error";
}

export function DeliveryLog({
  projectId,
  webhookId,
  deliveries,
}: {
  projectId: string;
  webhookId: string;
  deliveries: DeliveryView[];
}) {
  if (deliveries.length === 0) {
    return (
      <p className="text-base-content/60 text-sm">
        No deliveries yet. They will appear here once content changes or you
        send a test ping.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Response</th>
            <th>Time</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td>
                <code className="text-xs">{delivery.eventType}</code>
              </td>
              <td>
                <Badge tone={statusTone(delivery.status)}>{delivery.status}</Badge>
              </td>
              <td className="text-base-content/70 text-sm">
                {delivery.attemptCount}
              </td>
              <td className="text-base-content/70 max-w-xs truncate text-sm">
                {delivery.lastStatusCode ?? delivery.lastError ?? "—"}
              </td>
              <td className="text-base-content/70 text-sm">
                {formatDate(delivery.createdAt)}
              </td>
              <td>
                <form action={redeliverEventAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="webhookId" value={webhookId} />
                  <input type="hidden" name="deliveryId" value={delivery.id} />
                  <Button type="submit" variant="ghost" size="xs">
                    Redeliver
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
