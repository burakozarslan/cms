import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { Card, CardBody, CardTitle } from "@frontend/ui";
import { requireSession } from "@/lib/auth";
import { listCollections } from "@/lib/collections/service";
import { findProject } from "@/lib/projects/service";

import { CreateCollectionForm } from "./create-collection-form";

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

  const collections = await listCollections(session.user.tenantId, projectId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="link link-primary text-sm">
          ← All projects
        </Link>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <p className="text-base-content/60 font-mono text-xs">{project.slug}</p>
      </div>

      {collections.length === 0 ? (
        <Card className="bg-base-100 max-w-md shadow">
          <CardBody className="gap-4">
            <CardTitle className="text-base">
              Create your first collection
            </CardTitle>
            <p className="text-base-content/70 text-sm">
              A collection is a content type — a Blog Post, an Author, a Product
              — with its own fields. Entries are authored against it.
            </p>
            <CreateCollectionForm projectId={projectId} />
          </CardBody>
        </Card>
      ) : (
        <>
          <h2 className="text-base font-semibold">Collections</h2>

          <ul className="grid gap-4 sm:grid-cols-2">
            {collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={`/dashboard/${projectId}/${collection.id}`}
                  className="block no-underline"
                >
                  <Card className="bg-base-100 hover:border-primary border-base-content/10 border shadow-sm transition-colors">
                    <CardBody>
                      <CardTitle className="text-base">
                        {collection.name}
                      </CardTitle>
                      <p className="text-base-content/60 font-mono text-xs">
                        {collection.slug}
                      </p>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Card className="bg-base-100 max-w-md shadow-sm">
            <CardBody className="gap-3">
              <CardTitle className="text-base">New collection</CardTitle>
              <CreateCollectionForm projectId={projectId} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
