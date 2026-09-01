import { z } from "zod";

import { booleanWidget } from "./boolean";
import { datetimeWidget } from "./datetime";
import { imageWidget } from "./image";
import { numberWidget } from "./number";
import { relationshipWidget } from "./relationship";
import { richtextWidget } from "./richtext";
import { selectWidget } from "./select";
import { stringWidget } from "./string";
import { textWidget } from "./text";
import type { WidgetDefinition, WidgetType } from "./types";

/**
 * A widget definition with its config type erased.
 *
 * The registry is a heterogeneous map — each widget has its own config type —
 * but every consumer looks a widget up by a runtime string and therefore holds
 * `unknown` config. Erasing here confines that to one place: the config still
 * only reaches `valueSchema` after passing the matching `configSchema`, which
 * is the invariant that makes the cast sound.
 */
export type ErasedWidget = Omit<
  WidgetDefinition<unknown>,
  "configSchema" | "valueSchema" | "isEmpty" | "toApi"
> & {
  readonly configSchema: z.ZodType;
  valueSchema(config: unknown): z.ZodType;
  isEmpty?(value: unknown, config: unknown): boolean;
  toApi?(value: unknown, config: unknown): unknown;
};

function erase<TConfig>(definition: WidgetDefinition<TConfig>): ErasedWidget {
  return {
    type: definition.type,
    label: definition.label,
    description: definition.description,
    icon: definition.icon,
    configSchema: definition.configSchema as z.ZodType,
    valueSchema: (config) => definition.valueSchema(config as TConfig),
    isEmpty: definition.isEmpty
      ? (value, config) => definition.isEmpty!(value, config as TConfig)
      : undefined,
    toApi: definition.toApi
      ? (value, config) => definition.toApi!(value, config as TConfig)
      : undefined,
  };
}

/**
 * The single source of truth for what a widget type is.
 *
 * Adding a widget type is one entry here plus its module — no migration, no
 * edits scattered across the field builder, the entry editor, and the save
 * path, all of which read from this.
 */
export const widgets: Record<WidgetType, ErasedWidget> = {
  string: erase(stringWidget),
  text: erase(textWidget),
  select: erase(selectWidget),
  number: erase(numberWidget),
  boolean: erase(booleanWidget),
  datetime: erase(datetimeWidget),
  richtext: erase(richtextWidget),
  relationship: erase(relationshipWidget),
  image: erase(imageWidget),
};

/** Ordered for the type picker. */
export const widgetTypes = [
  "string",
  "text",
  "select",
  "number",
  "boolean",
  "datetime",
  "richtext",
  "relationship",
  "image",
] as const satisfies ReadonlyArray<WidgetType>;

export const widgetTypeSchema = z.enum(widgetTypes);

export function isWidgetType(value: unknown): value is WidgetType {
  return typeof value === "string" && value in widgets;
}

export function widgetDefinition(type: WidgetType): ErasedWidget {
  return widgets[type];
}

/**
 * A field submission: the widget type and its configuration, validated
 * together.
 *
 * Discriminated on `widget`, so `boolean` carrying select options fails against
 * the boolean branch rather than falling through to a permissive union member.
 */
export const fieldWidgetSchema = z.discriminatedUnion("widget", [
  z.object({ widget: z.literal("string"), config: stringWidget.configSchema }),
  z.object({ widget: z.literal("text"), config: textWidget.configSchema }),
  z.object({ widget: z.literal("select"), config: selectWidget.configSchema }),
  z.object({ widget: z.literal("number"), config: numberWidget.configSchema }),
  z.object({ widget: z.literal("boolean"), config: booleanWidget.configSchema }),
  z.object({
    widget: z.literal("datetime"),
    config: datetimeWidget.configSchema,
  }),
  z.object({
    widget: z.literal("richtext"),
    config: richtextWidget.configSchema,
  }),
  z.object({
    widget: z.literal("relationship"),
    config: relationshipWidget.configSchema,
  }),
  z.object({ widget: z.literal("image"), config: imageWidget.configSchema }),
]);

export type FieldWidget = z.infer<typeof fieldWidgetSchema>;

/** A field row as it comes back from the database. */
export type StoredFieldRow = {
  id: string;
  collection_id: string;
  key: string;
  label: string;
  widget: string;
  required: number;
  position: number;
  config: string;
};

/** A field whose stored widget and config both parsed. */
export type ParsedField = {
  ok: true;
  id: string;
  collectionId: string;
  key: string;
  label: string;
  widget: WidgetType;
  required: boolean;
  position: number;
  config: unknown;
};

/**
 * A field whose stored configuration no longer matches its widget type — an
 * unknown widget, unparseable JSON, or config left behind by a future config
 * shape change.
 */
export type MisconfiguredField = {
  ok: false;
  id: string;
  collectionId: string;
  key: string;
  label: string;
  widget: string;
  required: boolean;
  position: number;
  reason: string;
};

export type FieldParseResult = ParsedField | MisconfiguredField;

/**
 * Validate a stored field on read.
 *
 * JSON `config` is invisible to SQL constraints, so a bad row is possible and
 * must not take the field builder down with it. This returns a distinguishable
 * "misconfigured" result rather than throwing, so the builder can render that
 * one field as broken and everything else normally.
 */
export function parseFieldConfig(row: StoredFieldRow): FieldParseResult {
  const base = {
    id: row.id,
    collectionId: row.collection_id,
    key: row.key,
    label: row.label,
    required: row.required !== 0,
    position: row.position,
  };

  if (!isWidgetType(row.widget)) {
    return {
      ...base,
      ok: false,
      widget: row.widget,
      reason: `Unknown widget type "${row.widget}".`,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(row.config);
  } catch {
    return {
      ...base,
      ok: false,
      widget: row.widget,
      reason: "Configuration is not valid JSON.",
    };
  }

  const parsed = widgetDefinition(row.widget).configSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ...base,
      ok: false,
      widget: row.widget,
      reason: z.prettifyError(parsed.error),
    };
  }

  return { ...base, ok: true, widget: row.widget, config: parsed.data };
}
