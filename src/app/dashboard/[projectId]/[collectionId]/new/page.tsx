import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { Card, CardBody, CardTitle } from "@frontend/ui";
import { requireSession } from "@/lib/auth";
import { findCollection, listFields } from "@/lib/collections/service";

import { EntryForm } from "../entry-form";

type Params = {
  params: Promise<{ projectId: string; collectionId: string }>;
};

export const metadata: Metadata = { title: "New entry" };

/**
 * Sits alongside `[entryId]`. A static segment wins over a dynamic one in the
 * App Router, and entry ids are UUIDs, so "new" can never shadow a real entry.
 */
export default async function NewEntryPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId, collectionId } = await params;
  const tenantId = session.user.tenantId;

  const collection = await findCollection(tenantId, projectId, collectionId);
  if (!collection) notFound();

  const fields = await listFields(tenantId, collectionId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/dashboard/${projectId}/${collectionId}`}
          className="link link-primary text-sm"
        >
          ← {collection.name}
        </Link>
        <h1 className="text-xl font-semibold">New entry</h1>
      </div>

      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <CardTitle className="text-base">{collection.name}</CardTitle>
          <EntryForm
            projectId={projectId}
            collectionId={collectionId}
            fields={fields}
          />
        </CardBody>
      </Card>
    </div>
  );
}
