/**
 * Collection slugs are kebab-case (`slugify` in `src/lib/projects/slug.ts`)
 * and may contain characters GraphQL names cannot (`-`). GraphQL names must
 * match `/^[_A-Za-z][_0-9A-Za-z]*$/`, so every generated type or field name
 * is derived from a collection's slug through these two helpers rather than
 * used verbatim.
 */

function splitSlug(slug: string): string[] {
  return slug.split(/[-_]+/).filter(Boolean);
}

/** `blog-posts` -> `BlogPosts`, for object type names. */
export function pascalCaseFromSlug(slug: string): string {
  const parts = splitSlug(slug);
  const joined = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  // A slug starting with a digit (rare — slugify allows it) would produce an
  // invalid leading-digit GraphQL name; prefix rather than reject.
  return /^[0-9]/.test(joined) ? `Collection${joined}` : joined || "Collection";
}

/** `blog-posts` -> `blogPosts`, for query field names. */
export function camelCaseFromSlug(slug: string): string {
  const pascal = pascalCaseFromSlug(slug);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
