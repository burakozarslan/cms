import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Card, CardBody, CardTitle } from "@frontend/ui";
import { requireSession } from "@/lib/auth";
import {
  countCollectionsAndEntriesByProject,
  listProjects,
} from "@/lib/projects/service";

import { CreateProjectForm } from "./create-project-form";
import { ProjectCard } from "./project-card";

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
              <ProjectCard project={project} counts={counts} />
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
