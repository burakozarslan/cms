import { z } from "zod";

import { decrypt, encrypt } from "@/lib/crypto";
import { getTenantDb } from "@/lib/db/client";

export const mediaConfigInputSchema = z.object({
  cloudName: z
    .string()
    .trim()
    .min(1, "Enter your Cloudinary cloud name.")
    .max(200, "Cloud name is limited to 200 characters."),
  apiKey: z
    .string()
    .trim()
    .min(1, "Enter your Cloudinary API key.")
    .max(200, "API key is limited to 200 characters."),
  // Blank means "keep the existing secret" on an update — only required when
  // no configuration exists yet. Validated conditionally in saveMediaConfig.
  apiSecret: z
    .string()
    .trim()
    .max(500, "API secret is limited to 500 characters.")
    .optional(),
});

export type MediaConfigStatus = {
  configured: boolean;
  cloudName: string | null;
  apiKey: string | null;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
};

/**
 * The tenant's media configuration for display purposes only — never
 * includes the decrypted (or encrypted) `api_secret`.
 */
export async function getMediaConfigStatus(
  tenantId: string,
): Promise<MediaConfigStatus> {
  const row = await getTenantDb(tenantId)
    .selectFrom("tenant_media_config")
    .select(["cloud_name", "api_key", "last_checked_at", "last_check_ok"])
    .executeTakeFirst();

  if (!row) {
    return {
      configured: false,
      cloudName: null,
      apiKey: null,
      lastCheckedAt: null,
      lastCheckOk: null,
    };
  }

  return {
    configured: true,
    cloudName: row.cloud_name,
    apiKey: row.api_key,
    lastCheckedAt: row.last_checked_at,
    lastCheckOk: row.last_check_ok === null ? null : row.last_check_ok === 1,
  };
}

export type SaveMediaConfigResult =
  | { ok: true }
  | { ok: false; error: "INVALID"; fieldErrors: Record<string, string[]> };

/**
 * Saves the tenant's Cloudinary configuration.
 *
 * A blank `apiSecret` on an existing configuration preserves the previously
 * saved (encrypted) secret rather than clearing it — the settings form never
 * round-trips the real secret to the client, so "blank" is indistinguishable
 * from "user didn't intend to change it". A non-blank `apiSecret` rotates the
 * stored value. Saving always clears the last connection-check result, since
 * it no longer reflects the (possibly changed) credentials.
 */
export async function saveMediaConfig(
  tenantId: string,
  input: unknown,
): Promise<SaveMediaConfigResult> {
  const parsed = mediaConfigInputSchema.safeParse(input);
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

  const { cloudName, apiKey, apiSecret } = parsed.data;
  const db = getTenantDb(tenantId);
  const now = new Date().toISOString();

  if (!apiSecret) {
    // Blank secret only makes sense as an update to an already-saved config
    // — there's nothing to preserve on a first save. `numUpdatedRows` tells
    // us whether a row existed without a separate (racy) existence check.
    const result = await db
      .updateTable("tenant_media_config")
      .set({
        cloud_name: cloudName,
        api_key: apiKey,
        last_checked_at: null,
        last_check_ok: null,
        updated_at: now,
      })
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      return {
        ok: false,
        error: "INVALID",
        fieldErrors: { apiSecret: ["Enter your Cloudinary API secret."] },
      };
    }

    return { ok: true };
  }

  const apiSecretEnc = encrypt(apiSecret);

  // tenant_id is injected by the tenant-scoped handle; ON CONFLICT targets
  // it directly since it's the table's primary key.
  await db
    .insertInto("tenant_media_config")
    .values({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret_enc: apiSecretEnc,
      last_checked_at: null,
      last_check_ok: null,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("tenant_id").doUpdateSet({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret_enc: apiSecretEnc,
        last_checked_at: null,
        last_check_ok: null,
        updated_at: now,
      }),
    )
    .execute();

  return { ok: true };
}

export type MediaCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

/**
 * Decrypted credentials for the tenant's Cloudinary account. Only ever call
 * this from server-only code that is about to use the credentials directly
 * (e.g. the connection check) — never to display them.
 */
export async function getMediaCredentials(
  tenantId: string,
): Promise<MediaCredentials | undefined> {
  const row = await getTenantDb(tenantId)
    .selectFrom("tenant_media_config")
    .select(["cloud_name", "api_key", "api_secret_enc"])
    .executeTakeFirst();

  if (!row) return undefined;

  return {
    cloudName: row.cloud_name,
    apiKey: row.api_key,
    apiSecret: decrypt(row.api_secret_enc),
  };
}

/** Persists the outcome of a connection check for display on next load. */
export async function recordConnectionCheck(
  tenantId: string,
  ok: boolean,
): Promise<void> {
  await getTenantDb(tenantId)
    .updateTable("tenant_media_config")
    .set({ last_checked_at: new Date().toISOString(), last_check_ok: ok ? 1 : 0 })
    .execute();
}
