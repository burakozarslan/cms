import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Badge, Card, CardBody, CardTitle } from "@frontend/ui";

import { requireSession } from "@/lib/auth";
import { findProject } from "@/lib/projects/service";

import { AUTH_DESCRIPTION, ENDPOINTS } from "./content";

export const metadata: Metadata = { title: "API docs" };

type Params = { params: Promise<{ projectId: string }> };

export default async function ApiDocsPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId } = await params;

  const project = await findProject(session.user.tenantId, projectId);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-2">
          <CardTitle>Content Delivery API</CardTitle>
          <p className="text-base-content/70 text-sm">
            A versioned, key-authenticated, read-only JSON API over{" "}
            <strong>{project.name}</strong>&apos;s published content.
            {" "}{AUTH_DESCRIPTION}
          </p>
        </CardBody>
      </Card>

      {ENDPOINTS.map((endpoint) => (
        <Card key={endpoint.path} className="bg-base-100 shadow-sm">
          <CardBody className="gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{endpoint.method}</Badge>
              <CardTitle className="text-base font-mono">
                {endpoint.path}
              </CardTitle>
            </div>

            <p className="text-base-content/70 text-sm">
              {endpoint.description}
            </p>

            <p className="text-base-content/60 text-xs">{AUTH_DESCRIPTION}</p>

            {endpoint.queryParams ? (
              <div className="overflow-x-auto">
                <table className="table-sm table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Default</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoint.queryParams.map((param) => (
                      <tr key={param.name}>
                        <td>
                          <code className="text-xs">{param.name}</code>
                        </td>
                        <td>
                          <code className="text-xs">{param.default}</code>
                        </td>
                        <td className="text-sm">{param.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Example response</h3>
              {endpoint.successExamples.map((example) => (
                <div key={example.title} className="flex flex-col gap-1">
                  <span className="text-base-content/60 text-xs">
                    {example.title}
                  </span>
                  <pre className="bg-base-200 overflow-x-auto rounded-btn p-3 text-xs">
                    <code>{example.json}</code>
                  </pre>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Error responses</h3>
              {endpoint.errorResponses.map((error) => (
                <div key={error.code} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="error" variant="outline">
                      {error.status} {error.code}
                    </Badge>
                    <span className="text-base-content/70 text-xs">
                      {error.meaning}
                    </span>
                  </div>
                  <pre className="bg-base-200 overflow-x-auto rounded-btn p-3 text-xs">
                    <code>{error.exampleJson}</code>
                  </pre>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
