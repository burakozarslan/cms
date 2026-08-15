"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { createProject, deleteProject } from "@/lib/projects/service";

export type CreateProjectState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createProjectAction(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const result = await createProject(session.user.tenantId, {
    name: formData.get("name"),
  });

  if (!result.ok) return { fieldErrors: result.fieldErrors };

  revalidatePath("/dashboard");
  redirect(`/dashboard/${result.project.id}`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");

  await deleteProject(session.user.tenantId, projectId);

  revalidatePath("/dashboard");
}
