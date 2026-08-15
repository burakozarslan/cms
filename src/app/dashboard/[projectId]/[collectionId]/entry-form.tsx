"use client";

import { useActionState } from "react";

import { Alert, Button } from "@frontend/ui";
import type { FieldParseResult } from "@/lib/widgets";

import {
  createEntryAction,
  updateEntryAction,
  type FormState,
} from "./actions";
import { ValueInput } from "./value-input";

/**
 * The entry editor form.
 *
 * One client island around the whole form rather than one per input: the
 * inputs themselves are plain controls, and the island exists only to surface
 * the per-field errors the server returns after a save.
 */
export function EntryForm({
  projectId,
  collectionId,
  fields,
  entry,
}: {
  projectId: string;
  collectionId: string;
  /** In display order, misconfigured fields included so they can be flagged. */
  fields: FieldParseResult[];
  entry?: { id: string; values: Record<string, unknown> };
}) {
  const editing = entry !== undefined;

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    editing ? updateEntryAction : createEntryAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="collectionId" value={collectionId} />
      {editing ? <input type="hidden" name="entryId" value={entry.id} /> : null}

      {fields.length === 0 ? (
        <p className="text-base-content/60 text-sm">
          This collection has no fields yet, so there is nothing to fill in.
        </p>
      ) : null}

      {fields.map((field) =>
        field.ok ? (
          <ValueInput
            key={field.id}
            field={field}
            value={entry?.values[field.id]}
            error={state.fieldErrors?.[field.id]?.[0]}
          />
        ) : (
          <Alert key={field.id} tone="warning" variant="soft">
            “{field.label}” is misconfigured and cannot be edited. Fix or delete
            it in the field builder.
          </Alert>
        ),
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save entry" : "Create entry"}
        </Button>
      </div>
    </form>
  );
}
