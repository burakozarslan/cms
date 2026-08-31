/**
 * Tables owned by a tenant.
 *
 * Every table listed here is automatically scoped to the acting tenant by the
 * TenantScopePlugin (see ./tenant-scope-plugin.ts): reads/updates/deletes get a
 * `tenant_id = ?` predicate, and inserts get `tenant_id` injected.
 *
 * IMPORTANT: when a migration adds a new tenant-owned table, add it here in the
 * same change. A tenant-owned table missing from this list is queried unscoped,
 * which silently breaks tenant isolation.
 *
 * `tenants` and `users` are deliberately NOT listed: they are identity tables
 * used before a tenant context exists (registration, login), not tenant-owned
 * content.
 *
 * `api_keys` is a third category: tenant-owned content with a dashboard CRUD
 * surface (so it belongs here, unlike `tenants`/`users`) that *also* has to be
 * resolved before a tenant context exists — a request presents a token, not a
 * session. That pre-context lookup is confined to the single `getRootDb()`
 * carve-out in `src/lib/api-keys/resolve.ts`; every other access goes through
 * this scoping like any other tenant-owned table.
 */
export const TENANT_SCOPED_TABLES = [
  "projects",
  "collections",
  "fields",
  "entries",
  "entry_values",
  "tenant_media_config",
  "api_keys",
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

const SCOPED = new Set<string>(TENANT_SCOPED_TABLES);

export function isTenantScopedTable(table: string): boolean {
  return SCOPED.has(table);
}

/** Column carrying the owning tenant on every tenant-scoped table. */
export const TENANT_COLUMN = "tenant_id";
