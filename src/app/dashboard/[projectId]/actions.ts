"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { createCollection, deleteCollection } from "@/lib/collections/service";

export type CreateCollectionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createCollectionAction(
  _prev: CreateCollectionState,
  formData: FormData,
): Promise<CreateCollectionState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  // projectId travels in the form, but it only ever narrows what the acting
  // tenant can reach — the tenant itself comes from the session.
  const projectId = String(formData.get("projectId") ?? "");

  const result = await createCollection(session.user.tenantId, projectId, {
    name: formData.get("name"),
  });

  if (!result.ok) {
    return result.error === "NOT_FOUND"
      ? { error: "That project could not be found." }
      : { fieldErrors: result.fieldErrors };
  }

  revalidatePath(`/dashboard/${projectId}`);
  redirect(`/dashboard/${projectId}/${result.collection.id}/fields`);
}

export async function deleteCollectionAction(
  formData: FormData,
): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");

  await deleteCollection(session.user.tenantId, projectId, collectionId);

  revalidatePath(`/dashboard/${projectId}`);
}
