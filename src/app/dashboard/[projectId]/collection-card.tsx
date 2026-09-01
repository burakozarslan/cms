"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, Card, CardBody, CardTitle, ConfirmDialog } from "@frontend/ui";

import { deleteCollectionAction } from "./actions";
import { RenameCollectionForm } from "./rename-collection-form";

export function CollectionCard({
  projectId,
  collection,
  entryCount,
  relationshipFieldCount,
}: {
  projectId: string;
  collection: { id: string; name: string; slug: string };
  entryCount: number;
  relationshipFieldCount: number;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card className="bg-base-100 hover:border-primary border-base-content/10 border shadow-sm transition-colors">
      <CardBody>
        {editing ? (
          <RenameCollectionForm
            projectId={projectId}
            collectionId={collection.id}
            name={collection.name}
            onDone={() => setEditing(false)}
          />
        ) : (
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/dashboard/${projectId}/${collection.id}`}
              className="block flex-1 no-underline"
            >
              <CardTitle className="text-base">{collection.name}</CardTitle>
              <p className="text-base-content/60 font-mono text-xs">
                {collection.slug}
              </p>
            </Link>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>

              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="xs">
                    Delete
                  </Button>
                }
                title={`Delete "${collection.name}"?`}
                confirmLabel="Delete collection"
                destructive
                action={deleteCollectionAction}
                hidden={{ projectId, collectionId: collection.id }}
              >
                {entryCount > 0 ? (
                  <>
                    This will permanently delete{" "}
                    <strong>
                      {entryCount} {entryCount === 1 ? "entry" : "entries"}
                    </strong>
                    . This cannot be undone.
                  </>
                ) : (
                  <>
                    No entries exist in this collection yet, so nothing else
                    is affected.
                  </>
                )}
                {relationshipFieldCount > 0 ? (
                  <>
                    {" "}
                    <strong>
                      {relationshipFieldCount}{" "}
                      {relationshipFieldCount === 1
                        ? "relationship field"
                        : "relationship fields"}
                    </strong>{" "}
                    in other collections target this collection and will stop
                    working.
                  </>
                ) : null}
              </ConfirmDialog>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
