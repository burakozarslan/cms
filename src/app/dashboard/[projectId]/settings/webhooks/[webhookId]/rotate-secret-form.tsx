"use client";

import { useActionState, useState } from "react";

import { Alert, Button } from "@frontend/ui";

import { rotateWebhookSecretAction, type RotateSecretState } from "../actions";

function RevealedSecret({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Alert tone="warning" variant="soft" className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        Secret rotated. Copy it now — it will not be shown again.
      </p>
      <code className="bg-base-200 block overflow-x-auto rounded p-2 text-xs break-all">
        {secret}
      </code>
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy secret"}
        </Button>
      </div>
    </Alert>
  );
}

export function RotateSecretForm({
  projectId,
  webhookId,
}: {
  projectId: string;
  webhookId: string;
}) {
  const [state, formAction, pending] = useActionState<
    RotateSecretState,
    FormData
  >(rotateWebhookSecretAction, {});

  return (
    <div className="flex flex-col gap-3">
      {state.revealedSecret ? <RevealedSecret secret={state.revealedSecret} /> : null}

      <form action={formAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="webhookId" value={webhookId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Rotating…" : "Rotate secret"}
        </Button>
      </form>
    </div>
  );
}
