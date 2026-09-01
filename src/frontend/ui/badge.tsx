import type { HTMLAttributes } from "react";

type Tone =
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error";

type Variant = "solid" | "soft" | "outline";

const TONE_CLASS: Record<Tone, string> = {
  primary: "badge-primary",
  secondary: "badge-secondary",
  accent: "badge-accent",
  neutral: "",
  info: "badge-info",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
};

const VARIANT_CLASS: Record<Variant, string> = {
  solid: "",
  soft: "badge-soft",
  outline: "badge-outline",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  variant?: Variant;
};

/** Wraps FlyonUI's `badge`. */
export function Badge({
  tone = "neutral",
  variant = "soft",
  className = "",
  ...props
}: BadgeProps) {
  const classes = ["badge", TONE_CLASS[tone], VARIANT_CLASS[variant], className]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} {...props} />;
}
