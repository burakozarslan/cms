"use client";

import { useActionState, useState } from "react";

import { Alert, Button, Icon, Input, Switch } from "@frontend/ui";
import { widgetDefinition, widgetTypes, type WidgetType } from "@/lib/widgets";

import {
  createFieldAction,
  updateFieldAction,
  type FormState,
} from "./actions";
import { WidgetConfigInputs } from "./widget-config-inputs";

/**
 * The widget type picker.
 *
 * Radio inputs rather than a listbox, so the whole thing is keyboard-operable
 * with arrow keys and needs no JavaScript to submit. Reads directly from
 * `widgetTypes` — the picker has no list of its own.
 */
function WidgetPicker({
  selected,
  onSelect,
}: {
  selected: WidgetType;
  onSelect: (type: WidgetType) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="label-text mb-1">Field type</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {widgetTypes.map((type) => {
          const definition = widgetDefinition(type);
          const isSelected = selected === type;

          return (
            <label
              key={type}
              className={[
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-base-content/10 hover:border-base-content/30",
              ].join(" ")}
            >
              <input
                type="radio"
                name="widget"
                value={type}
                checked={isSelected}
                onChange={() => onSelect(type)}
                className="radio radio-primary mt-0.5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon path={definition.icon} className="size-4" />
                  {definition.label}
                </span>
                <span className="text-base-content/60 text-xs">
                  {definition.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export type FieldFormProps = {
  projectId: string;
  collectionId: string;
  /** Present when editing; absent when adding. */
  field?: {
    id: string;
    key: string;
    label: string;
    widget: WidgetType;
    required: boolean;
    config: Record<string, unknown>;
  };
  /** Other collections in the same project — valid `relationship` targets. */
  relationshipTargets?: Array<{ id: string; name: string }>;
  onDone?: () => void;
};

export function FieldForm({
  projectId,
  collectionId,
  field,
  relationshipTargets = [],
  onDone,
}: FieldFormProps) {
  const editing = field !== undefined;

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    editing ? updateFieldAction : createFieldAction,
    {},
  );

  // Only meaningful when adding: an existing field's type cannot change.
  const [widget, setWidget] = useState<WidgetType>(field?.widget ?? "string");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="collectionId" value={collectionId} />
      {editing ? (
        <input type="hidden" name="fieldId" value={field.id} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Label"
          name="label"
          type="text"
          placeholder="Title"
          required
          defaultValue={field?.label ?? ""}
          error={state.fieldErrors?.label?.[0]}
        />
        <Input
          label="Key"
          name="key"
          type="text"
          placeholder="title"
          required
          defaultValue={field?.key ?? ""}
          className="font-mono"
          error={state.fieldErrors?.key?.[0]}
        />
      </div>

      {editing ? (
        <>
          {/* The type is immutable once the field exists: there is no defined
              conversion between widget types for values already stored. */}
          <input type="hidden" name="widget" value={field.widget} />
          <p className="text-base-content/60 flex items-center gap-2 text-sm">
            <Icon path={widgetDefinition(field.widget).icon} className="size-4" />
            {widgetDefinition(field.widget).label} — the field type cannot be
            changed. Delete the field and add a new one instead.
          </p>
          {state.fieldErrors?.widget?.[0] ? (
            <Alert tone="error">{state.fieldErrors.widget[0]}</Alert>
          ) : null}
        </>
      ) : (
        <WidgetPicker selected={widget} onSelect={setWidget} />
      )}

      <div className="border-base-content/10 flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Configuration</p>
        <WidgetConfigInputs
          widget={editing ? field.widget : widget}
          config={field?.config}
          errors={state.fieldErrors?.config}
          relationshipTargets={relationshipTargets}
        />
      </div>

      <Switch
        label="Required"
        name="required"
        defaultChecked={field?.required ?? false}
      />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save field" : "Add field"}
        </Button>
        {onDone ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
