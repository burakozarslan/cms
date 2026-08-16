## Why

Tenants have no way to connect their own Cloudinary account for media storage — there is no media/upload integration in the app today. Before any upload feature can be built, each tenant needs a place to store and verify their own `cloud_name` / `api_key` / `api_secret`, scoped per-tenant and with the secret encrypted at rest. This change adds that configuration surface as a new "Media" tab in dashboard settings, including a way to verify the credentials work before relying on them.

## What Changes

- Add a "Media" tab to `/dashboard/settings` (alongside the existing "Password" tab) for entering Cloudinary configuration: `cloud_name`, `api_key`, `api_secret`.
- Add a new `tenant_media_config` table (one row per tenant) storing `cloud_name`, `api_key`, and an encrypted `api_secret`, plus last-connection-check state (`last_checked_at`, `last_check_ok`).
- Register `tenant_media_config` in `TENANT_SCOPED_TABLES` so the existing tenant-scope Kysely plugin enforces isolation automatically.
- Introduce the app's first encryption-at-rest helper (`src/lib/crypto/`, AES-256-GCM) keyed by a new server-only env var, used to encrypt `api_secret` before storage and decrypt it only when signing/verifying server-side.
- Add two server actions: `saveMediaConfig` (validate, encrypt, upsert) and `checkMediaConnection` (decrypt, call Cloudinary Admin API ping, persist and return pass/fail).
- Add a "Check Connection" button to the Media tab with a red/green/unknown status indicator (using the existing `Badge` component) reflecting the last check result.
- `api_secret` is never sent back to the client after being saved; the field shows a masked "configured" state, and leaving it blank on save preserves the existing value.

## Capabilities

### New Capabilities
- `media-configuration`: Tenant-scoped Cloudinary credential storage, encryption at rest, and connection verification, exposed via a dashboard settings tab.

### Modified Capabilities
(none — this is additive; no existing capability's requirements change)

## Impact

- **New code**: `src/app/dashboard/settings/cloudinary/{page.tsx,cloudinary-config-form.tsx,actions.ts}`, `src/lib/crypto/` (encryption helper), `src/lib/media-config/` (or similar) for the tenant config read/write + Cloudinary ping call.
- **Modified code**: `src/app/dashboard/settings/layout.tsx` (add tab entry), `src/lib/db/tables.ts` (register new tenant-scoped table), `src/lib/db/types.ts` (Kysely row types).
- **New migration**: `db/migrations/003_tenant_media_config.ts` creating `tenant_media_config`.
- **New env var**: `MEDIA_CONFIG_ENCRYPTION_KEY` (server-only, required for encrypt/decrypt). Documented in `.env.example` / deployment docs.
- **Dependencies**: adds `cloudinary` (or direct `fetch` to Cloudinary's Admin API — decided in design.md) as a server-side-only dependency.
- **No breaking changes**: purely additive; no existing routes, actions, or specs change behavior.
- **Rollback**: the migration is additive-only (new table, no column changes to existing tables) and reversible via a `down` migration that drops `tenant_media_config`; no data migration of existing rows is needed since no prior data exists for this capability.
