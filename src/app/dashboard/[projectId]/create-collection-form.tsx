"use client";

import { useActionState } from "react";

import { Alert, Button, Input } from "@frontend/ui";

import {
  createCollectionAction,
  type CreateCollectionState,
} from "./actions";

export function CreateCollectionForm({
  projectId,
  submitLabel = "Create collection",
}: {
  projectId: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    CreateCollectionState,
    FormData
  >(createCollectionAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <input type="hidden" name="projectId" value={projectId} />

      <Input
        label="Collection name"
        name="name"
        type="text"
        placeholder="Blog Post"
        required
        error={state.fieldErrors?.name?.[0]}
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : submitLabel}
      </Button>
    </form>
  );
}
