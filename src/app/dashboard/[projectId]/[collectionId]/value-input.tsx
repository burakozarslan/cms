import { Input, Select, Switch, Textarea } from "@frontend/ui";
import { valueInputName, type ParsedField } from "@/lib/widgets";

/**
 * The input for one field, chosen by its widget type.
 *
 * All six widgets in this change are ordinary form controls, so this stays a
 * plain server-renderable component with no client state of its own — the
 * enclosing form is the only island (design decision 12). A widget that needs
 * real interactivity slots in here as its own island without disturbing the
 * rest.
 *
 * Every constraint expressed here is a convenience for the person typing. The
 * server revalidates all of it against the field's stored configuration.
 */
export function ValueInput({
  field,
  value,
  error,
}: {
  field: ParsedField;
  value: unknown;
  error?: string;
}) {
  const name = valueInputName(field.id);
  const label = field.required ? `${field.label} *` : field.label;

  switch (field.widget) {
    case "string": {
      const config = field.config as { maxLength?: number };
      return (
        <Input
          label={label}
          name={name}
          type="text"
          maxLength={config.maxLength}
          defaultValue={typeof value === "string" ? value : ""}
          error={error}
        />
      );
    }

    case "text": {
      const config = field.config as { rows?: number; maxLength?: number };
      return (
        <Textarea
          label={label}
          name={name}
          rows={config.rows ?? 5}
          maxLength={config.maxLength}
          defaultValue={typeof value === "string" ? value : ""}
          error={error}
        />
      );
    }

    case "select": {
      const config = field.config as {
        options: Array<{ label: string; value: string }>;
        multiple?: boolean;
      };

      const selected = config.multiple
        ? Array.isArray(value)
          ? value.map(String)
          : []
        : typeof value === "string"
          ? value
          : "";

      return (
        <Select
          label={label}
          name={name}
          multiple={config.multiple}
          defaultValue={selected}
          error={error}
        >
          {config.multiple ? null : <option value="">—</option>}
          {config.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    }

    case "number": {
      const config = field.config as {
        min?: number;
        max?: number;
        step?: number;
        valueType?: string;
      };

      return (
        <Input
          label={label}
          name={name}
          type="number"
          min={config.min}
          max={config.max}
          step={
            config.step ?? (config.valueType === "int" ? 1 : "any")
          }
          defaultValue={
            typeof value === "number" || typeof value === "string"
              ? String(value)
              : ""
          }
          error={error}
        />
      );
    }

    case "boolean":
      return (
        <Switch
          label={label}
          name={name}
          value="true"
          defaultChecked={value === true}
          error={error}
        />
      );

    case "datetime": {
      const config = field.config as { dateOnly?: boolean };
      return (
        <Input
          label={label}
          name={name}
          type={config.dateOnly ? "date" : "datetime-local"}
          defaultValue={typeof value === "string" ? value : ""}
          error={error}
        />
      );
    }
  }
}
