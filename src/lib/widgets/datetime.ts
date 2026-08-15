import { z } from "zod";

import type { WidgetDefinition } from "./types";

export const datetimeConfigSchema = z.strictObject({
  /** Drops the time component: the value becomes a plain `YYYY-MM-DD` date. */
  dateOnly: z.boolean().optional(),
  /** Display format hint for the editor. Presentation only. */
  format: z.string().trim().min(1).max(40).optional(),
});

export type DatetimeConfig = z.infer<typeof datetimeConfigSchema>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `Date.parse` alone accepts too much and rejects too little across engines, so
 * date-only values are shape-checked first and every value must round-trip to a
 * real instant.
 */
function isParseableInstant(raw: string, dateOnly: boolean): boolean {
  const value = raw.trim();
  if (value === "") return false;
  if (dateOnly && !DATE_ONLY.test(value)) return false;

  const parsed = Date.parse(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed)) return false;

  // Rejects calendar-invalid dates like 2024-02-31, which Date.parse rolls over.
  if (dateOnly) {
    return new Date(parsed).toISOString().slice(0, 10) === value;
  }
  return true;
}

export const datetimeWidget: WidgetDefinition<DatetimeConfig> = {
  type: "datetime",
  label: "Date & time",
  description: "A point in time, stored as ISO 8601.",
  icon: "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM16 3v4M8 3v4M4 11h16",
  configSchema: datetimeConfigSchema,
  valueSchema(config) {
    const dateOnly = config.dateOnly === true;

    return z
      .string()
      .refine((raw) => isParseableInstant(raw, dateOnly), {
        message: dateOnly
          ? "Must be a valid date (YYYY-MM-DD)."
          : "Must be a valid date and time.",
      });
  },
};
