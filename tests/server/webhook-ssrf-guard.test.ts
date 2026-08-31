/**
 * @jest-environment node
 *
 * SSRF guard: covers webhook-delivery's "Delivery targets outside the
 * public internet are rejected". IP-literal targets never hit DNS, which
 * keeps this test hermetic; hostname resolution is exercised against a
 * mocked `node:dns/promises`.
 */
import { checkWebhookTarget } from "@/lib/webhooks/ssrf-guard";

describe("checkWebhookTarget — malformed / disallowed schemes", () => {
  it("rejects a malformed URL", async () => {
    const result = await checkWebhookTarget("not a url");
    expect(result.allowed).toBe(false);
  });

  it("rejects a non-http(s) scheme", async () => {
    const result = await checkWebhookTarget("ftp://example.com/hook");
    expect(result.allowed).toBe(false);
  });
});

describe("checkWebhookTarget — IP literals", () => {
  it("rejects loopback", async () => {
    expect((await checkWebhookTarget("http://127.0.0.1:9000/hook")).allowed).toBe(false);
  });

  it("rejects 10.0.0.0/8", async () => {
    expect((await checkWebhookTarget("http://10.1.2.3/hook")).allowed).toBe(false);
  });

  it("rejects 192.168.0.0/16", async () => {
    expect((await checkWebhookTarget("http://192.168.1.1/hook")).allowed).toBe(false);
  });

  it("rejects 172.16.0.0/12", async () => {
    expect((await checkWebhookTarget("http://172.20.0.5/hook")).allowed).toBe(false);
  });

  it("rejects link-local 169.254.0.0/16", async () => {
    expect((await checkWebhookTarget("http://169.254.1.1/hook")).allowed).toBe(false);
  });

  it("rejects IPv6 loopback", async () => {
    expect((await checkWebhookTarget("http://[::1]/hook")).allowed).toBe(false);
  });

  it("rejects IPv6 unique-local (fc00::/7)", async () => {
    expect((await checkWebhookTarget("http://[fd12:3456::1]/hook")).allowed).toBe(false);
  });

  it("accepts a public IPv4 literal", async () => {
    expect((await checkWebhookTarget("http://8.8.8.8/hook")).allowed).toBe(true);
  });

  it("rejects localhost by name", async () => {
    expect((await checkWebhookTarget("http://localhost:3000/hook")).allowed).toBe(false);
  });
});

describe("checkWebhookTarget — hostname resolution", () => {
  const originalLookup = jest.requireActual("node:dns/promises").lookup;

  afterEach(() => {
    jest.resetModules();
    jest.dontMock("node:dns/promises");
  });

  it("rejects a hostname that resolves to a private address", async () => {
    jest.doMock("node:dns/promises", () => ({
      lookup: async () => [{ address: "10.0.0.5", family: 4 }],
    }));
    jest.resetModules();
    const { checkWebhookTarget: checkWithMock } = await import("@/lib/webhooks/ssrf-guard");

    const result = await checkWithMock("http://internal.example/hook");
    expect(result.allowed).toBe(false);
  });

  it("accepts a hostname that resolves to a public address", async () => {
    jest.doMock("node:dns/promises", () => ({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    }));
    jest.resetModules();
    const { checkWebhookTarget: checkWithMock } = await import("@/lib/webhooks/ssrf-guard");

    const result = await checkWithMock("http://public.example/hook");
    expect(result.allowed).toBe(true);
  });

  it("rejects a hostname that fails to resolve", async () => {
    jest.doMock("node:dns/promises", () => ({
      lookup: async () => {
        throw new Error("ENOTFOUND");
      },
    }));
    jest.resetModules();
    const { checkWebhookTarget: checkWithMock } = await import("@/lib/webhooks/ssrf-guard");

    const result = await checkWithMock("http://does-not-resolve.example/hook");
    expect(result.allowed).toBe(false);
  });

  it("sanity: real DNS module still exports lookup", () => {
    expect(typeof originalLookup).toBe("function");
  });
});
