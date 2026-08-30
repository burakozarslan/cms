"use client";

import { useState, type ChangeEvent } from "react";

import { Alert, Button } from "@frontend/ui";
import { valueInputName, type ImageConfig, type ImageValue } from "@/lib/widgets";

import type { UploadImageResult } from "@/lib/media-upload/service";

type Reason = Exclude<UploadImageResult, { ok: true }>["reason"];

const WARNING_MESSAGE: Record<"NOT_CONFIGURED", string> = {
  NOT_CONFIGURED:
    "Cloudinary isn't configured for this account yet. Set it up in Settings → Media before uploading images.",
};

const ERROR_MESSAGE: Record<Exclude<Reason, "NOT_CONFIGURED">, string> = {
  CONNECTION_FAILED:
    "Couldn't verify the Cloudinary connection. Check your credentials in Settings → Media and try again.",
  TOO_LARGE: "This file is larger than this field allows.",
  BAD_FORMAT: "This file's format isn't allowed for this field.",
  UPLOAD_FAILED: "The upload failed. Try again.",
};

/**
 * The value input for an `image` field.
 *
 * Picking a file only stores it locally — nothing is checked or contacted
 * until the author clicks "Upload" (design.md decision 5), at which point the
 * server verifies Cloudinary configuration and connectivity live before
 * attempting the upload. Once a value exists (from props or a completed
 * upload), it's synced into a hidden input the same way `richtext`'s editor
 * feeds the enclosing native `<form>` (design.md decision 6).
 */
export function ImagePicker({
  fieldId,
  label,
  required,
  config,
  value,
  error,
}: {
  fieldId: string;
  label: string;
  required: boolean;
  config: ImageConfig;
  value: unknown;
  error?: string;
}) {
  const name = valueInputName(fieldId);
  const initialValue =
    value && typeof value === "object" ? (value as ImageValue) : undefined;

  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImageValue | undefined>(initialValue);
  const [reason, setReason] = useState<Reason | null>(null);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPickedFile(file);
    setReason(null);
  }

  async function upload() {
    if (!pickedFile) return;
    setUploading(true);
    setReason(null);

    try {
      const { uploadImageAction } = await import("./image-upload-actions");
      const uploaded = await uploadImageAction(
        config,
        pickedFile,
        result?.publicId,
      );

      if (uploaded.ok) {
        setResult(uploaded.value);
        setPickedFile(null);
      } else {
        setReason(uploaded.reason);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <span className="label-text">{required ? `${label} *` : label}</span>

      {result ? (
        <img
          src={result.secureUrl}
          alt={label}
          className="border-base-content/10 max-h-48 w-auto rounded-lg border object-contain"
        />
      ) : null}

      <input
        type="file"
        accept="image/*"
        className="file-input"
        onChange={pick}
        aria-label={label}
      />

      {pickedFile ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={uploading}
            onClick={upload}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      ) : null}

      {reason === "NOT_CONFIGURED" ? (
        <Alert tone="warning" variant="soft">
          {WARNING_MESSAGE.NOT_CONFIGURED}
        </Alert>
      ) : null}

      {reason && reason !== "NOT_CONFIGURED" ? (
        <Alert tone="error" variant="soft">
          {ERROR_MESSAGE[reason]}
        </Alert>
      ) : null}

      {error ? <span className="helper-text text-error">{error}</span> : null}

      <input
        type="hidden"
        name={name}
        value={result ? JSON.stringify(result) : ""}
      />
    </div>
  );
}
