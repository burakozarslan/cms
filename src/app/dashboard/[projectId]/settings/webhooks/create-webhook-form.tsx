"use client";

import { useActionState, useState } from "react";

import { Alert, Button, Input, Switch } from "@frontend/ui";

import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@/lib/webhooks/events";

import { createWebhookAction, type CreateWebhookState } from "./actions";

const CREATABLE_EVENTS = WEBHOOK_EVENT_TYPES.filter(
  (event): event is Exclude<WebhookEventType, "webhook.test"> => event !== "webhook.test",
);

const EVENT_LABELS: Record<string, string> = {
  "entry.published": "Entry published",
  "entry.unpublished": "Entry unpublished",
  "entry.deleted": "Entry deleted",
};

/**
 * The one-time secret reveal, same pattern as `CreateApiKeyForm` (design.md,
 * "Secret storage: encrypted, not hashed").
 */
function RevealedSecret({ name, secret }: { name: string; secret: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Alert tone="warning" variant="soft" className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        “{name}” created. Copy this signing secret now — it will not be shown
        again.
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

export function CreateWebhookForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<
    CreateWebhookState,
    FormData
  >(createWebhookAction, {});

  return (
    <div className="flex flex-col gap-4">
      {state.createdSecret && state.createdName ? (
        <RevealedSecret name={state.createdName} secret={state.createdSecret} />
      ) : null}

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <form
        action={formAction}
        className="flex flex-col gap-3"
        noValidate
        key={state.createdSecret ?? "form"}
      >
        <input type="hidden" name="projectId" value={projectId} />

        <Input
          label="Name"
          name="name"
          type="text"
          placeholder="Netlify build hook"
          required
          error={state.fieldErrors?.name?.[0]}
        />

        <Input
          label="Target URL"
          name="targetUrl"
          type="url"
          placeholder="https://api.netlify.com/build_hooks/…"
          required
          error={state.fieldErrors?.targetUrl?.[0]}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="label-text mb-1">Events</legend>
          {CREATABLE_EVENTS.map((event) => (
            <Switch
              key={event}
              name={`event:${event}`}
              value="on"
              label={EVENT_LABELS[event] ?? event}
            />
          ))}
          {state.fieldErrors?.events?.[0] ? (
            <span className="helper-text text-error">
              {state.fieldErrors.events[0]}
            </span>
          ) : null}
        </fieldset>

        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Creating…" : "Create webhook"}
          </Button>
        </div>
      </form>
    </div>
  );
}
