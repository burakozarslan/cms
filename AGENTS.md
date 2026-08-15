# Data Access Rules

## Tenant Isolation

- **Never query tenant-owned tables through `getRootDb()`.** Route handlers, server actions, and pages MUST use `getTenantDb(session.user.tenantId)` (`src/lib/db/client.ts`). The `TenantScopePlugin` adds `tenant_id = ?` to reads/updates/deletes and injects it on inserts, so an ownership check and an existence check become the same query.
- **`getRootDb()` is reserved** for migrations and identity flows that run before a tenant context exists (registration, credential lookup at login).
- **The tenant id must come from the session**, never from a route param, query string, header, or form field.
- **When a migration adds a new tenant-owned table, add it to `TENANT_SCOPED_TABLES`** (`src/lib/db/tables.ts`) in the same change. A tenant-owned table missing from that list is queried unscoped, which silently breaks isolation.

# UI & Frontend Development Rules

## FlyonUI Integration

- Whenever you are generating, modifying, or refactoring UI components, pages, templates, or HTML/Tailwind markup:
  1. **Query FlyonUI MCP first**: Always consult the `flyonui` MCP server tools to search and fetch official FlyonUI component structures, semantic classes, and block templates before writing UI markup.
  2. **Use Semantic Classes**: Prioritize official FlyonUI semantic classes (e.g., `btn`, `card`, `drawer`, `accordion`, `modal`, `navbar`) over ad-hoc raw utility styles.
  3. **Interactive Components**: Ensure necessary FlyonUI JavaScript plugins and data attributes (such as `data-collapse`, `data-overlay`, `data-tabs`) are included when interactive elements are built.
  4. **Maintain Consistency**: Follow the FlyonUI design system conventions for colors, typography, sizing, and dark mode support.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
