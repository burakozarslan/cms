import { v2 as cloudinary } from "cloudinary";

import { getMediaCredentials, recordConnectionCheck } from "./service";

export type CheckConnectionResult =
  | { ok: true }
  | { ok: false; reason: "NOT_CONFIGURED" | "CHECK_FAILED" };

/**
 * Verifies the tenant's saved Cloudinary credentials by calling the Admin
 * API's `ping` endpoint — a single authenticated, side-effect-free request.
 *
 * Credentials are passed per-call via `options` rather than
 * `cloudinary.config(...)`, so concurrent checks for different tenants in the
 * same server process never race on shared global SDK state.
 */
export async function checkMediaConnection(
  tenantId: string,
): Promise<CheckConnectionResult> {
  const credentials = await getMediaCredentials(tenantId);
  if (!credentials) return { ok: false, reason: "NOT_CONFIGURED" };

  try {
    await cloudinary.api.ping({
      cloud_name: credentials.cloudName,
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
    });

    await recordConnectionCheck(tenantId, true);
    return { ok: true };
  } catch {
    // Deliberately swallow the underlying error (invalid credentials,
    // network failure, timeout) — it may echo back request details and must
    // never reach the client. The UI only needs pass/fail.
    await recordConnectionCheck(tenantId, false);
    return { ok: false, reason: "CHECK_FAILED" };
  }
}
