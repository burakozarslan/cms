import type { ColumnType, Generated } from "kysely";

/**
 * The owning tenant on a tenant-scoped table.
 *
 * Optional on insert and forbidden on update: `TenantScopePlugin` stamps it
 * from the session, so setting it by hand is at best redundant and at worst an
 * attempt to write into another tenant.
 */
type TenantId = ColumnType<string, string | undefined, never>;

export interface TenantsTable {
  id: string;
  name: string;
  created_at: Generated<string>;
}

export interface UsersTable {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  created_at: Generated<string>;
}

export interface ProjectsTable {
  id: string;
  tenant_id: TenantId;
  name: string;
  slug: string;
  created_at: Generated<string>;
}

export interface DB {
  tenants: TenantsTable;
  users: UsersTable;
  projects: ProjectsTable;
}
