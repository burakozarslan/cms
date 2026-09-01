export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Names like "Blog" repeat, so a collision disambiguates rather than failing:
 * "blog", "blog-2", "blog-3", …
 */
export function nextAvailableSlug(base: string, taken: Set<string>): string {
  const root = base || "project";
  if (!taken.has(root)) return root;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
