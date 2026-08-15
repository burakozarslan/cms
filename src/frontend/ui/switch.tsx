import type { InputHTMLAttributes } from "react";

export type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: string;
  error?: string;
};

/**
 * Wraps FlyonUI's `switch`.
 *
 * A checkbox underneath, so it posts like one and is keyboard-operable without
 * any JavaScript.
 */
export function Switch({
  label,
  error,
  className = "",
  id,
  ...props
}: SwitchProps) {
  const switchId = id ?? props.name;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <input
          id={switchId}
          type="checkbox"
          className={`switch switch-primary ${className}`.trim()}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && switchId ? `${switchId}-error` : undefined}
          {...props}
        />
        {label ? (
          <label className="label-text" htmlFor={switchId}>
            {label}
          </label>
        ) : null}
      </div>
      {error ? (
        <span
          id={switchId ? `${switchId}-error` : undefined}
          className="helper-text text-error"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
