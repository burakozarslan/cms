"use client";

import { useActionState, useState } from "react";

import { Alert, Button, Input } from "@frontend/ui";

import { createApiKeyAction, type CreateApiKeyState } from "./actions";

/**
 * The one-time secret reveal.
 *
 * The token lives in `useActionState`'s response only — component state, not
 * a URL and not re-fetched — so it exists in the browser exactly once, right
 * after creation, and is gone on any reload (design.md, "Secret is
 * unrecoverable afterwards").
 */
function RevealedToken({ name, token }: { name: string; token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Alert tone="warning" variant="soft" className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        “{name}” created. Copy this token now — it will not be shown again.
      </p>
      <code className="bg-base-200 block overflow-x-auto rounded p-2 text-xs break-all">
        {token}
      </code>
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy token"}
        </Button>
      </div>
    </Alert>
  );
}

export function CreateApiKeyForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<
    CreateApiKeyState,
    FormData
  >(createApiKeyAction, {});

  return (
    <div className="flex flex-col gap-4">
      {state.createdToken && state.createdName ? (
        <RevealedToken name={state.createdName} token={state.createdToken} />
      ) : null}

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <form
        action={formAction}
        className="flex flex-col gap-3"
        noValidate
        key={state.createdToken ?? "form"}
      >
        <input type="hidden" name="projectId" value={projectId} />

        <Input
          label="Name"
          name="name"
          type="text"
          placeholder="Production site"
          required
          error={state.fieldErrors?.name?.[0]}
        />

        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Creating…" : "Create key"}
          </Button>
        </div>
      </form>
    </div>
  );
}
