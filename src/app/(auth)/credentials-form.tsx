"use client";

import { useActionState } from "react";

import { Alert, Button, Card, CardBody, CardTitle, Input } from "@frontend/ui";

import type { AuthFormState } from "./actions";

type Props = {
  title: string;
  submitLabel: string;
  action: (
    prev: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  passwordAutoComplete: "current-password" | "new-password";
  footer: React.ReactNode;
};

export function CredentialsForm({
  title,
  submitLabel,
  action,
  passwordAutoComplete,
  footer,
}: Props) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    {},
  );

  return (
    <Card className="bg-base-100 shadow">
      <CardBody className="gap-4">
        <CardTitle>{title}</CardTitle>

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            error={state.fieldErrors?.email?.[0]}
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete={passwordAutoComplete}
            required
            error={state.fieldErrors?.password?.[0]}
          />
          <Button type="submit" block disabled={pending}>
            {pending ? "Working…" : submitLabel}
          </Button>
        </form>

        <p className="text-base-content/70 text-sm">{footer}</p>
      </CardBody>
    </Card>
  );
}
