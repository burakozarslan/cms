import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

/** Wraps FlyonUI's `textarea`. */
export function Textarea({
  label,
  error,
  hint,
  className = "",
  id,
  ...props
}: TextareaProps) {
  const areaId = id ?? props.name;
  const classes = ["textarea", error ? "is-invalid" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="w-full">
      {label ? (
        <label className="label-text" htmlFor={areaId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={areaId}
        className={classes}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && areaId ? `${areaId}-error` : undefined}
        {...props}
      />
      {error ? (
        <span
          id={areaId ? `${areaId}-error` : undefined}
          className="helper-text text-error"
        >
          {error}
        </span>
      ) : hint ? (
        <span className="helper-text">{hint}</span>
      ) : null}
    </div>
  );
}
