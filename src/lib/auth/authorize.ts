import type { User } from "next-auth";

import { getRootDb } from "@/lib/db/client";
import { loginSchema } from "@/lib/validation/auth";

import { burnPasswordComparison, verifyPassword } from "./password";

/**
 * Verify submitted credentials.
 *
 * Returns `null` for every failure — unknown email, wrong password, malformed
 * input — so the caller cannot tell them apart and neither can the user.
 */
export async function authorizeCredentials(
  raw: unknown,
): Promise<User | null> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;

  // `users` is an identity table, not tenant-owned: no tenant context exists
  // yet at login, so the root handle is the correct one here.
  const user = await getRootDb()
    .selectFrom("users")
    .select(["id", "email", "password_hash", "tenant_id"])
    .where("email", "=", email)
    .executeTakeFirst();

  if (!user) {
    // Spend comparable time so response latency does not reveal which emails
    // are registered.
    await burnPasswordComparison(password);
    return null;
  }

  if (!(await verifyPassword(password, user.password_hash))) return null;

  return {
    id: user.id,
    email: user.email,
    tenantId: user.tenant_id,
  };
}
