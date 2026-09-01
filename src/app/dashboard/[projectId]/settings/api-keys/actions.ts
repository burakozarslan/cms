"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { requireSession } from "@/lib/auth";

export type CreateApiKeyState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** The raw token, present only in the response to the create that minted
   *  it — never re-derivable afterwards. */
  createdToken?: string;
  createdName?: string;
};

export async function createApiKeyAction(
  _prev: CreateApiKeyState,
  formData: FormData,
): Promise<CreateApiKeyState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const name = formData.get("name");

  const result = await createApiKey(
    session.user.tenantId,
    projectId,
    session.user.id,
    name,
  );

  if (!result.ok) {
    if (result.error === "NOT_FOUND") {
      return { error: "That project could not be found." };
    }
    return { fieldErrors: result.fieldErrors };
  }

  revalidatePath(`/dashboard/${projectId}/settings/api-keys`);
  return { createdToken: result.token, createdName: result.apiKey.name };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const projectId = String(formData.get("projectId") ?? "");
  const keyId = String(formData.get("keyId") ?? "");

  await revokeApiKey(session.user.tenantId, projectId, keyId);

  revalidatePath(`/dashboard/${projectId}/settings/api-keys`);
}
