import { z } from "zod";

import type { WidgetDefinition } from "./types";

export const textConfigSchema = z.strictObject({
  /** Textarea height. Presentation only; it does not constrain the value. */
  rows: z.number().int().positive().max(50).optional(),
  maxLength: z.number().int().positive().optional(),
});

export type TextConfig = z.infer<typeof textConfigSchema>;

export const textWidget: WidgetDefinition<TextConfig> = {
  type: "text",
  label: "Long text",
  description: "Multiple lines of plain text.",
  icon: "M4 6h16M4 10h16M4 14h16M4 18h10",
  configSchema: textConfigSchema,
  valueSchema(config) {
    let schema = z.string();
    if (config.maxLength !== undefined) {
      schema = schema.max(
        config.maxLength,
        `Must be ${config.maxLength} characters or fewer.`,
      );
    }
    return schema;
  },
};
