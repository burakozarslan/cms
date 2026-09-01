"use client";

import { Input, Select, Switch, Textarea } from "@frontend/ui";
import {
  formatSelectOptions,
  numberValueTypes,
  type WidgetType,
} from "@/lib/widgets";

type ConfigRecord = Record<string, unknown>;

function num(config: ConfigRecord, key: string): string {
  const value = config[key];
  return typeof value === "number" ? String(value) : "";
}

function str(config: ConfigRecord, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

function bool(config: ConfigRecord, key: string): boolean {
  return config[key] === true;
}

function formatList(config: ConfigRecord): string {
  const value = config.allowedFormats;
  return Array.isArray(value) ? value.join("\n") : "";
}

/**
 * The configuration form for one widget type, rendered from the registry's
 * shape for that type.
 *
 * Everything here is a convenience: the server validates the submitted config
 * against `configSchema` regardless of what these inputs allowed.
 */
export function WidgetConfigInputs({
  widget,
  config = {},
  errors,
  relationshipTargets = [],
}: {
  widget: WidgetType;
  config?: ConfigRecord;
  errors?: string[];
  /** Other collections in the same project — the only valid relationship targets. */
  relationshipTargets?: Array<{ id: string; name: string }>;
}) {
  const error = errors?.[0];

  switch (widget) {
    case "string":
      return (
        <>
          <Input
            label="Maximum length (optional)"
            name="config.maxLength"
            type="number"
            min={1}
            defaultValue={num(config, "maxLength")}
            error={error}
          />
        </>
      );

    case "text":
      return (
        <>
          <Input
            label="Editor rows (optional)"
            name="config.rows"
            type="number"
            min={1}
            max={50}
            defaultValue={num(config, "rows")}
          />
          <Input
            label="Maximum length (optional)"
            name="config.maxLength"
            type="number"
            min={1}
            defaultValue={num(config, "maxLength")}
            error={error}
          />
        </>
      );

    case "select": {
      const options = Array.isArray(config.options)
        ? (config.options as Array<{ label: string; value: string }>)
        : [];

      return (
        <>
          <Textarea
            label="Options"
            name="config.options"
            rows={5}
            required
            placeholder={"Draft\nIn review\nPublished | published"}
            hint="One per line. Use “Label | value” when the stored value should differ."
            defaultValue={formatSelectOptions(options)}
            error={error}
          />
          <Switch
            label="Allow several selections"
            name="config.multiple"
            defaultChecked={bool(config, "multiple")}
          />
        </>
      );
    }

    case "number":
      return (
        <>
          <Select
            label="Value type"
            name="config.valueType"
            defaultValue={str(config, "valueType") || "float"}
            hint="“Text” keeps the value exactly as typed, so 007 stays 007."
          >
            {numberValueTypes.map((type) => (
              <option key={type} value={type}>
                {type === "int"
                  ? "Whole number"
                  : type === "float"
                    ? "Decimal"
                    : "Text"}
              </option>
            ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Minimum"
              name="config.min"
              type="number"
              step="any"
              defaultValue={num(config, "min")}
            />
            <Input
              label="Maximum"
              name="config.max"
              type="number"
              step="any"
              defaultValue={num(config, "max")}
            />
            <Input
              label="Step"
              name="config.step"
              type="number"
              step="any"
              min={0}
              defaultValue={num(config, "step")}
            />
          </div>
          {error ? <p className="text-error text-sm">{error}</p> : null}
        </>
      );

    case "boolean":
      return (
        <p className="text-base-content/60 text-sm">
          A toggle has nothing to configure.
        </p>
      );

    case "richtext":
      return (
        <p className="text-base-content/60 text-sm">
          Formatting is fixed — bold, italic, underline, headings, lists, and
          links. Nothing to configure.
        </p>
      );

    case "datetime":
      return (
        <>
          <Switch
            label="Date only (no time of day)"
            name="config.dateOnly"
            defaultChecked={bool(config, "dateOnly")}
          />
          <Input
            label="Display format (optional)"
            name="config.format"
            type="text"
            placeholder="d MMM yyyy"
            defaultValue={str(config, "format")}
            error={error}
          />
        </>
      );

    case "relationship":
      return (
        <>
          <Select
            label="Target collection"
            name="config.targetCollectionId"
            required
            defaultValue={str(config, "targetCollectionId")}
            hint="The collection whose entries this field can reference."
            error={error}
          >
            <option value="">Choose a collection</option>
            {relationshipTargets.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </Select>
          <Switch
            label="Allow several references"
            name="config.multiple"
            defaultChecked={bool(config, "multiple")}
          />
          {relationshipTargets.length === 0 ? (
            <p className="text-base-content/60 text-sm">
              No other collections exist in this project yet. Create one first
              to reference it here.
            </p>
          ) : null}
        </>
      );

    case "image":
      return (
        <>
          <Input
            label="Maximum file size, in MB (optional)"
            name="config.maxSizeMB"
            type="number"
            min={1}
            step="any"
            defaultValue={num(config, "maxSizeMB")}
          />
          <Textarea
            label="Allowed formats (optional)"
            name="config.allowedFormats"
            rows={3}
            placeholder={"jpg\npng\nwebp"}
            hint="One per line. Leave blank to allow any image format."
            defaultValue={formatList(config)}
            error={error}
          />
        </>
      );
  }
}
