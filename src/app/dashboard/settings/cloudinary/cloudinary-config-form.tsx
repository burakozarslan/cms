"use client";

import { useActionState, useState } from "react";

import { Alert, Badge, Button, Input } from "@frontend/ui";

import type { MediaConfigStatus } from "@/lib/media-config/service";

import {
  checkMediaConnectionAction,
  saveMediaConfigAction,
  type CheckConnectionState,
  type SaveMediaConfigState,
} from "./actions";

type ConnectionBadge = "not_checked" | "ok" | "fail";

function initialBadge(status: MediaConfigStatus): ConnectionBadge {
  if (status.lastCheckOk === true) return "ok";
  if (status.lastCheckOk === false) return "fail";
  return "not_checked";
}

export function CloudinaryConfigForm({ status }: { status: MediaConfigStatus }) {
  const [saveState, saveFormAction, saving] = useActionState<
    SaveMediaConfigState,
    FormData
  >(saveMediaConfigAction, {});

  const [checkState, checkFormAction, checking] = useActionState<
    CheckConnectionState,
    FormData
  >(checkMediaConnectionAction, { status: "idle" });

  const [badge, setBadge] = useState<ConnectionBadge>(() => initialBadge(status));
  const [secretValue, setSecretValue] = useState("");

  // Adjust state in response to a completed action, during render rather
  // than in an effect — the pattern React recommends for deriving state from
  // a changed prop/value without an extra commit.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevSaveState, setPrevSaveState] = useState(saveState);
  if (saveState !== prevSaveState) {
    setPrevSaveState(saveState);
    // Saving new credentials invalidates any prior check result — see
    // saveMediaConfig, which resets last_checked_at/last_check_ok server-side.
    if (saveState.success) {
      setBadge("not_checked");
      setSecretValue("");
    }
  }

  const [prevCheckState, setPrevCheckState] = useState(checkState);
  if (checkState !== prevCheckState) {
    setPrevCheckState(checkState);
    if (checkState.status === "ok") setBadge("ok");
    else if (checkState.status === "fail") setBadge("fail");
    else if (checkState.status === "not_configured") setBadge("not_checked");
  }

  const badgeTone =
    badge === "ok" ? "success" : badge === "fail" ? "error" : "warning";
  const badgeLabel =
    badge === "ok" ? "Connected" : badge === "fail" ? "Connection failed" : "Not checked";

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <form action={saveFormAction} className="flex flex-col gap-3" noValidate>
        {saveState.success ? (
          <Alert tone="success" variant="soft">
            Media configuration saved.
          </Alert>
        ) : null}

        <Input
          label="Cloud name"
          name="cloudName"
          defaultValue={status.cloudName ?? ""}
          required
          error={saveState.fieldErrors?.cloudName?.[0]}
        />

        <Input
          label="API key"
          name="apiKey"
          defaultValue={status.apiKey ?? ""}
          required
          error={saveState.fieldErrors?.apiKey?.[0]}
        />

        <Input
          label="API secret"
          name="apiSecret"
          type="password"
          autoComplete="off"
          value={secretValue}
          onChange={(event) => setSecretValue(event.target.value)}
          placeholder={
            status.configured
              ? "Secret configured — leave blank to keep it"
              : undefined
          }
          error={saveState.fieldErrors?.apiSecret?.[0]}
        />

        <div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      <div className="flex items-center gap-3">
        <form action={checkFormAction}>
          <Button type="submit" size="sm" variant="secondary" disabled={checking}>
            {checking ? "Checking…" : "Check Connection"}
          </Button>
        </form>
        <Badge tone={badgeTone}>{badgeLabel}</Badge>
      </div>

      {checkState.status === "fail" ? (
        <Alert tone="error" variant="soft">
          Could not connect to Cloudinary with these credentials.
        </Alert>
      ) : null}

      {checkState.status === "not_configured" ? (
        <Alert tone="warning" variant="soft">
          Save your Cloudinary configuration before checking the connection.
        </Alert>
      ) : null}
    </div>
  );
}
