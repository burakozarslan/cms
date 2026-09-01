import { z } from "zod";

import type { WidgetDefinition } from "./types";

/**
 * Strict, so configuration belonging to another widget type (`options`, `min`)
 * is rejected rather than silently stored where the widget cannot use it.
 */
export const stringConfigSchema = z.strictObject({
  maxLength: z.number().int().positive().optional(),
});

export type StringConfig = z.infer<typeof stringConfigSchema>;

export const stringWidget: WidgetDefinition<StringConfig> = {
  type: "string",
  label: "Text",
  description: "A single line of plain text.",
  icon: "M4 8h16M4 13h16M4 18h9",
  configSchema: stringConfigSchema,
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
