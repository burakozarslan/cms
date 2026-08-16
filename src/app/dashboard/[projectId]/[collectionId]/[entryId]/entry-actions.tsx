"use client";

import { Badge, Button, ConfirmDialog } from "@frontend/ui";

import { deleteEntryAction, setEntryStatusAction } from "../actions";

/**
 * Publish/unpublish and delete.
 *
 * A client island only because the delete confirmation needs one; the status
 * toggle is an ordinary form post.
 */
export function EntryActions({
  projectId,
  collectionId,
  entryId,
  status,
  title,
  referencingCount,
}: {
  projectId: string;
  collectionId: string;
  entryId: string;
  status: string;
  title: string;
  /** How many other entries reference this one through a relationship field. */
  referencingCount: number;
}) {
  const published = status === "published";
  const ids = { projectId, collectionId, entryId };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={published ? "success" : "neutral"}>{status}</Badge>

      <form action={setEntryStatusAction}>
        {Object.entries(ids).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input
          type="hidden"
          name="status"
          value={published ? "draft" : "published"}
        />
        <Button type="submit" size="sm" variant={published ? "outline" : "primary"}>
          {published ? "Unpublish" : "Publish"}
        </Button>
      </form>

      <ConfirmDialog
        trigger={
          <Button type="button" size="sm" variant="ghost">
            Delete
          </Button>
        }
        title={`Delete “${title}”?`}
        confirmLabel="Delete entry"
        destructive
        action={deleteEntryAction}
        hidden={ids}
      >
        This permanently deletes the entry and every value stored against it.
        The collection&rsquo;s fields are unaffected.
        {referencingCount > 0 ? (
          <>
            {" "}
            <strong>
              {referencingCount} other{" "}
              {referencingCount === 1 ? "entry" : "entries"}
            </strong>{" "}
            reference this one through a relationship field; those references
            will break.
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
