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

export interface CollectionsTable {
  id: string;
  tenant_id: TenantId;
  project_id: string;
  name: string;
  slug: string;
  /** Null until designated, and nulled again if that field is deleted. */
  title_field_id: string | null;
  /** Cache key component; bumped by every schema-mutating transaction. */
  schema_version: Generated<number>;
  created_at: Generated<string>;
}

export interface FieldsTable {
  id: string;
  tenant_id: TenantId;
  collection_id: string;
  key: string;
  label: string;
  /** A widget type name; validated by the registry, not by the database. */
  widget: string;
  /** SQLite has no boolean: 0 or 1. */
  required: Generated<number>;
  position: number;
  /** JSON, shape determined by `widget`. */
  config: Generated<string>;
  created_at: Generated<string>;
}

export interface EntriesTable {
  id: string;
  tenant_id: TenantId;
  collection_id: string;
  slug: string;
  status: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface EntryValuesTable {
  id: string;
  tenant_id: TenantId;
  entry_id: string;
  field_id: string;
  /** JSON, shape determined by the field's widget and config. */
  value: string;
}

export interface DB {
  tenants: TenantsTable;
  users: UsersTable;
  projects: ProjectsTable;
  collections: CollectionsTable;
  fields: FieldsTable;
  entries: EntriesTable;
  entry_values: EntryValuesTable;
}
