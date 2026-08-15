import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { Badge, Button, Card, CardBody, CardTitle } from "@frontend/ui";
import { requireSession } from "@/lib/auth";
import { findCollection, listFields } from "@/lib/collections/service";
import { listEntries } from "@/lib/entries/service";
import { findProject } from "@/lib/projects/service";

type Params = {
  params: Promise<{ projectId: string; collectionId: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const session = await requireSession();
  if (!session) return { title: "Collection" };

  const { projectId, collectionId } = await params;
  const collection = await findCollection(
    session.user.tenantId,
    projectId,
    collectionId,
  );

  return { title: collection?.name ?? "Collection" };
}

export default async function CollectionPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId, collectionId } = await params;
  const tenantId = session.user.tenantId;

  const project = await findProject(tenantId, projectId);
  if (!project) notFound();

  // Containment: this collection must belong to the addressed project.
  const collection = await findCollection(tenantId, projectId, collectionId);
  if (!collection) notFound();

  const fields = await listFields(tenantId, collectionId);
  const entries = await listEntries(tenantId, collectionId);

  const base = `/dashboard/${projectId}/${collectionId}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/dashboard/${projectId}`} className="link link-primary text-sm">
          ← {project.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{collection.name}</h1>
            <p className="text-base-content/60 font-mono text-xs">
              {collection.slug}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`${base}/fields`} className="no-underline">
              <Button type="button" variant="outline" size="sm">
                Fields ({fields.length})
              </Button>
            </Link>
            {fields.length > 0 ? (
              <Link href={`${base}/new`} className="no-underline">
                <Button type="button" size="sm">
                  New entry
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {fields.length === 0 ? (
        <Card className="bg-base-100 max-w-lg shadow-sm">
          <CardBody className="gap-3">
            <CardTitle className="text-base">Define the fields first</CardTitle>
            <p className="text-base-content/70 text-sm">
              An entry is a set of values, one per field. Add at least one field
              before authoring content.
            </p>
            <div>
              <Link href={`${base}/fields`} className="no-underline">
                <Button type="button" size="sm">
                  Add fields
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : entries.length === 0 ? (
        <Card className="bg-base-100 max-w-lg shadow-sm">
          <CardBody className="gap-3">
            <CardTitle className="text-base">Create your first entry</CardTitle>
            <p className="text-base-content/70 text-sm">
              Nothing has been authored in {collection.name} yet.
            </p>
            <div>
              <Link href={`${base}/new`} className="no-underline">
                <Button type="button" size="sm">
                  New entry
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link href={`${base}/${entry.id}`} className="block no-underline">
                <Card className="bg-base-100 hover:border-primary border-base-content/10 border shadow-sm transition-colors">
                  <CardBody className="flex-row items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {entry.title}
                      </span>
                      <span className="text-base-content/60 font-mono text-xs">
                        {entry.slug}
                      </span>
                    </div>
                    <Badge
                      tone={entry.status === "published" ? "success" : "neutral"}
                    >
                      {entry.status}
                    </Badge>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
