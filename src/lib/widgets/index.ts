/**
 * The widget registry.
 *
 * A widget type is defined once — config schema, value schema, display
 * metadata — and the type picker, config form, entry editor, and save
 * validator all read from here.
 */
export type { WidgetType, WidgetDefinition } from "./types";

export {
  widgets,
  widgetTypes,
  widgetTypeSchema,
  widgetDefinition,
  isWidgetType,
  fieldWidgetSchema,
  parseFieldConfig,
} from "./registry";
export type {
  ErasedWidget,
  FieldWidget,
  StoredFieldRow,
  ParsedField,
  MisconfiguredField,
  FieldParseResult,
} from "./registry";

export {
  buildEntrySchema,
  validateEntryValues,
  isEmptyValue,
  usableFields,
} from "./entry-schema";
export type { ValidateValuesResult } from "./entry-schema";

export {
  getEntrySchema,
  schemaCacheKey,
  clearSchemaCache,
  schemaCacheSize,
} from "./schema-cache";

export {
  configFromForm,
  compactConfig,
  valuesFromForm,
  valueInputName,
  parseSelectOptions,
  formatSelectOptions,
} from "./form";

export { selectConfigSchema } from "./select";
export type { SelectConfig } from "./select";
export { numberConfigSchema, numberValueTypes } from "./number";
export type { NumberConfig, NumberValueType } from "./number";
export { stringConfigSchema } from "./string";
export type { StringConfig } from "./string";
export { textConfigSchema } from "./text";
export type { TextConfig } from "./text";
export { booleanConfigSchema } from "./boolean";
export type { BooleanConfig } from "./boolean";
export { datetimeConfigSchema } from "./datetime";
export type { DatetimeConfig } from "./datetime";
export { relationshipConfigSchema } from "./relationship";
export type { RelationshipConfig } from "./relationship";
