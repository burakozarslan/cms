"use client";

import { Badge, Button, ConfirmDialog } from "@frontend/ui";

import { revokeApiKeyAction } from "./actions";

export type ApiKeyView = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

/** Revoked keys stay in the list, shown as revoked, rather than disappearing. */
export function ApiKeyList({
  projectId,
  keys,
}: {
  projectId: string;
  keys: ApiKeyView[];
}) {
  if (keys.length === 0) {
    return (
      <p className="text-base-content/60 text-sm">
        No API keys yet. Create one below to authenticate requests to the
        content delivery API.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Key</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const revoked = key.revokedAt !== null;

            return (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>
                  <code className="text-xs">{key.prefix}</code>
                </td>
                <td className="text-base-content/70 text-sm">
                  {formatDate(key.createdAt)}
                </td>
                <td className="text-base-content/70 text-sm">
                  {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                </td>
                <td>
                  {revoked ? (
                    <Badge tone="error">
                      Revoked {formatDate(key.revokedAt!)}
                    </Badge>
                  ) : (
                    <Badge tone="success">Active</Badge>
                  )}
                </td>
                <td>
                  {revoked ? null : (
                    <ConfirmDialog
                      trigger={
                        <Button type="button" variant="ghost" size="xs">
                          Revoke
                        </Button>
                      }
                      title={`Revoke "${key.name}"?`}
                      confirmLabel="Revoke key"
                      destructive
                      action={revokeApiKeyAction}
                      hidden={{ projectId, keyId: key.id }}
                    >
                      Requests using this key will be rejected immediately.
                      This cannot be undone.
                    </ConfirmDialog>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
