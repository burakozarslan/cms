"use server";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { uploadImage, type UploadImageResult } from "@/lib/media-upload/service";
import { imageConfigSchema } from "@/lib/widgets";

/**
 * Uploads one picked file for an `image` field, called directly from the
 * client picker (not bound to a `<form>`) — mirrors
 * `listRelationshipOptionsAction`'s shape. Kept separate from the entry save
 * action so a slow, third-party-dependent upload never blocks the fast,
 * all-local entry form (design.md decision 1).
 */
export async function uploadImageAction(
  rawConfig: unknown,
  file: File,
  previousPublicId?: string,
): Promise<UploadImageResult> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const config = imageConfigSchema.parse(rawConfig);

  return uploadImage(session.user.tenantId, {
    file,
    config,
    previousPublicId,
  });
}
