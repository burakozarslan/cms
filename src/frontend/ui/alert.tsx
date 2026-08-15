import type { HTMLAttributes } from "react";

type Tone = "error" | "success" | "info" | "warning";

const TONE_CLASS: Record<Tone, string> = {
  error: "alert-error",
  success: "alert-success",
  info: "alert-info",
  warning: "alert-warning",
};

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
};

export function Alert({ tone = "error", className = "", ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={`alert ${TONE_CLASS[tone]} ${className}`.trim()}
      {...props}
    />
  );
}
