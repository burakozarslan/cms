/**
 * @jest-environment node
 *
 * Webhook signing: HMAC correctness and tamper detection. Covers
 * webhook-delivery's "Delivery payloads are signed and verifiable".
 */
import {
  generateWebhookSecret,
  signPayload,
  verifySignature,
  webhookSecretPrefix,
} from "@/lib/webhooks/secret";

describe("generateWebhookSecret", () => {
  it("produces a whsec_-prefixed secret, unique per call", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();

    expect(a).toMatch(/^whsec_.+/);
    expect(a).not.toBe(b);
  });
});

describe("webhookSecretPrefix", () => {
  it("masks everything past a short prefix", () => {
    const secret = generateWebhookSecret();
    const prefix = webhookSecretPrefix(secret);

    expect(prefix.endsWith("…")).toBe(true);
    expect(prefix.length).toBeLessThan(secret.length);
    expect(secret.startsWith(prefix.slice(0, -1))).toBe(true);
  });
});

describe("signPayload / verifySignature", () => {
  it("recomputing the HMAC over the same body and secret matches", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ event: "entry.published", entryId: "e1" });

    const signature = signPayload(secret, body);

    expect(verifySignature(secret, body, signature)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ event: "entry.published", entryId: "e1" });
    const signature = signPayload(secret, body);

    const tampered = JSON.stringify({ event: "entry.published", entryId: "e2" });

    expect(verifySignature(secret, tampered, signature)).toBe(false);
  });

  it("rejects a signature produced with a different secret", () => {
    const body = JSON.stringify({ event: "entry.published" });
    const signature = signPayload(generateWebhookSecret(), body);

    expect(verifySignature(generateWebhookSecret(), body, signature)).toBe(false);
  });

  it("rejects a malformed signature string without throwing", () => {
    const secret = generateWebhookSecret();
    expect(verifySignature(secret, "{}", "not-hex")).toBe(false);
  });
});
