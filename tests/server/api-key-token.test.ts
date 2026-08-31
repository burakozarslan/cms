/**
 * @jest-environment node
 *
 * Token minting, parsing, and secret comparison — no database access. Covers
 * `api-key-management` → "A token identifies its own record".
 */
import {
  displayPrefix,
  hashSecret,
  mintToken,
  parseToken,
  secretMatches,
} from "@/lib/api-keys/token";

describe("mintToken / parseToken round-trip", () => {
  it("parses a freshly minted token back to its own keyId and mode", () => {
    const minted = mintToken("live");
    const parsed = parseToken(minted.token);

    expect(parsed).toEqual({
      mode: "live",
      keyId: minted.keyId,
      secret: expect.any(String),
    });
  });

  it("the parsed secret hashes to the minted secretHash", () => {
    const minted = mintToken("live");
    const parsed = parseToken(minted.token);

    expect(parsed).toBeDefined();
    expect(hashSecret(parsed!.secret)).toBe(minted.secretHash);
  });

  it("mints a distinct keyId and secret on every call", () => {
    const a = mintToken("live");
    const b = mintToken("live");

    expect(a.keyId).not.toBe(b.keyId);
    expect(a.token).not.toBe(b.token);
  });

  it("survives a secret segment that itself contains an underscore", () => {
    // base64url's alphabet includes `_`; a naive split("_") would fragment
    // the secret. Mint until one lands, rather than asserting on a
    // hand-crafted string that might not match this build's encoding.
    let found: ReturnType<typeof mintToken> | undefined;
    for (let i = 0; i < 200 && !found; i++) {
      const candidate = mintToken("live");
      if (candidate.token.split("_").length > 4) found = candidate;
    }

    expect(found).toBeDefined();
    expect(parseToken(found!.token)).toEqual({
      mode: "live",
      keyId: found!.keyId,
      secret: expect.any(String),
    });
  });
});

describe("parseToken rejects malformed tokens without touching the database", () => {
  it.each([
    ["wrong prefix", "notcms_live_0123456789abcdef_somesecret"],
    ["wrong segment count", "cms_live_0123456789abcdef"],
    ["unknown mode", "cms_draft_0123456789abcdef_somesecret"],
    ["truncated keyId", "cms_live_abc_somesecret"],
    ["keyId with non-hex characters", "cms_live_zzzzzzzzzzzzzzzz_somesecret"],
    ["empty secret", "cms_live_0123456789abcdef_"],
    ["empty string", ""],
  ])("%s", (_label, raw) => {
    expect(parseToken(raw)).toBeUndefined();
  });
});

describe("secretMatches", () => {
  it("accepts the correct secret", () => {
    const minted = mintToken("live");
    const parsed = parseToken(minted.token)!;

    expect(secretMatches(parsed.secret, minted.secretHash)).toBe(true);
  });

  it("rejects a near-miss secret", () => {
    const minted = mintToken("live");
    const parsed = parseToken(minted.token)!;
    const tampered = parsed.secret.slice(0, -1) + (parsed.secret.at(-1) === "A" ? "B" : "A");

    expect(secretMatches(tampered, minted.secretHash)).toBe(false);
  });

  it("rejects a secret from a different key", () => {
    const a = mintToken("live");
    const b = mintToken("live");

    expect(secretMatches(parseToken(b.token)!.secret, a.secretHash)).toBe(false);
  });
});

describe("displayPrefix", () => {
  it("derives the same prefix the token starts with", () => {
    const minted = mintToken("live");

    expect(minted.token.startsWith(displayPrefix(minted.mode, minted.keyId))).toBe(
      true,
    );
  });
});
