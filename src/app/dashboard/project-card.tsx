"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, Card, CardBody, CardTitle, ConfirmDialog } from "@frontend/ui";

import { deleteProjectAction } from "./actions";
import { RenameProjectForm } from "./rename-project-form";

export function ProjectCard({
  project,
  counts,
}: {
  project: { id: string; name: string; slug: string };
  counts: { collections: number; entries: number };
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card className="bg-base-100 hover:border-primary border-base-content/10 border shadow-sm transition-colors">
      <CardBody>
        {editing ? (
          <RenameProjectForm
            projectId={project.id}
            name={project.name}
            onDone={() => setEditing(false)}
          />
        ) : (
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/dashboard/${project.id}`}
              className="block flex-1 no-underline"
            >
              <CardTitle className="text-base">{project.name}</CardTitle>
              <p className="text-base-content/60 font-mono text-xs">
                {project.slug}
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
                title={`Delete "${project.name}"?`}
                confirmLabel="Delete project"
                destructive
                action={deleteProjectAction}
                hidden={{ projectId: project.id }}
              >
                {counts.collections > 0 || counts.entries > 0 ? (
                  <>
                    This will permanently delete{" "}
                    <strong>
                      {counts.collections}{" "}
                      {counts.collections === 1 ? "collection" : "collections"}
                    </strong>{" "}
                    and{" "}
                    <strong>
                      {counts.entries} {counts.entries === 1 ? "entry" : "entries"}
                    </strong>
                    . This cannot be undone.
                  </>
                ) : (
                  <>
                    This project has no collections yet, so nothing else is
                    affected.
                  </>
                )}
              </ConfirmDialog>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
