import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Button, Card, CardBody, CardTitle, ConfirmDialog } from "@frontend/ui";
import { requireSession } from "@/lib/auth";
import {
  countCollectionsAndEntriesByProject,
  listProjects,
} from "@/lib/projects/service";

import { deleteProjectAction } from "./actions";
import { CreateProjectForm } from "./create-project-form";

export const metadata: Metadata = { title: "Projects" };

export default async function DashboardPage() {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projects = await listProjects(session.user.tenantId);
  const contentCounts = await Promise.all(
    projects.map((project) =>
      countCollectionsAndEntriesByProject(session.user.tenantId, project.id),
    ),
  );

  if (projects.length === 0) {
    return (
      <Card className="bg-base-100 mx-auto max-w-md shadow">
        <CardBody className="gap-4">
          <CardTitle>Create your first project</CardTitle>
          <p className="text-base-content/70 text-sm">
            A project is an independent content silo — a personal blog, a
            business site — with its own content and its own API.
          </p>
          <CreateProjectForm submitLabel="Create project" />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Projects</h1>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((project, index) => {
          const counts = contentCounts[index];

          return (
            <li key={project.id}>
              <Card className="bg-base-100 hover:border-primary border-base-content/10 border shadow-sm transition-colors">
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/${project.id}`}
                      className="block flex-1 no-underline"
                    >
                      <CardTitle className="text-base">
                        {project.name}
                      </CardTitle>
                      <p className="text-base-content/60 font-mono text-xs">
                        {project.slug}
                      </p>
                    </Link>

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
                            {counts.collections === 1
                              ? "collection"
                              : "collections"}
                          </strong>{" "}
                          and{" "}
                          <strong>
                            {counts.entries}{" "}
                            {counts.entries === 1 ? "entry" : "entries"}
                          </strong>
                          . This cannot be undone.
                        </>
                      ) : (
                        <>
                          This project has no collections yet, so nothing else
                          is affected.
                        </>
                      )}
                    </ConfirmDialog>
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="bg-base-100 max-w-md shadow-sm">
        <CardBody className="gap-3">
          <CardTitle className="text-base">New project</CardTitle>
          <CreateProjectForm />
        </CardBody>
      </Card>
    </div>
  );
}
