import type { z } from "zod";

/**
 * The widget types this system ships.
 *
 * `richtext` is deliberately absent — it is client-only, pulls in Lexical, and
 * carries its own serialization decision. Because `fields.widget` has no CHECK
 * constraint and `config`/`value` are JSON, adding it later is one registry
 * entry and zero migrations.
 */
export type WidgetType =
  | "string"
  | "text"
  | "select"
  | "number"
  | "boolean"
  | "datetime";

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
};
