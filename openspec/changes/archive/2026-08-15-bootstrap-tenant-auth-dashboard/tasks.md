## 1. Project Scaffold

- [x] 1.1 Initialize Next.js App Router project (TypeScript) at repo root, with `package.json`, `tsconfig.json`, Tailwind + FlyonUI configured
- [x] 1.2 Add `@frontend/ui` path alias (`src/frontend/ui/`) in `tsconfig.json`; add an eslint rule blocking direct FlyonUI imports outside that folder
- [x] 1.3 Add core dependencies: `next-auth`, `kysely`, `better-sqlite3`, `zod`, `bcryptjs`
- [x] 1.4 Add `.env` / `.env.example` for `DATABASE_PATH`, `NEXTAUTH_SECRET`

## 2. Database & Migrations

- [x] 2.1 Set up Kysely `Dialect` for `better-sqlite3` and a typed `DB` interface (`users`, `tenants`, `projects`)
- [x] 2.2 Write initial migration creating `tenants`, `users` (unique index on `email`, FK to `tenants`), `projects` (FK to `tenants`, unique index on `(tenant_id, slug)`)
- [x] 2.3 Add `scripts/migrate.ts` running Kysely's `Migrator` against `db/migrations/`
- [x] 2.4 Run the migration locally and confirm the schema is created

## 3. Tenant-Aware Query Builder

- [x] 3.1 Define `TENANT_SCOPED_TABLES` constant listing tenant-owned tables (starts with `projects`)
- [x] 3.2 Implement the Kysely plugin that adds `tenant_id = ?` to select/update/delete and injects `tenant_id` on insert for tables in `TENANT_SCOPED_TABLES`
- [x] 3.3 Implement `getTenantDb(tenantId)` factory that constructs a `Kysely` instance with the plugin bound to the given `tenantId`
- [x] 3.4 Add a lint/convention note (AGENTS.md or code comment) that new tenant-owned tables must be added to `TENANT_SCOPED_TABLES` in the same change
- [x] 3.5 Unit test: query via `getTenantDb(A)` never returns rows seeded under tenant B

## 4. Auth (NextAuth)

- [x] 4.1 Configure NextAuth with Credentials provider (email + password) and `session: { strategy: "jwt" }`
- [x] 4.2 Implement password hashing/verification with `bcryptjs` in the `authorize` callback
- [x] 4.3 Implement `callbacks.jwt` to embed `userId`/`tenantId` into the token on first sign-in
- [x] 4.4 Implement `callbacks.session` to expose `userId`/`tenantId` on `session.user`
- [x] 4.5 Add middleware (or per-route guard) redirecting unauthenticated requests to `/login` for `/dashboard` and `/dashboard/**`

## 5. Register & Login Pages

- [x] 5.1 Build `/register` page (FlyonUI form via `@frontend/ui`) with Zod-validated email/password input
- [x] 5.2 Implement registration server action: validate input, reject duplicate email, create `tenant` + `user` in one transaction, hash password, sign in
- [x] 5.3 Build `/login` page (FlyonUI form via `@frontend/ui`) with Zod-validated input and generic invalid-credentials error
- [x] 5.4 Wire NextAuth `signOut` for logout (e.g., a button in the dashboard shell)

## 6. Dashboard (Tenant-Level)

- [x] 6.1 Build `/dashboard` page: fetch projects via `getTenantDb(session.tenantId)`, render list
- [x] 6.2 Build empty-state UI ("create your first project") shown when the tenant has zero projects
- [x] 6.3 Implement create-project server action: validate non-empty name via Zod, generate kebab-case slug, disambiguate on collision within `(tenant_id, slug)`, insert via `getTenantDb`
- [x] 6.4 Build create-project form (FlyonUI via `@frontend/ui`), name-only input

## 7. Project Workspace (Project-Level)

- [x] 7.1 Build `/dashboard/[projectId]` route: look up the project via `getTenantDb(session.tenantId).selectFrom('projects').where('id', '=', projectId)`, `notFound()` if no row returns
- [x] 7.2 Confirm (via test, task 8.3) that this lookup pattern denies access to another tenant's project id, not just a nonexistent one

## 8. Tests

- [x] 8.1 Unit test: registration rejects duplicate email and invalid input, creates exactly one tenant + user on success
- [x] 8.2 Unit test: login rejects wrong password/unknown email with a generic error; succeeds and issues a session with `tenantId` on correct credentials
- [x] 8.3 Integration test: tenant A cannot read or reach tenant B's project via `/dashboard/[projectId]` (id substitution) or via the project list
- [x] 8.4 Integration test: unauthenticated request to `/dashboard` and `/dashboard/[projectId]` redirects to `/login`
- [x] 8.5 Run focused tests for this change, then the full suite, before marking complete
