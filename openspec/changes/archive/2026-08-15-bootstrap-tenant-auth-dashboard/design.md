## Context

Greenfield repo: no `package.json`, no app code. `openspec/config.yaml` already fixes the stack (Next.js App Router, NextAuth, Kysely/SQLite, FlyonUI via a `@frontend/ui` wrapper) and one standing invariant this change must satisfy from day one: no unscoped Kysely usage against tenant-owned tables. See proposal.md - Why / What Changes for motivation and scope.

## Goals / Non-Goals

**Goals:**
- Stand up the minimum project skeleton (Next.js app, `@frontend/ui` boundary, Kysely + SQLite, migrations) needed to run register/login/dashboard.
- Implement the Tenant-Aware Query Builder as infrastructure other future changes (content, media, custom fields) can build on without re-deriving it.
- Make the tenant-ownership check for `/dashboard/[projectId]` fall out of correct use of the query builder, not a separately-maintained check.

**Non-Goals:**
- Any content-type/custom-field system, media/Cloudinary integration, or FTS5 search — separate future changes.
- Production deployment target (edge/Turso vs. node/better-sqlite3) — deferred, see Open Questions.
- A general-purpose monorepo/workspace tooling setup — not needed for a single Next.js app.

## Decisions

**1. `@frontend/ui` as a path-aliased folder, not a separate workspace package.**
`config.yaml` calls it both a "package" and a "folder." A full pnpm/npm workspace (multiple `package.json`s) is real overhead a single-app project doesn't need yet. Decision: implement it as `src/frontend/ui/` with a TS path alias (`@frontend/ui` → `src/frontend/ui/index.ts`), enforced by convention (and, if noisy in practice, an eslint `no-restricted-imports` rule blocking direct FlyonUI imports outside that folder). If the project later splits into multiple apps sharing UI, promoting the folder to a real workspace package is a mechanical move, not a rewrite.
*Alternative considered:* pnpm workspace with `packages/ui`. Rejected for now — no second consumer exists yet to justify the tooling cost.

**2. Tenant-Aware Query Builder as a Kysely plugin, instantiated per-request from the session.**
A Kysely `KyselyPlugin` (`transformQuery`/`transformResult`) that, given a fixed list of tenant-owned tables (`projects`, and future tables as they're added), automatically ANDs a `tenant_id = ?` predicate onto `select`/`update`/`delete` queries and injects `tenant_id` on `insert`, using a `tenantId` bound in closure at construction time. A `getTenantDb(tenantId)` factory builds this from the session's `tenantId` — never from a route param or client input — inside route handlers/server actions.
This means the "existence check" and the "ownership check" for `/dashboard/[projectId]` collapse into one thing: querying `projects` through the tenant-scoped instance for `id = projectId` simply cannot return a row owned by a different tenant. There's no separate `if (project.tenantId !== session.tenantId)` branch to forget.
*Alternative considered:* per-call-site manual `.where('tenant_id', '=', tenantId)`. Rejected — this is exactly the failure mode the invariant exists to prevent (one missed `.where` leaks cross-tenant data).
*Alternative considered:* SQLite session-scoped variables / RLS-style enforcement. Not available in SQLite (unlike Postgres RLS); rejected.

**3. Auth: NextAuth Credentials provider, JWT strategy, `userId`/`tenantId` embedded at sign-in.**
Credentials provider requires JWT sessions (no database session strategy). `callbacks.jwt` sets `userId`/`tenantId` on first sign-in; `callbacks.session` copies them onto `session.user`. Password hashing via `bcryptjs` (pure JS — avoids adding a second native-binding dependency alongside `better-sqlite3`, keeps local setup friction-free).
*Alternative considered:* `argon2` (stronger, but native bindings + no clear need yet at this scale). Can revisit if/when a security review calls for it.

**4. SQLite driver: `better-sqlite3` for now; migrations via Kysely's built-in migrator.**
Synchronous, zero-config, fits local/dev. Kysely's dialect abstraction means swapping to `@libsql/client` for edge/Turso later is a driver-construction change, not a query rewrite, as long as queries stay dialect-portable (already a project convention). Migrations live in `db/migrations/*.ts`, run through Kysely's `Migrator` via a small CLI script (`scripts/migrate.ts`).

**5. Project slugs: derived from name, uniqueness enforced within `(tenant_id, slug)`.**
Kebab-case the submitted name; on collision within the same tenant, append a short numeric suffix (`-2`, `-3`, ...) rather than rejecting outright, since names like "Blog" are a likely repeat pattern (e.g., after renaming). Uniqueness is DB-enforced via a unique index, not just checked in application code, to close the race between check and insert.

## Risks / Trade-offs

- [Risk] A future tenant-owned table gets added without being registered in the query-builder's table list → queries against it stay unscoped. → *Mitigation:* a single explicit `TENANT_SCOPED_TABLES` constant colocated with the migrations that add such tables, plus a note in AGENTS.md to update it in the same PR that adds a tenant-owned table.
- [Risk] `better-sqlite3`'s native bindings complicate a future serverless/edge deployment. → *Mitigation:* deferred by design (#4) — swapping the Kysely dialect is a contained change.
- [Risk] JWT sessions can go stale relative to DB state. → *Low risk here specifically:* since a user maps 1:1 to a tenant and that mapping never changes post-registration, there's no "role changed, JWT still says old role" staleness case in this slice. Worth re-examining once roles/permissions are introduced.

## Migration Plan

Greenfield: the initial Kysely migration creates `users`, `tenants`, `projects`. No existing data, so no data-migration or backfill concerns. Rollback is the migration's `down()` (drops the three tables) plus reverting the feature branch — nothing else in the system depends on this schema yet.

## Open Questions

- Production SQLite driver (`better-sqlite3` vs. `@libsql/client`/Turso) — doesn't affect this change's specs or approach (decision #4 covers local/dev), can be settled when a deployment target is chosen.
