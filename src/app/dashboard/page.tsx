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
      <Card className="bg-base-100 mx-auto max-w-md shadow-lg border-base-content/10 animate-fade-in-up">
        <CardBody className="gap-6 p-8">
          <div className="text-center">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Create your first project</CardTitle>
            <p className="text-base-content/70 mt-2">
              A project is an independent content silo — a personal blog, a
              business site — with its own content and its own API.
            </p>
          </div>
          <CreateProjectForm submitLabel="Create project" />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-base-content">Projects</h1>
          <p className="text-base-content/60 mt-1">Manage your headless CMS projects and spaces</p>
        </div>
      </div>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project, index) => {
          const counts = contentCounts[index];

          return (
            <li key={project.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
              <ProjectCard project={project} counts={counts} />
            </li>
          );
        })}
      </ul>

      <Card className="bg-base-100 max-w-md shadow-sm border-base-content/10 hover:shadow-md transition-shadow">
        <CardBody className="gap-4">
          <CardTitle className="text-lg">New project</CardTitle>
          <CreateProjectForm />
        </CardBody>
      </Card>
    </div>
  );
}
