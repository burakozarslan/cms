import { z } from "zod";

import type { WidgetDefinition } from "./types";

export const selectOptionSchema = z.strictObject({
  label: z.string().trim().min(1, "Each option needs a label."),
  value: z.string().trim().min(1, "Each option needs a value."),
});

export const selectConfigSchema = z
  .strictObject({
    options: z
      .array(selectOptionSchema)
      .min(1, "A select field needs at least one option."),
    multiple: z.boolean().optional(),
  })
  .refine(
    (config) =>
      new Set(config.options.map((option) => option.value)).size ===
      config.options.length,
    { message: "Option values must be unique.", path: ["options"] },
  );

export type SelectConfig = z.infer<typeof selectConfigSchema>;

export const selectWidget: WidgetDefinition<SelectConfig> = {
  type: "select",
  label: "Select",
  description: "A choice from a fixed list of options.",
  icon: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2M9 11l3 3l3 -3",
  configSchema: selectConfigSchema,
  valueSchema(config) {
    const values = config.options.map((option) => option.value);
    // Built from the *stored* option values, so a value that was valid under an
    // older option list stops validating as soon as the list changes.
    const one = z.enum(values as [string, ...string[]]);

    return config.multiple ? z.array(one) : one;
  },
};
