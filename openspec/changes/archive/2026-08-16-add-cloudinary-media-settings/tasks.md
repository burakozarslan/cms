## 1. Encryption helper

- [x] 1.1 Add `MEDIA_CONFIG_ENCRYPTION_KEY` env var (32-byte, base64) to `.env.example` and local `.env`, with a comment explaining it's required and irreplaceable once secrets are stored
- [x] 1.2 Create `src/lib/crypto/index.ts` with `encrypt(plaintext: string): string` / `decrypt(ciphertext: string): string` using AES-256-GCM, storing IV + auth tag + ciphertext together (e.g. `iv:tag:ciphertext`, base64), validating the key from env at module load
- [x] 1.3 Add unit tests for `encrypt`/`decrypt`: round-trip correctness, tampered-ciphertext rejection, missing/malformed key fails fast

## 2. Database

- [x] 2.1 Add migration `db/migrations/003_tenant_media_config.ts` creating `tenant_media_config` (`tenant_id` PK/FK, `cloud_name`, `api_key`, `api_secret_enc`, `last_checked_at`, `last_check_ok`, `created_at`, `updated_at`), with a `down` that drops it
- [x] 2.2 Add `TenantMediaConfig` row type to `src/lib/db/types.ts` and register the table in the Kysely `Database` interface
- [x] 2.3 Register `tenant_media_config` in `TENANT_SCOPED_TABLES` (`src/lib/db/tables.ts`)
- [x] 2.4 Run the migration locally and confirm the table exists with the tenant-scope plugin applying to it (verify an insert without explicit `tenant_id` still gets scoped correctly)

## 3. Media config data access

- [x] 3.1 Create `src/lib/media-config/` (or similar) with functions to get the current tenant's config (existence + non-secret fields + last check state only, never decrypted secret), upsert a config (encrypting `api_secret` via `src/lib/crypto`, resetting `last_checked_at`/`last_check_ok` to null), and record a check result (`last_checked_at`, `last_check_ok`)
- [x] 3.2 Ensure the upsert path uses `.values()` with `ON CONFLICT (tenant_id) DO UPDATE`, consistent with the tenant-scope plugin's insert constraints
- [x] 3.3 Add `cloudinary` as a server-side dependency

## 4. Cloudinary connection check

- [x] 4.1 Implement a server-only function that decrypts the stored `api_secret`, configures the Cloudinary SDK per-call (not via global config, to stay tenant-isolated), and calls the Admin API ping/usage check
- [x] 4.2 Handle and normalize failure cases (invalid credentials, network error, timeout) into a simple ok/fail result without leaking raw error/credential details to the client

## 5. Settings tab UI

- [x] 5.1 Add a "Media" entry to the `TABS` array in `src/app/dashboard/settings/layout.tsx`, linking to `/dashboard/settings/cloudinary`
- [x] 5.2 Create `src/app/dashboard/settings/cloudinary/page.tsx` (Card-wrapped, `requireSession`-gated like the password page), loading existing config state (configured vs. not, last check status) server-side
- [x] 5.3 Create `src/app/dashboard/settings/cloudinary/actions.ts` with `saveMediaConfigAction` (`"use server"`, `useActionState`-compatible, `requireSession()`-gated, field validation, blank-secret-preserves-existing behavior) and `checkMediaConnectionAction` (`"use server"`, `requireSession()`-gated)
- [x] 5.4 Create `src/app/dashboard/settings/cloudinary/cloudinary-config-form.tsx` (client component) with `cloud_name`/`api_key`/`api_secret` inputs, masked placeholder for an already-configured secret, a Save button, and a separate "Check Connection" button
- [x] 5.5 Add a status indicator using `Badge` (`tone="success"` / `"error"` / `"warning"`) reflecting not-yet-checked / passed / failed state, sourced from `last_check_ok`/`last_checked_at`

## 6. Verification

- [x] 6.1 Manually verify: save config for a tenant, reload page, confirm secret shows masked/configured and not in plaintext in the rendered HTML or network response
- [x] 6.2 Manually verify: Check Connection against valid Cloudinary credentials shows green/success and persists across reload
- [x] 6.3 Manually verify: Check Connection against invalid credentials shows red/failure without throwing an unhandled error
- [x] 6.4 Manually verify: saving new credentials after a passed check resets the status to not-yet-checked
- [x] 6.5 Manually verify tenant isolation: two tenants each save distinct configs; confirm neither can read or affect the other's row (e.g. via direct DB inspection)
- [x] 6.6 Confirm unauthenticated requests to the settings page/actions are redirected/rejected, consistent with the password settings page
