import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

let cachedKey: Buffer | undefined;

/**
 * The app-level master key used to encrypt tenant-provided secrets at rest.
 *
 * Validated eagerly (on first use, not per-call) so a missing or malformed
 * key fails fast rather than surfacing as an obscure error the first time a
 * tenant saves a secret.
 */
function masterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.MEDIA_CONFIG_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MEDIA_CONFIG_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `MEDIA_CONFIG_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }

  cachedKey = key;
  return key;
}

/**
 * Encrypts `plaintext` with AES-256-GCM under the app master key.
 *
 * Returns `<iv>:<authTag>:<ciphertext>`, each segment base64-encoded. The IV
 * is random per call, so encrypting the same plaintext twice yields different
 * output — expected, not a bug.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a value produced by `encrypt`. Throws if the ciphertext or auth
 * tag was tampered with, or if the value is malformed.
 */
export function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext: expected `<iv>:<tag>:<data>`.");
  }
  const [ivPart, tagPart, dataPart] = parts as [string, string, string];

  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(tagPart, "base64");
  const ciphertext = Buffer.from(dataPart, "base64");

  const decipher = createDecipheriv(ALGORITHM, masterKey(), iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
