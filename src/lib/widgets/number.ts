import { z } from "zod";

import type { WidgetDefinition } from "./types";

/**
 * `"string"` keeps round-trip fidelity for values whose textual form matters
 * (leading zeros, fixed decimal places). It still has to *be* a number — it is
 * validated as one and only stored verbatim.
 */
export const numberValueTypes = ["string", "int", "float"] as const;
export type NumberValueType = (typeof numberValueTypes)[number];

export const numberConfigSchema = z
  .strictObject({
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    valueType: z.enum(numberValueTypes).default("float"),
  })
  .refine(
    (config) =>
      config.min === undefined ||
      config.max === undefined ||
      config.min <= config.max,
    { message: "Minimum must not exceed maximum.", path: ["min"] },
  )
  .refine(
    (config) =>
      config.valueType !== "int" ||
      [config.min, config.max, config.step].every(
        (bound) => bound === undefined || Number.isInteger(bound),
      ),
    {
      message: "An integer field's bounds must themselves be integers.",
      path: ["valueType"],
    },
  );

export type NumberConfig = z.infer<typeof numberConfigSchema>;

/** Bounds apply to every value type, so they are checked on the numeric form. */
function withBounds(config: NumberConfig, value: number, ctx: z.RefinementCtx) {
  if (config.min !== undefined && value < config.min) {
    ctx.addIssue({ code: "custom", message: `Must be at least ${config.min}.` });
  }
  if (config.max !== undefined && value > config.max) {
    ctx.addIssue({ code: "custom", message: `Must be at most ${config.max}.` });
  }
}

export const numberWidget: WidgetDefinition<NumberConfig> = {
  type: "number",
  label: "Number",
  description: "A numeric value, optionally bounded.",
  icon: "M4 9h16M4 15h16M10 3l-2 18M17 3l-2 18",
  configSchema: numberConfigSchema,
  valueSchema(config) {
    if (config.valueType === "string") {
      return z.string().superRefine((raw, ctx) => {
        const trimmed = raw.trim();
        const parsed = trimmed === "" ? Number.NaN : Number(trimmed);
        if (!Number.isFinite(parsed)) {
          ctx.addIssue({ code: "custom", message: "Must be a number." });
          return;
        }
        withBounds(config, parsed, ctx);
      });
    }

    return z.number().superRefine((value, ctx) => {
      if (!Number.isFinite(value)) {
        ctx.addIssue({ code: "custom", message: "Must be a number." });
        return;
      }
      if (config.valueType === "int" && !Number.isInteger(value)) {
        ctx.addIssue({ code: "custom", message: "Must be a whole number." });
      }
      withBounds(config, value, ctx);
    });
  },
};
