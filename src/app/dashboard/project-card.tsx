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
    <Card className="bg-base-100 hover:border-primary/50 hover:shadow-lg border-base-content/10 border shadow-sm transition-all duration-300 transform hover:-translate-y-1">
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
              className="block flex-1 no-underline group"
            >
              <CardTitle className="text-lg group-hover:text-primary transition-colors">{project.name}</CardTitle>
              <p className="text-base-content/60 font-mono text-xs mt-1 bg-base-200/50 inline-block px-2 py-0.5 rounded">
                {project.slug}
              </p>
            </Link>

            <div className="flex shrink-0 items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
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
                  <Button type="button" variant="ghost" size="xs" className="hover:text-error hover:bg-error/10">
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
                    <strong className="text-error">
                      {counts.collections}{" "}
                      {counts.collections === 1 ? "collection" : "collections"}
                    </strong>{" "}
                    and{" "}
                    <strong className="text-error">
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
