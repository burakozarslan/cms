"use server";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { changePassword } from "@/lib/auth/change-password";

export type ChangePasswordState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
};

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const result = await changePassword(session.user.id, {
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });

  if (!result.ok) {
    if (result.error === "INCORRECT_PASSWORD") {
      return { error: "Your current password is incorrect." };
    }
    return { fieldErrors: result.fieldErrors };
  }

  // The session JWT only ever carries `userId`/`tenantId` (see
  // `src/lib/auth/config.ts`) — it never encodes the password hash, so the
  // current session stays valid with no re-sign step here.
  return { success: true };
}
