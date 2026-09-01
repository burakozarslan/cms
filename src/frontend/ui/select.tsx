import type { SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

/** Wraps FlyonUI's `select`. */
export function Select({
  label,
  error,
  hint,
  className = "",
  id,
  children,
  ...props
}: SelectProps) {
  const selectId = id ?? props.name;
  const classes = ["select", error ? "is-invalid" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="w-full">
      {label ? (
        <label className="label-text" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={classes}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && selectId ? `${selectId}-error` : undefined}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <span
          id={selectId ? `${selectId}-error` : undefined}
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
