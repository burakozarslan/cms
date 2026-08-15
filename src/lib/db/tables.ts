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
 */
export const TENANT_SCOPED_TABLES = ["projects"] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

const SCOPED = new Set<string>(TENANT_SCOPED_TABLES);

export function isTenantScopedTable(table: string): boolean {
  return SCOPED.has(table);
}

/** Column carrying the owning tenant on every tenant-scoped table. */
export const TENANT_COLUMN = "tenant_id";
