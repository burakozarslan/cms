import { v2 as cloudinary } from "cloudinary";

import { checkMediaConnection } from "@/lib/media-config/check-connection";
import { getMediaCredentials } from "@/lib/media-config/service";
import type { ImageConfig, ImageValue } from "@/lib/widgets";

export type UploadImageResult =
  | { ok: true; value: ImageValue }
  | {
      ok: false;
      reason:
        | "NOT_CONFIGURED"
        | "CONNECTION_FAILED"
        | "TOO_LARGE"
        | "BAD_FORMAT"
        | "UPLOAD_FAILED";
    };

export type UploadImageInput = {
  file: File;
  config: ImageConfig;
  /** The field's previously stored asset, if this upload is replacing one. */
  previousPublicId?: string;
};

const MIME_FORMAT_ALIASES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/svg+xml": ["svg"],
  "image/avif": ["avif"],
  "image/heic": ["heic"],
};

/** The format names a file's MIME type could satisfy an allow-list with. */
function formatsFor(mimeType: string): string[] {
  return MIME_FORMAT_ALIASES[mimeType.toLowerCase()] ?? [];
}

/**
 * Uploads a picked file to the tenant's Cloudinary account, verifying the
 * connection live first (design.md decision 3) and validating the file
 * server-side regardless of what the client already checked (decision 2).
 *
 * Best-effort deletes the field's previous asset, if any, once the new
 * upload succeeds — a failure to clean up never fails the upload itself
 * (decision 7 / proposal.md decision 3).
 */
export async function uploadImage(
  tenantId: string,
  input: UploadImageInput,
): Promise<UploadImageResult> {
  const credentials = await getMediaCredentials(tenantId);
  if (!credentials) return { ok: false, reason: "NOT_CONFIGURED" };

  const connection = await checkMediaConnection(tenantId);
  if (!connection.ok) return { ok: false, reason: "CONNECTION_FAILED" };

  const { file, config, previousPublicId } = input;

  if (config.maxSizeMB !== undefined && file.size > config.maxSizeMB * 1024 * 1024) {
    return { ok: false, reason: "TOO_LARGE" };
  }

  if (config.allowedFormats && config.allowedFormats.length > 0) {
    const candidates = formatsFor(file.type);
    const allowed = candidates.some((format) =>
      config.allowedFormats!.includes(format),
    );
    if (!allowed) return { ok: false, reason: "BAD_FORMAT" };
  }

  const options = {
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
  };

  let uploaded;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;
    uploaded = await cloudinary.uploader.upload(dataUri, options);
  } catch {
    // Deliberately swallow the underlying error — see checkMediaConnection,
    // which never leaks Cloudinary/network error details to the client.
    return { ok: false, reason: "UPLOAD_FAILED" };
  }

  if (previousPublicId) {
    try {
      // The SDK's `destroy` option type omits credential overrides (unlike
      // `upload`'s, which has a future-key index signature) even though the
      // runtime accepts them the same way — passed per-call to avoid the
      // cross-tenant global-config race `checkMediaConnection` also avoids.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await cloudinary.uploader.destroy(previousPublicId, options as any);
    } catch (error) {
      // Best-effort cleanup: log for operator visibility, never block the
      // new image from being saved (design.md decision 7).
      console.error(
        `Failed to delete replaced Cloudinary asset ${previousPublicId}:`,
        error,
      );
    }
  }

  return {
    ok: true,
    value: {
      secureUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format,
      bytes: uploaded.bytes,
    },
  };
}
