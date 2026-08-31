import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Card, CardBody, CardTitle } from "@frontend/ui";

import { apiKeyDisplayPrefix, listApiKeys } from "@/lib/api-keys/service";
import { requireSession } from "@/lib/auth";
import { findProject } from "@/lib/projects/service";

import { ApiKeyList } from "./api-key-list";
import { CreateApiKeyForm } from "./create-api-key-form";

export const metadata: Metadata = { title: "API keys" };

type Params = { params: Promise<{ projectId: string }> };

export default async function ApiKeysPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId } = await params;

  const project = await findProject(session.user.tenantId, projectId);
  if (!project) notFound();

  const keys = await listApiKeys(session.user.tenantId, projectId);

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <CardTitle>API keys</CardTitle>
          <p className="text-base-content/70 text-sm">
            Keys authenticate the content delivery API for{" "}
            <strong>{project.name}</strong>. Each key is scoped to this
            project alone.
          </p>

          <ApiKeyList
            projectId={projectId}
            keys={keys.map((key) => ({
              id: key.id,
              name: key.name,
              prefix: apiKeyDisplayPrefix(key),
              createdAt: key.created_at,
              lastUsedAt: key.last_used_at,
              revokedAt: key.revoked_at,
            }))}
          />
        </CardBody>
      </Card>

      <Card className="bg-base-100 max-w-md shadow-sm">
        <CardBody className="gap-4">
          <CardTitle className="text-base">New key</CardTitle>
          <CreateApiKeyForm projectId={projectId} />
        </CardBody>
      </Card>
    </div>
  );
}
