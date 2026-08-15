import { randomUUID } from "node:crypto";

import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { getRootDb } from "@/lib/db/client";
import { credentialsSchema } from "@/lib/validation/auth";

export type RegisterResult =
  | { ok: true; userId: string; tenantId: string; email: string }
  | { ok: false; error: "EMAIL_TAKEN" }
  | { ok: false; error: "INVALID"; fieldErrors: Record<string, string[]> };

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed/i.test(error.message)
  );
}

/**
 * Register a new account.
 *
 * A user maps 1:1 to a tenant, so registration creates both, in one
 * transaction — a user without a tenant would have nowhere to put data, and a
 * tenant without a user would be unreachable.
 *
 * `tenants` and `users` are identity tables rather than tenant-owned content,
 * and no tenant context exists yet, so this is one of the few places the root
 * handle is correct.
 */
export async function registerTenant(input: unknown): Promise<RegisterResult> {
  const parsed = credentialsSchema.safeParse(input);
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

  const { email, password } = parsed.data;
  const db = getRootDb();

  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (existing) return { ok: false, error: "EMAIL_TAKEN" };

  const tenantId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("tenants")
        .values({ id: tenantId, name: email.split("@")[0] })
        .execute();

      await trx
        .insertInto("users")
        .values({
          id: userId,
          tenant_id: tenantId,
          email,
          password_hash: passwordHash,
        })
        .execute();
    });
  } catch (error) {
    // The unique index is the real guard: two concurrent registrations can both
    // pass the check above.
    if (isUniqueViolation(error)) return { ok: false, error: "EMAIL_TAKEN" };
    throw error;
  }

  return { ok: true, userId, tenantId, email };
}
