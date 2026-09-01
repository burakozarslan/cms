/**
 * @jest-environment node
 */
const VALID_KEY = "v97uOic9/sbhtkB2rBdyys0hcKELLhdfW8hMCpcTBi8=";

describe("crypto", () => {
  const originalKey = process.env.MEDIA_CONFIG_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.MEDIA_CONFIG_ENCRYPTION_KEY = originalKey;
    jest.resetModules();
  });

  it("round-trips plaintext through encrypt/decrypt", async () => {
    process.env.MEDIA_CONFIG_ENCRYPTION_KEY = VALID_KEY;
    jest.resetModules();
    const { encrypt, decrypt } = await import("@/lib/crypto");

    const ciphertext = encrypt("a very secret api key");

    expect(ciphertext).not.toContain("a very secret api key");
    expect(decrypt(ciphertext)).toBe("a very secret api key");
  });

  it("produces different ciphertext for the same plaintext across calls", async () => {
    process.env.MEDIA_CONFIG_ENCRYPTION_KEY = VALID_KEY;
    jest.resetModules();
    const { encrypt } = await import("@/lib/crypto");

    expect(encrypt("same value")).not.toBe(encrypt("same value"));
  });

  it("rejects a tampered ciphertext", async () => {
    process.env.MEDIA_CONFIG_ENCRYPTION_KEY = VALID_KEY;
    jest.resetModules();
    const { encrypt, decrypt } = await import("@/lib/crypto");

    const [iv, tag, data] = encrypt("secret").split(":");
    const tamperedData = Buffer.from(data!, "base64");
    tamperedData[0] = tamperedData[0]! ^ 0xff;
    const tampered = `${iv}:${tag}:${tamperedData.toString("base64")}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a malformed ciphertext", async () => {
    process.env.MEDIA_CONFIG_ENCRYPTION_KEY = VALID_KEY;
    jest.resetModules();
    const { decrypt } = await import("@/lib/crypto");

    expect(() => decrypt("not-a-valid-ciphertext")).toThrow(/malformed/i);
  });

  it("fails fast when the key is missing", async () => {
    delete process.env.MEDIA_CONFIG_ENCRYPTION_KEY;
    jest.resetModules();
    const { encrypt } = await import("@/lib/crypto");

    expect(() => encrypt("x")).toThrow(/MEDIA_CONFIG_ENCRYPTION_KEY is not set/);
  });

  it("fails fast when the key is the wrong length", async () => {
    process.env.MEDIA_CONFIG_ENCRYPTION_KEY = Buffer.from("too short").toString(
      "base64",
    );
    jest.resetModules();
    const { encrypt } = await import("@/lib/crypto");

    expect(() => encrypt("x")).toThrow(/must decode to 32 bytes/);
  });
});
