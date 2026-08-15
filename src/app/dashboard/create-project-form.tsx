"use client";

import { useActionState } from "react";

import { Alert, Button, Input } from "@frontend/ui";

import { createProjectAction, type CreateProjectState } from "./actions";

export function CreateProjectForm({
  submitLabel = "Create project",
}: {
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    CreateProjectState,
    FormData
  >(createProjectAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Input
        label="Project name"
        name="name"
        type="text"
        placeholder="Personal blog"
        required
        error={state.fieldErrors?.name?.[0]}
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : submitLabel}
      </Button>
    </form>
  );
}
