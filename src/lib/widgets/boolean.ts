import { z } from "zod";

import type { WidgetDefinition } from "./types";

/**
 * Empty and strict: a boolean has nothing to configure, so any key at all is a
 * sign that configuration for a different widget type was submitted.
 */
export const booleanConfigSchema = z.strictObject({});

export type BooleanConfig = z.infer<typeof booleanConfigSchema>;

export const booleanWidget: WidgetDefinition<BooleanConfig> = {
  type: "boolean",
  label: "Toggle",
  description: "A true/false switch.",
  icon: "M8 6h8a6 6 0 0 1 0 12h-8a6 6 0 0 1 0 -12M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  configSchema: booleanConfigSchema,
  valueSchema() {
    return z.boolean();
  },
};
