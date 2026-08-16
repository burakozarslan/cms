import { z } from "zod";

import { getRootDb } from "@/lib/db/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/auth";

import { hashPassword, verifyPassword } from "./password";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    ),
});

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "INVALID"; fieldErrors: Record<string, string[]> }
  | { ok: false; error: "INCORRECT_PASSWORD" };

/**
 * Change the acting user's password.
 *
 * `userId` must come from the session, never from request input. A single
 * generic `INCORRECT_PASSWORD` error covers both "wrong password" and "no
 * such user" so the form cannot distinguish them.
 */
export async function changePassword(
  userId: string,
  input: unknown,
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { currentPassword, newPassword } = parsed.data;
  const db = getRootDb();

  const user = await db
    .selectFrom("users")
    .select(["id", "password_hash"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    return { ok: false, error: "INCORRECT_PASSWORD" };
  }

  const password_hash = await hashPassword(newPassword);
  await db
    .updateTable("users")
    .set({ password_hash })
    .where("id", "=", userId)
    .execute();

  return { ok: true };
}
