"use client";

import { useActionState, useEffect, useRef } from "react";

import { Alert, Button, Input } from "@frontend/ui";

import { changePasswordAction, type ChangePasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<
    ChangePasswordState,
    FormData
  >(changePasswordAction, {});

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex max-w-sm flex-col gap-3"
      noValidate
    >
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert tone="success" variant="soft">
          Your password has been changed.
        </Alert>
      ) : null}

      <Input
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword?.[0]}
      />

      <Input
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.newPassword?.[0]}
      />

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
