import type { z } from "zod";

/** The widget types this system ships. */
export type WidgetType =
  | "string"
  | "text"
  | "select"
  | "number"
  | "boolean"
  | "datetime"
  | "richtext"
  | "relationship";

/**
 * One widget type's contract.
 *
 * A widget is defined once, here, and everything downstream — the type picker,
 * the config form, the value input, the save validator — reads from this. That
 * is what makes adding a widget type one entry rather than edits in six files.
 */
export type WidgetDefinition<TConfig = unknown> = {
  readonly type: WidgetType;
  /** Shown in the widget type picker. */
  readonly label: string;
  readonly description: string;
  /** SVG path data on a 24×24 viewBox, rendered by `@frontend/ui`'s `Icon`. */
  readonly icon: string;
  /** Validates the field's stored `config` blob. */
  readonly configSchema: z.ZodType<TConfig>;
  /** Derives the value validator for one configured field. */
  valueSchema(config: TConfig): z.ZodType;
  /**
   * Overrides the generic "no value" check (`isEmptyValue` in
   * `entry-schema.ts`) used to decide whether `required` applies. Only needed
   * by a widget whose empty state isn't a nullish/blank-string/empty-array —
   * e.g. richtext, where an untouched document is a non-empty JSON object.
   * Defaults to the generic check when absent.
   */
  isEmpty?(value: unknown, config: TConfig): boolean;
};
