"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "./button";

export type ConfirmDialogProps = {
  /** The control that opens the dialog. */
  trigger: ReactNode;
  title: string;
  /** What confirming will do — state the damage plainly. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Form action submitted when the user confirms — typically a server action. */
  action: (formData: FormData) => void | Promise<void>;
  /** Hidden values posted alongside, e.g. the ids the action operates on. */
  hidden?: Record<string, string>;
  destructive?: boolean;
};

/**
 * A confirmation built on the native `<dialog>` element, styled with FlyonUI's
 * modal classes.
 *
 * FlyonUI's own overlay plugin needs its JavaScript bundle, which this app does
 * not load; `<dialog>` gives focus trapping, Escape-to-close, and the backdrop
 * from the platform instead.
 */
export function ConfirmDialog({
  trigger,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  action,
  hidden,
  destructive = false,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>

      <dialog
        ref={ref}
        className="modal-content bg-base-100 m-auto w-full max-w-md rounded-lg p-0 shadow-lg backdrop:bg-black/40"
        onClose={() => setOpen(false)}
        aria-labelledby="confirm-dialog-title"
      >
        <form
          action={action}
          onSubmit={() => setOpen(false)}
          className="flex flex-col gap-4 p-6"
        >
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <h2 id="confirm-dialog-title" className="text-base font-semibold">
            {title}
          </h2>

          <div className="text-base-content/70 text-sm">{children}</div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={destructive ? "error" : "primary"}
            >
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
