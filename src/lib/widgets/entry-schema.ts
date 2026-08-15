import { z } from "zod";

import {
  widgetDefinition,
  type FieldParseResult,
  type ParsedField,
} from "./registry";

/**
 * What "no value" means on the way in.
 *
 * A blank input, a cleared select, and an absent key are the same thing: the
 * field holds nothing. Distinguishing them would make "optional" depend on how
 * the form happened to serialize.
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * A validator for one collection's entry values, keyed by field id.
 *
 * Keyed by id rather than by `key` because values are stored against `field_id`
 * — which is what makes renaming a field's key free (design decision 4).
 *
 * Callers pass `FieldParseResult`s, misconfigured fields included: an entry
 * whose collection contains one broken field must still be openable and
 * saveable as long as that field is left alone.
 */
export function buildEntrySchema(
  fields: ReadonlyArray<FieldParseResult>,
): z.ZodType<Record<string, unknown>> {
  const known = new Set(fields.map((field) => field.id));

  return z
    .record(z.string(), z.unknown())
    .superRefine((values, ctx) => {
      // A value keyed to a field outside this collection is rejected before any
      // write, rather than being silently dropped.
      for (const key of Object.keys(values)) {
        if (!known.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "This field does not belong to this collection.",
          });
        }
      }

      for (const field of fields) {
        const raw = values[field.id];

        if (!field.ok) {
          if (!isEmptyValue(raw)) {
            ctx.addIssue({
              code: "custom",
              path: [field.id],
              message: `“${field.label}” is misconfigured and cannot accept a value.`,
            });
          }
          continue;
        }

        if (isEmptyValue(raw)) {
          if (field.required) {
            ctx.addIssue({
              code: "custom",
              path: [field.id],
              message: `${field.label} is required.`,
            });
          }
          continue;
        }

        const result = widgetDefinition(field.widget)
          .valueSchema(field.config)
          .safeParse(raw);

        if (!result.success) {
          for (const issue of result.error.issues) {
            ctx.addIssue({
              code: "custom",
              path: [field.id, ...issue.path],
              message: issue.message,
            });
          }
        }
      }
    });
}

export type ValidateValuesResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Validate a submitted value set and strip the empties.
 *
 * The surviving record is exactly what should be written to `entry_values`:
 * optional fields left blank produce no row at all rather than a row holding
 * an empty string.
 */
export function validateEntryValues(
  fields: ReadonlyArray<FieldParseResult>,
  submitted: Record<string, unknown>,
  /**
   * The derived schema, when the caller already holds a cached one. It must
   * have been built from `fields` — the version-keyed cache is what guarantees
   * that (see schema-cache.ts).
   */
  schema: z.ZodType<Record<string, unknown>> = buildEntrySchema(fields),
): ValidateValuesResult {
  const parsed = schema.safeParse(submitted);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, fieldErrors };
  }

  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = submitted[field.id];
    if (!isEmptyValue(raw)) values[field.id] = raw;
  }

  return { ok: true, values };
}

/** Fields that parsed, in position order — what the editor renders from. */
export function usableFields(
  fields: ReadonlyArray<FieldParseResult>,
): ParsedField[] {
  return fields.filter((field): field is ParsedField => field.ok);
}
