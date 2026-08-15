import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { Card, CardBody, CardTitle } from "@frontend/ui";
import { requireSession } from "@/lib/auth";
import { findProject } from "@/lib/projects/service";

type Params = { params: Promise<{ projectId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const session = await requireSession();
  if (!session) return { title: "Project" };

  const { projectId } = await params;
  const project = await findProject(session.user.tenantId, projectId);

  return { title: project?.name ?? "Project" };
}

export default async function ProjectPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId } = await params;

  // projectId is client-supplied. `findProject` queries through the
  // tenant-scoped handle, so another tenant's project id returns nothing and
  // falls through to notFound() — an ownership failure and a missing project
  // are indistinguishable, by design.
  const project = await findProject(session.user.tenantId, projectId);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="link link-primary text-sm">
          ← All projects
        </Link>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <p className="text-base-content/60 font-mono text-xs">{project.slug}</p>
      </div>

      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-2">
          <CardTitle className="text-base">Content</CardTitle>
          <p className="text-base-content/70 text-sm">
            Content types and fields arrive in a later change. This project is
            ready to hold them.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
