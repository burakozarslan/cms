import type { HTMLAttributes } from "react";

type Tone = "primary" | "secondary" | "neutral" | "info" | "success" | "warning" | "error";
type Variant = "solid" | "soft" | "outline";

const TONE_CLASS: Record<Tone, string> = {
  primary: "alert-primary",
  secondary: "alert-secondary",
  neutral: "",
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};

const VARIANT_CLASS: Record<Variant, string> = {
  solid: "",
  soft: "alert-soft",
  outline: "alert-outline",
};

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  variant?: Variant;
};

export function Alert({
  tone = "error",
  variant = "solid",
  className = "",
  ...props
}: AlertProps) {
  const classes = [
    "alert",
    TONE_CLASS[tone],
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div role="alert" className={classes} {...props} />;
}

