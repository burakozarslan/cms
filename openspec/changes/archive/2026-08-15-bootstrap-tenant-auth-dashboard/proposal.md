## Why

The project currently has no application code — no scaffold, no auth, no database layer. Every future capability (content types, media, custom fields) depends on two things existing first: a way for a tenant to authenticate, and a way for their data to stay isolated from every other tenant's data. This change bootstraps both, plus the minimal dashboard surface (project list, create project) that gives a logged-in tenant somewhere to land.

## What Changes

- Scaffold the Next.js App Router project structure, including the `@frontend/ui` package referenced by `openspec/config.yaml` as the required FlyonUI wrapper boundary.
- Add SQLite + Kysely with an initial migration for `users`, `tenants`, and `projects` tables.
- Introduce the **Tenant-Aware Query Builder**: a Kysely wrapper that automatically scopes queries against tenant-owned tables by `tenant_id`, per the project's standing invariant that unscoped Kysely usage in route handlers is forbidden.
- Add NextAuth with a Credentials provider (email + password), JWT session strategy, embedding `{ userId, tenantId }` in the token.
- Build `/register` and `/login` pages (public).
- Build `/dashboard` (tenant-level: lists the tenant's projects, empty-state "create your first project").
- Build `/dashboard/[projectId]` (project-level shell), gated by an explicit ownership check — `project.tenant_id === session.tenantId` — not just existence.
- **BREAKING**: none (greenfield; no existing behavior to preserve).

Explicitly out of scope for this change (deferred to later changes):
- Email verification, password reset.
- Content types, custom fields, media/Cloudinary.
- Public-facing project URLs / rendering (headless-only for now; public URLs arrive with webhooks).
- Project templates (blog/business starting points) — v1 project creation is name-only.

## Capabilities

### New Capabilities
- `tenant-auth`: Tenant + user registration, login, logout, and session shape (JWT carrying `userId`/`tenantId`) via NextAuth Credentials provider.
- `tenant-data-access`: The Tenant-Aware Query Builder wrapper — automatic `tenant_id` scoping for tenant-owned tables, and the prohibition on raw/unscoped Kysely usage in route handlers.
- `project-management`: Creating and listing projects within a tenant, and enforcing tenant-ownership checks on project-scoped routes.

### Modified Capabilities
(none — greenfield)

## Impact

- **New code**: Next.js app scaffold, `@frontend/ui` package, `db/` migrations + Kysely setup, `lib/tenant-query-builder` (or equivalent), NextAuth config, `/register`, `/login`, `/dashboard`, `/dashboard/[projectId]` routes.
- **New dependencies**: `next`, `next-auth`, `kysely`, `better-sqlite3` (or `@libsql/client`), `zod`, `bcrypt`/`argon2` for password hashing, FlyonUI's Tailwind plugin.
- **Database**: new SQLite database file and initial migration (`users`, `tenants`, `projects`). No existing data — no destructive migration risk.
- **Rollback**: since this is the first schema and no other capability depends on it yet, rollback is reverting the migration file and the feature branch; no data-migration concerns for existing rows because none exist.
- **Indexing**: unique index on `users.email`; index on `projects.tenant_id`; unique index on `projects (tenant_id, slug)` to keep project slugs unambiguous within a tenant.
- **Tenant isolation boundary**: session (JWT) is the source of truth for `tenantId`; the Tenant-Aware Query Builder enforces it at the query layer; project-scoped routes additionally verify ownership before rendering or mutating, since `projectId` comes from the URL, not the session.
