import type { FieldParseResult, ParsedField } from "./registry";
import type { WidgetType } from "./types";

/**
 * Translating HTML form data into widget config and values.
 *
 * This lives beside the registry rather than in the app layer so that adding a
 * widget type stays one module: its schema, its metadata, and the way its
 * inputs come back off a form all move together.
 */

/** Form field name carrying an entry value for one field. */
export function valueInputName(fieldId: string): string {
  return `value:${fieldId}`;
}

function optionalNumber(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function checkbox(form: FormData, name: string): boolean {
  return form.get(name) !== null;
}

/**
 * Parse `select` options from one textarea, one option per line.
 *
 * `Label | value` splits the two; a bare line is used as both. Kept textual
 * because a repeating-row editor would need a client island for a list that is
 * almost always short.
 */
export function parseSelectOptions(
  raw: string,
): Array<{ label: string; value: string }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const separator = line.indexOf("|");
      if (separator === -1) return { label: line, value: line };
      return {
        label: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      };
    });
}

/** Render options back into the textarea format above. */
export function formatSelectOptions(
  options: ReadonlyArray<{ label: string; value: string }>,
): string {
  return options
    .map((option) =>
      option.label === option.value
        ? option.value
        : `${option.label} | ${option.value}`,
    )
    .join("\n");
}

/**
 * Build a widget's config object from the add/edit field form.
 *
 * Deliberately loose: it shapes the submission, it does not validate it. The
 * registry's `configSchema` is the only thing that decides whether a config is
 * acceptable, and it runs on the server in every case.
 */
export function configFromForm(
  widget: WidgetType,
  form: FormData,
): Record<string, unknown> {
  switch (widget) {
    case "string":
      return { maxLength: optionalNumber(form.get("config.maxLength")) };

    case "text":
      return {
        rows: optionalNumber(form.get("config.rows")),
        maxLength: optionalNumber(form.get("config.maxLength")),
      };

    case "select":
      return {
        options: parseSelectOptions(String(form.get("config.options") ?? "")),
        multiple: checkbox(form, "config.multiple"),
      };

    case "number":
      return {
        min: optionalNumber(form.get("config.min")),
        max: optionalNumber(form.get("config.max")),
        step: optionalNumber(form.get("config.step")),
        valueType: String(form.get("config.valueType") ?? "float"),
      };

    case "boolean":
      return {};

    case "richtext":
      return {};

    case "relationship":
      return {
        targetCollectionId: String(form.get("config.targetCollectionId") ?? ""),
        multiple: checkbox(form, "config.multiple"),
      };

    case "datetime":
      return {
        dateOnly: checkbox(form, "config.dateOnly"),
        format: (() => {
          const raw = form.get("config.format");
          return typeof raw === "string" && raw.trim() !== ""
            ? raw.trim()
            : undefined;
        })(),
      };
  }
}

/**
 * Strip keys the widget left undefined.
 *
 * `strictObject` rejects unknown keys but tolerates absent optional ones, and
 * an explicit `undefined` would otherwise have to be spelled out in every
 * config schema.
 */
export function compactConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
}

/** One field's value, read off the form in the shape its widget expects. */
function valueFromForm(field: ParsedField, form: FormData): unknown {
  const name = valueInputName(field.id);

  switch (field.widget) {
    case "boolean":
      // A checkbox posts nothing when off, but "off" is `false`, not "absent" —
      // otherwise a required toggle could never be saved as unchecked.
      return checkbox(form, name);

    case "select":
    case "relationship": {
      const config = field.config as { multiple?: boolean };
      if (config.multiple) {
        return form.getAll(name).map((entry) => String(entry));
      }
      return String(form.get(name) ?? "");
    }

    case "number": {
      const raw = form.get(name);
      const config = field.config as { valueType?: string };
      if (typeof raw !== "string" || raw.trim() === "") return "";
      // valueType "string" keeps the textual form; the others become numbers.
      return config.valueType === "string" ? raw : Number(raw);
    }

    case "richtext": {
      const raw = form.get(name);
      if (typeof raw !== "string" || raw.trim() === "") return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        // Let the value schema's own validation produce the user-facing
        // error, rather than throwing during form parsing.
        return raw;
      }
    }

    default:
      return String(form.get(name) ?? "");
  }
}

/**
 * The submitted value set, keyed by field id.
 *
 * Only fields that belong to the collection are read, so a value smuggled in
 * under a foreign field id never reaches the validator — and the validator
 * rejects it independently if one ever does.
 */
export function valuesFromForm(
  fields: ReadonlyArray<FieldParseResult>,
  form: FormData,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    if (!field.ok) continue;
    values[field.id] = valueFromForm(field, form);
  }

  return values;
}
