/**
 * @jest-environment node
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";

process.env.MEDIA_CONFIG_ENCRYPTION_KEY = "v97uOic9/sbhtkB2rBdyys0hcKELLhdfW8hMCpcTBi8=";

const { cleanup } = setupTempDatabase();

const ping = jest.fn();
jest.mock("cloudinary", () => ({
  v2: { api: { ping: (...args: unknown[]) => ping(...args) } },
}));

let checkMediaConnection: typeof import("@/lib/media-config/check-connection").checkMediaConnection;
let service: typeof import("@/lib/media-config/service");
let tenantId: string;

beforeAll(async () => {
  await migrateTestDatabase();

  ({ checkMediaConnection } = await import("@/lib/media-config/check-connection"));
  service = await import("@/lib/media-config/service");

  const { registerTenant } = await import("@/lib/tenants/register");
  const registered = await registerTenant({
    email: "check-connection@example.com",
    password: "password one",
  });
  if (!registered.ok) throw new Error("fixture registration failed");
  tenantId = registered.tenantId;
});

afterEach(() => {
  ping.mockReset();
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("checkMediaConnection", () => {
  it("reports NOT_CONFIGURED without calling Cloudinary when nothing is saved", async () => {
    const result = await checkMediaConnection(tenantId);

    expect(result).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(ping).not.toHaveBeenCalled();
  });

  it("passes decrypted per-call credentials to ping and records success", async () => {
    await service.saveMediaConfig(tenantId, {
      cloudName: "acme",
      apiKey: "key-123",
      apiSecret: "the-real-secret",
    });
    ping.mockResolvedValue({ status: "ok" });

    const result = await checkMediaConnection(tenantId);

    expect(result).toEqual({ ok: true });
    expect(ping).toHaveBeenCalledWith({
      cloud_name: "acme",
      api_key: "key-123",
      api_secret: "the-real-secret",
    });

    await expect(service.getMediaConfigStatus(tenantId)).resolves.toMatchObject({
      lastCheckOk: true,
    });
  });

  it("records failure and returns CHECK_FAILED without leaking the underlying error", async () => {
    ping.mockRejectedValue(new Error("Invalid api_key sk_live_abc123 for cloud acme"));

    const result = await checkMediaConnection(tenantId);

    expect(result).toEqual({ ok: false, reason: "CHECK_FAILED" });

    await expect(service.getMediaConfigStatus(tenantId)).resolves.toMatchObject({
      lastCheckOk: false,
    });
  });
});
