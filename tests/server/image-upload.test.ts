/**
 * @jest-environment node
 *
 * Covers `image-widget` → "Upload is blocked when Cloudinary is not
 * configured", "Upload is preceded by a live connection check", "Picked file
 * is validated against the field's constraints", "Uploaded image is stored
 * as Cloudinary asset metadata", and "Replacing an image removes the
 * previous asset from Cloudinary".
 */
const upload = jest.fn();
const destroy = jest.fn();
jest.mock("cloudinary", () => ({
  v2: { uploader: { upload: (...args: unknown[]) => upload(...args), destroy: (...args: unknown[]) => destroy(...args) } },
}));

const getMediaCredentials = jest.fn();
jest.mock("@/lib/media-config/service", () => ({
  getMediaCredentials: (...args: unknown[]) => getMediaCredentials(...args),
}));

const checkMediaConnection = jest.fn();
jest.mock("@/lib/media-config/check-connection", () => ({
  checkMediaConnection: (...args: unknown[]) => checkMediaConnection(...args),
}));

import { uploadImage } from "@/lib/media-upload/service";

const credentials = { cloudName: "acme", apiKey: "key-123", apiSecret: "shh" };

function fileOf(bytes: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], "photo.jpg", { type });
}

const uploadedAsset = {
  secure_url: "https://res.cloudinary.com/acme/image/upload/v1/photo.jpg",
  public_id: "photo",
  width: 800,
  height: 600,
  format: "jpg",
  bytes: 12345,
};

beforeEach(() => {
  upload.mockReset();
  destroy.mockReset();
  getMediaCredentials.mockReset();
  checkMediaConnection.mockReset();
  getMediaCredentials.mockResolvedValue(credentials);
  checkMediaConnection.mockResolvedValue({ ok: true });
  upload.mockResolvedValue(uploadedAsset);
  destroy.mockResolvedValue({ result: "ok" });
});

describe("uploadImage", () => {
  it("reports NOT_CONFIGURED without checking the connection or uploading", async () => {
    getMediaCredentials.mockResolvedValue(undefined);

    const result = await uploadImage("tenant-1", { file: fileOf(100), config: {} });

    expect(result).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(checkMediaConnection).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports CONNECTION_FAILED without uploading when the live check fails", async () => {
    checkMediaConnection.mockResolvedValue({ ok: false, reason: "CHECK_FAILED" });

    const result = await uploadImage("tenant-1", { file: fileOf(100), config: {} });

    expect(result).toEqual({ ok: false, reason: "CONNECTION_FAILED" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not trust a stale cached success — the connection is checked live on every call", async () => {
    checkMediaConnection.mockResolvedValue({ ok: false, reason: "CHECK_FAILED" });

    await uploadImage("tenant-1", { file: fileOf(100), config: {} });

    expect(checkMediaConnection).toHaveBeenCalledWith("tenant-1");
    expect(checkMediaConnection).toHaveBeenCalledTimes(1);
  });

  it("reports TOO_LARGE without uploading when the file exceeds maxSizeMB", async () => {
    const result = await uploadImage("tenant-1", {
      file: fileOf(2 * 1024 * 1024),
      config: { maxSizeMB: 1 },
    });

    expect(result).toEqual({ ok: false, reason: "TOO_LARGE" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("accepts a file at or under the configured maxSizeMB", async () => {
    const result = await uploadImage("tenant-1", {
      file: fileOf(1024 * 1024),
      config: { maxSizeMB: 1 },
    });

    expect(result.ok).toBe(true);
  });

  it("reports BAD_FORMAT without uploading when the format is not allowed", async () => {
    const result = await uploadImage("tenant-1", {
      file: fileOf(100, "image/png"),
      config: { allowedFormats: ["jpg", "webp"] },
    });

    expect(result).toEqual({ ok: false, reason: "BAD_FORMAT" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("accepts a format that is in the allow list", async () => {
    const result = await uploadImage("tenant-1", {
      file: fileOf(100, "image/png"),
      config: { allowedFormats: ["jpg", "png"] },
    });

    expect(result.ok).toBe(true);
  });

  it("accepts any format when the field has no allowedFormats configured", async () => {
    const result = await uploadImage("tenant-1", {
      file: fileOf(100, "image/webp"),
      config: {},
    });

    expect(result.ok).toBe(true);
  });

  it("reports UPLOAD_FAILED without leaking the underlying error when Cloudinary throws", async () => {
    upload.mockRejectedValue(new Error("Invalid api_key sk_live_abc123 for cloud acme"));

    const result = await uploadImage("tenant-1", { file: fileOf(100), config: {} });

    expect(result).toEqual({ ok: false, reason: "UPLOAD_FAILED" });
  });

  it("uploads with the tenant's decrypted credentials, passed per-call", async () => {
    await uploadImage("tenant-1", { file: fileOf(100), config: {} });

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/jpeg;base64,/),
      expect.objectContaining({
        cloud_name: "acme",
        api_key: "key-123",
        api_secret: "shh",
      }),
    );
  });

  it("returns the uploaded asset's metadata on success", async () => {
    const result = await uploadImage("tenant-1", { file: fileOf(100), config: {} });

    expect(result).toEqual({
      ok: true,
      value: {
        secureUrl: uploadedAsset.secure_url,
        publicId: uploadedAsset.public_id,
        width: uploadedAsset.width,
        height: uploadedAsset.height,
        format: uploadedAsset.format,
        bytes: uploadedAsset.bytes,
      },
    });
  });

  it("does not attempt to delete anything when there is no previous asset", async () => {
    await uploadImage("tenant-1", { file: fileOf(100), config: {} });
    expect(destroy).not.toHaveBeenCalled();
  });

  it("deletes the previous asset once the new upload succeeds", async () => {
    await uploadImage("tenant-1", {
      file: fileOf(100),
      config: {},
      previousPublicId: "old-photo",
    });

    expect(destroy).toHaveBeenCalledWith(
      "old-photo",
      expect.objectContaining({ cloud_name: "acme" }),
    );
  });

  it("still returns ok:true with the new value when deleting the previous asset fails", async () => {
    destroy.mockRejectedValue(new Error("not found"));

    const result = await uploadImage("tenant-1", {
      file: fileOf(100),
      config: {},
      previousPublicId: "old-photo",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.publicId).toBe(uploadedAsset.public_id);
  });
});
