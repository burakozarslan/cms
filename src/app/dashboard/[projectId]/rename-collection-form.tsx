"use client";

import { useActionState, useEffect, useRef } from "react";

import { Alert, Button, Input } from "@frontend/ui";

import { updateCollectionAction, type UpdateCollectionState } from "./actions";

export function RenameCollectionForm({
  projectId,
  collectionId,
  name,
  onDone,
}: {
  projectId: string;
  collectionId: string;
  name: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    UpdateCollectionState,
    FormData
  >(updateCollectionAction, {});

  const wasPending = useRef(false);

  // A submission that finishes without error/fieldErrors succeeded — close the form.
  useEffect(() => {
    if (wasPending.current && !pending && !state.error && !state.fieldErrors) {
      onDone();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="collectionId" value={collectionId} />

      <Input
        label="Collection name"
        name="name"
        type="text"
        defaultValue={name}
        required
        error={state.fieldErrors?.name?.[0]}
      />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
