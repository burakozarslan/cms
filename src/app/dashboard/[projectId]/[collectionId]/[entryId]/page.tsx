import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { Card, CardBody } from "@frontend/ui";
import { requireSession } from "@/lib/auth";
import {
  ENTRY_TITLE_PLACEHOLDER,
  findCollection,
  listFields,
  resolveTitleField,
} from "@/lib/collections/service";
import { countEntriesReferencing, findEntry } from "@/lib/entries/service";

import { EntryForm } from "../entry-form";
import { EntryActions } from "./entry-actions";

type Params = {
  params: Promise<{
    projectId: string;
    collectionId: string;
    entryId: string;
  }>;
};

export const metadata: Metadata = { title: "Entry" };

export default async function EntryPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId, collectionId, entryId } = await params;
  const tenantId = session.user.tenantId;

  // Each step verifies containment as well as ownership: a collection under the
  // wrong project, or an entry under the wrong collection, resolves to nothing.
  const collection = await findCollection(tenantId, projectId, collectionId);
  if (!collection) notFound();

  const entry = await findEntry(tenantId, collectionId, entryId);
  if (!entry) notFound();

  const fields = await listFields(tenantId, collectionId);
  const referencingCount = await countEntriesReferencing(tenantId, entry.id);

  const titleField = resolveTitleField(collection, fields);
  const titleValue = titleField ? entry.values[titleField.id] : undefined;
  const title =
    typeof titleValue === "string" && titleValue.trim() !== ""
      ? titleValue.trim()
      : entry.slug || ENTRY_TITLE_PLACEHOLDER;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/dashboard/${projectId}/${collectionId}`}
          className="link link-primary text-sm"
        >
          ← {collection.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{title}</h1>
            <p className="text-base-content/60 font-mono text-xs">
              {entry.slug}
            </p>
          </div>
          <EntryActions
            projectId={projectId}
            collectionId={collectionId}
            entryId={entry.id}
            status={entry.status}
            title={title}
            referencingCount={referencingCount}
          />
        </div>
      </div>

      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <EntryForm
            projectId={projectId}
            collectionId={collectionId}
            fields={fields}
            entry={{ id: entry.id, values: entry.values }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
