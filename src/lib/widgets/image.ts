import { z } from "zod";

import type { WidgetDefinition } from "./types";

/**
 * Strict, so configuration belonging to another widget type is rejected
 * rather than silently stored where this widget cannot use it.
 */
export const imageConfigSchema = z.strictObject({
  maxSizeMB: z.number().positive().optional(),
  allowedFormats: z.array(z.string().trim().toLowerCase().min(1)).optional(),
});

export type ImageConfig = z.infer<typeof imageConfigSchema>;

/**
 * The uploaded asset's Cloudinary metadata — what an `image` field stores as
 * its value. Kept as the full asset shape (not a bare URL) so a later replace
 * can target the exact prior asset for cleanup (see design.md decision 4).
 */
export const imageValueSchema = z.strictObject({
  secureUrl: z.url(),
  publicId: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.string().trim().min(1),
  bytes: z.number().int().positive(),
});

export type ImageValue = z.infer<typeof imageValueSchema>;

export const imageWidget: WidgetDefinition<ImageConfig> = {
  type: "image",
  label: "Image",
  description: "An image uploaded from your computer to Cloudinary.",
  icon: "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1M4 15l4 -4a3 5 0 0 1 3 0l5 5M14 14l1 -1a3 5 0 0 1 3 0l2 2M9 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  configSchema: imageConfigSchema,
  valueSchema() {
    // Shape validation only — not a liveness check against Cloudinary (see
    // design.md decision 4). The value only ever reaches this schema as the
    // output of a successful upload, never hand-typed.
    return imageValueSchema;
  },
  /**
   * `secureUrl` → `url`: "secure" is Cloudinary's vocabulary, not the
   * consumer's, and every URL here is https anyway (design decision 7).
   */
  toApi(value) {
    const parsed = imageValueSchema.safeParse(value);
    if (!parsed.success) return null;

    const { secureUrl, publicId, width, height, format, bytes } = parsed.data;
    return { url: secureUrl, publicId, width, height, format, bytes };
  },
};
