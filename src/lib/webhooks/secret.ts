import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "whsec";
const PREFIX_VISIBLE_CHARS = 8;

/**
 * Mint a new webhook signing secret: `whsec_<44 base64url chars>`.
 *
 * Unlike an API key's secret (hashed — only ever compared), this must be
 * retrievable in plaintext at delivery time to compute the outbound HMAC, so
 * it is encrypted at rest with `src/lib/crypto`, not hashed (design.md,
 * "Secret storage: encrypted, not hashed").
 */
export function generateWebhookSecret(): string {
  return `${PREFIX}_${randomBytes(32).toString("base64url")}`;
}

/** The masked form shown in the list after creation — never the full secret. */
export function webhookSecretPrefix(secret: string): string {
  return `${secret.slice(0, PREFIX.length + 1 + PREFIX_VISIBLE_CHARS)}…`;
}

/** Hex HMAC-SHA256 of `rawBody` under `secret`, as sent in `X-Webhook-Signature`. */
export function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Constant-time verification, for tests and any future receiver-side helper. */
export function verifySignature(
  secret: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signPayload(secret, rawBody), "hex");
  let presented: Buffer;
  try {
    presented = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}
