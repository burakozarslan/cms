export type IconProps = {
  /** SVG path data on a 24×24 viewBox. */
  path: string;
  className?: string;
  title?: string;
};

/**
 * A stroked 24×24 glyph.
 *
 * Inline SVG rather than an icon-font class, because this project does not load
 * an icon plugin — a `icon-[...]` class would render as blank space.
 */
export function Icon({ path, className = "size-5", title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}
