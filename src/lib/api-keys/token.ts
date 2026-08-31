import { randomBytes, timingSafeEqual, createHash } from "node:crypto";

const PREFIX = "cms";
const MODES = ["live", "preview"] as const;
export type ApiKeyMode = (typeof MODES)[number];

const KEY_ID_HEX_LENGTH = 16; // randomBytes(8) as hex
const KEY_ID_PATTERN = new RegExp(`^[0-9a-f]{${KEY_ID_HEX_LENGTH}}$`);

function isMode(value: string): value is ApiKeyMode {
  return (MODES as readonly string[]).includes(value);
}

export type MintedToken = {
  token: string;
  keyId: string;
  secretHash: string;
  mode: ApiKeyMode;
};

/**
 * Mint a new token: `cms_<mode>_<keyId>_<secret>`.
 *
 * `keyId` is the indexed, non-secret lookup segment (design decision 2) — 16
 * hex chars from 8 random bytes. The secret is 32 random bytes, base64url
 * encoded, and is returned raw exactly once; only its SHA-256 hash is meant to
 * be persisted (see `hashSecret`).
 */
export function mintToken(mode: ApiKeyMode = "live"): MintedToken {
  const keyId = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const token = `${PREFIX}_${mode}_${keyId}_${secret}`;

  return { token, keyId, secretHash: hashSecret(secret), mode };
}

export type ParsedToken = {
  mode: ApiKeyMode;
  keyId: string;
  secret: string;
};

/**
 * Parse a presented token by structure alone — no database access. A
 * malformed token (wrong prefix, wrong segment count, wrong segment shape, an
 * unknown mode) is rejected here so it never reaches `resolve.ts`.
 */
export function parseToken(raw: string): ParsedToken | undefined {
  if (typeof raw !== "string") return undefined;

  // Split on the first three underscores only: base64url's alphabet includes
  // `_`, so the secret segment itself can legitimately contain one — a plain
  // `split("_")` would fragment it and reject an otherwise-valid token.
  const match = /^([^_]+)_([^_]+)_([^_]+)_(.+)$/.exec(raw);
  if (!match) return undefined;

  const [, prefix, mode, keyId, secret] = match;
  if (prefix !== PREFIX) return undefined;
  if (!isMode(mode)) return undefined;
  if (!KEY_ID_PATTERN.test(keyId)) return undefined;

  return { mode, keyId, secret };
}

/** SHA-256 hex digest of a token's secret segment. Never the secret itself. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Constant-time comparison of a presented secret against its stored digest.
 * Comparing hashes rather than secrets directly, so a non-constant-time
 * compare cannot leak the stored digest byte by byte.
 */
export function secretMatches(secret: string, storedHash: string): boolean {
  const presented = Buffer.from(hashSecret(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}

/**
 * The displayable prefix shown in the dashboard after creation — derived, not
 * stored, so it can never disagree with `mode`/`keyId` (design decision 2).
 */
export function displayPrefix(mode: string, keyId: string): string {
  return `${PREFIX}_${mode}_${keyId}`;
}
