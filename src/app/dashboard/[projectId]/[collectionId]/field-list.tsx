"use client";

import { useOptimistic, useState, useTransition } from "react";

import { Alert, Badge, Button, ConfirmDialog, Icon } from "@frontend/ui";
import { widgetDefinition, type WidgetType } from "@/lib/widgets";

import { deleteFieldAction, reorderFieldsAction } from "./actions";
import { FieldForm } from "./field-form";

/** A field flattened for the client boundary. */
export type FieldView = {
  id: string;
  key: string;
  label: string;
  widget: string;
  required: boolean;
  /** False when the stored config no longer matches the widget type. */
  ok: boolean;
  reason?: string;
  config: Record<string, unknown>;
  /** How many entries hold a value for this field. */
  valueCount: number;
};

const GRIP_PATH = "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01";
const UP_PATH = "M6 15l6 -6l6 6";
const DOWN_PATH = "M6 9l6 6l6 -6";

function reorder(ids: string[], from: number, to: number): string[] {
  if (to < 0 || to >= ids.length || from === to) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The ordered field list.
 *
 * Reordering is native HTML5 drag-and-drop plus explicit move up/down buttons.
 * The buttons are not a fallback — they are the keyboard path, and they make
 * the ordering operable without a drag library at all. Either way the client
 * sends the complete ordered id list and the server's rewrite is authoritative
 * (design decision 10).
 */
export function FieldList({
  projectId,
  collectionId,
  fields,
  titleFieldId,
  relationshipTargets = [],
}: {
  projectId: string;
  collectionId: string;
  fields: FieldView[];
  titleFieldId: string | null;
  relationshipTargets?: Array<{ id: string; name: string }>;
}) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | undefined>();
  const [dragging, setDragging] = useState<number | undefined>();

  const [order, applyOptimisticOrder] = useOptimistic(
    fields.map((field) => field.id),
    (_current: string[], next: string[]) => next,
  );

  const byId = new Map(fields.map((field) => [field.id, field]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((field): field is FieldView => field !== undefined);

  function commit(next: string[]) {
    setError(undefined);
    startTransition(async () => {
      // Optimistic locally; the server response is what the next render shows.
      applyOptimisticOrder(next);
      const result = await reorderFieldsAction(projectId, collectionId, next);
      if (result.error) setError(result.error);
    });
  }

  function move(from: number, to: number) {
    commit(reorder(order, from, to));
  }

  if (fields.length === 0) {
    return (
      <p className="text-base-content/60 text-sm">
        No fields yet. Add one below to define what an entry looks like.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ul className="flex flex-col gap-2">
        {ordered.map((field, index) => {
          const definition = field.ok
            ? widgetDefinition(field.widget as WidgetType)
            : undefined;

          return (
            <li
              key={field.id}
              draggable
              onDragStart={() => setDragging(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== undefined) move(dragging, index);
                setDragging(undefined);
              }}
              onDragEnd={() => setDragging(undefined)}
              className={[
                "bg-base-100 border-base-content/10 flex flex-col gap-3 rounded-lg border p-3",
                dragging === index ? "opacity-50" : "",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <span
                  className="text-base-content/40 mt-1 cursor-grab"
                  aria-hidden
                >
                  <Icon path={GRIP_PATH} className="size-4" />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {definition ? (
                      <Icon path={definition.icon} className="size-4" />
                    ) : null}
                    <span className="text-sm font-medium">{field.label}</span>
                    <code className="text-base-content/60 text-xs">
                      {field.key}
                    </code>
                    {definition ? (
                      <Badge>{definition.label}</Badge>
                    ) : (
                      <Badge tone="error">Misconfigured</Badge>
                    )}
                    {field.required ? <Badge tone="warning">Required</Badge> : null}
                    {titleFieldId === field.id ? (
                      <Badge tone="primary">Title</Badge>
                    ) : null}
                  </div>

                  {/* A field whose stored config no longer parses is shown as
                      broken rather than taking the collection down with it. */}
                  {field.ok ? null : (
                    <p className="text-error text-xs">{field.reason}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label={`Move ${field.label} up`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <Icon path={UP_PATH} className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label={`Move ${field.label} down`}
                    disabled={index === ordered.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <Icon path={DOWN_PATH} className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setEditing(editing === field.id ? undefined : field.id)
                    }
                  >
                    {editing === field.id ? "Close" : "Edit"}
                  </Button>

                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="ghost" size="xs">
                        Delete
                      </Button>
                    }
                    title={`Delete “${field.label}”?`}
                    confirmLabel="Delete field"
                    destructive
                    action={deleteFieldAction}
                    hidden={{ projectId, collectionId, fieldId: field.id }}
                  >
                    {field.valueCount > 0 ? (
                      <>
                        This will permanently delete values in{" "}
                        <strong>
                          {field.valueCount}{" "}
                          {field.valueCount === 1 ? "entry" : "entries"}
                        </strong>
                        . This cannot be undone.
                      </>
                    ) : (
                      <>
                        No entries hold a value for this field yet, so nothing
                        else is affected.
                      </>
                    )}
                  </ConfirmDialog>
                </div>
              </div>

              {editing === field.id && field.ok ? (
                <div className="border-base-content/10 border-t pt-3">
                  <FieldForm
                    projectId={projectId}
                    collectionId={collectionId}
                    field={{
                      id: field.id,
                      key: field.key,
                      label: field.label,
                      widget: field.widget as WidgetType,
                      required: field.required,
                      config: field.config,
                    }}
                    relationshipTargets={relationshipTargets}
                    onDone={() => setEditing(undefined)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
