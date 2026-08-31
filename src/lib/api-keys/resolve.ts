import { getRootDb } from "@/lib/db/client";

import { parseToken, secretMatches, type ApiKeyMode } from "./token";

/**
 * The single `getRootDb()` carve-out for `api_keys` (design decision 4).
 *
 * `api_keys` is tenant-owned content — it lives in `TENANT_SCOPED_TABLES` and
 * every dashboard access goes through `getTenantDb(tenantId)` like any other
 * tenant table. But authenticating a content-API request is the opposite
 * direction: a caller presents a token, and *resolving* the tenant is the
 * whole point — there is no `tenantId` yet to scope a handle with (the
 * chicken-and-egg design.md draws out). This mirrors how
 * `src/lib/auth/authorize.ts` reads `users` unscoped at login.
 *
 * This module selects only from `api_keys`, by `key_id`, and returns
 * identifiers and credential metadata alone — never content. Every downstream
 * content read goes through `getTenantDb(tenantId)` once the caller has these
 * identifiers.
 */

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export type ResolvedApiKey = {
  tenantId: string;
  projectId: string;
  keyId: string;
  mode: ApiKeyMode;
};

/**
 * Resolve a presented token to its owning tenant and project.
 *
 * Returns `undefined` for every failure mode — malformed token, unknown
 * `keyId`, wrong secret, revoked, expired — so nothing about the response
 * distinguishes one from another to a caller.
 */
export async function resolveApiKey(
  raw: string,
): Promise<ResolvedApiKey | undefined> {
  const parsed = parseToken(raw);
  if (!parsed) return undefined;

  const row = await getRootDb()
    .selectFrom("api_keys")
    .select([
      "tenant_id",
      "project_id",
      "key_id",
      "mode",
      "secret_hash",
      "revoked_at",
      "expires_at",
    ])
    .where("key_id", "=", parsed.keyId)
    .executeTakeFirst();

  if (!row) return undefined;
  if (!secretMatches(parsed.secret, row.secret_hash)) return undefined;
  if (row.revoked_at !== null) return undefined;
  if (row.expires_at !== null && Date.parse(row.expires_at) <= Date.now()) {
    return undefined;
  }

  return {
    tenantId: row.tenant_id,
    projectId: row.project_id,
    keyId: row.key_id,
    mode: row.mode as ApiKeyMode,
  };
}

/**
 * Record that a key was just used, throttled to at most once per five
 * minutes (design decision 13) — better-sqlite3 has a single writer, and an
 * unconditional write on every read request would contend with real content
 * writes for no benefit at this column's five-minute-resolution purpose.
 *
 * One conditional UPDATE, no preceding read: the WHERE clause itself decides
 * whether the stored value is stale enough to replace.
 */
export async function touchLastUsed(keyId: string): Promise<void> {
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - LAST_USED_THROTTLE_MS);

    await getRootDb()
      .updateTable("api_keys")
      .set({ last_used_at: now.toISOString() })
      .where("key_id", "=", keyId)
      .where((eb) =>
        eb.or([
          eb("last_used_at", "is", null),
          eb("last_used_at", "<", threshold.toISOString()),
        ]),
      )
      .execute();
  } catch (error) {
    // Telemetry must not fail a request (design decision 13).
    console.error(`Failed to record API key usage for ${keyId}:`, error);
  }
}
