## Context

See proposal.md - Why. Relevant existing patterns this builds on:

- `src/app/dashboard/settings/password/{page.tsx,change-password-form.tsx,actions.ts}` — the Card-wrapped page + `useActionState` client form + `"use server"` action pattern this change mirrors.
- `src/app/dashboard/settings/layout.tsx` — flat `TABS` array driving the settings nav.
- `src/lib/db/tenant-scope-plugin.ts` + `src/lib/db/tables.ts` (`TENANT_SCOPED_TABLES`) — Kysely `OperationNodeTransformer` plugin that auto-injects `tenant_id` on selects/updates/deletes/inserts for listed tables. Inserts on scoped tables must use `.values()` (not `insert...select`/`defaultValues`).
- `src/lib/auth/index.ts` (`requireSession`) — session carries `tenantId`; all tenant scoping must derive from it, never from client-supplied form/route data.
- `db/migrations/001_initial.ts`, `002_content_model.ts` + `src/lib/db/migrator.ts` — migration pattern to follow for the new table.
- No encryption-at-rest, secret-handling, or media/upload code exists anywhere in the repo today — this change introduces the first instance of both.

## Goals / Non-Goals

**Goals:**
- Let a tenant store and rotate Cloudinary credentials, with `api_secret` encrypted at rest and never round-tripped to the client.
- Let a tenant verify those credentials work, with the result persisted and shown as a status indicator.
- Establish a reusable encryption-at-rest helper for future tenant-provided secrets, not just this one field.

**Non-Goals:**
- Actual media upload/asset management UI (browsing, uploading, transforming images) — this change only covers configuring and verifying the connection.
- Per-user (as opposed to per-tenant) Cloudinary configuration.
- Key rotation / envelope encryption for `MEDIA_CONFIG_ENCRYPTION_KEY` itself — a single static server-side key is in scope; rotating that master key is future work.
- Rate limiting on the "Check Connection" action — deferred; see Risks.

## Decisions

**Encryption: AES-256-GCM via Node's `crypto`, app-level master key from env, no new dependency.**
Node's built-in `crypto` module supports AES-256-GCM (AEAD) natively, so no new package is needed. `src/lib/crypto/index.ts` exposes `encrypt(plaintext: string): string` and `decrypt(ciphertext: string): string`, storing IV + auth tag alongside the ciphertext (e.g. `iv:tag:ciphertext`, base64-encoded) in the single `api_secret_enc` text column. The key comes from `process.env.MEDIA_CONFIG_ENCRYPTION_KEY` (32 bytes, base64), validated at module load so a missing/malformed key fails fast at startup rather than on first use.
Alternative considered: an external secrets manager (Vault/AWS Secrets Manager). Rejected for now — no such infra exists in this project, and it would add an external dependency and deployment complexity disproportionate to a single secret field. The `lib/crypto` module is a thin, swappable boundary if that's needed later.

**Cloudinary client: official `cloudinary` npm SDK, used only in server-side modules.**
The SDK's `v2.api.ping()` (Admin API) is a purpose-built, side-effect-free credentials check — one authenticated GET, no asset created/deleted. Using the official SDK avoids hand-rolling Cloudinary's signature scheme. It is only ever imported from server action files / server-only lib modules, consistent with the existing invariant that `api_secret` operations run server-side only.
Alternative considered: raw `fetch` against Cloudinary's REST API. Rejected — reimplements request signing the SDK already provides, for no real benefit here.

**New table `tenant_media_config`, one row per tenant, added to `TENANT_SCOPED_TABLES`.**
Matches the existing `projects`/`collections`/`entries` pattern rather than a generic key-value settings table, since there's exactly one well-known shape today. A generic JSON `tenant_settings` blob was considered and rejected: it would still need the same encryption/validation logic for this field, adds a layer of indirection with no current second consumer, and the project's custom-field JSON strategy is reserved for tenant-defined content fields, not system configuration.
Schema:
```
tenant_media_config
  tenant_id       TEXT PK, FK -> tenants.id  (one row per tenant; enforced by using tenant_id as the primary key)
  cloud_name      TEXT NOT NULL
  api_key         TEXT NOT NULL
  api_secret_enc  TEXT NOT NULL          -- iv:tag:ciphertext, base64
  last_checked_at TEXT NULL              -- ISO timestamp
  last_check_ok   INTEGER NULL           -- 0/1/NULL (not yet checked), SQLite boolean convention
  created_at      TEXT NOT NULL
  updated_at      TEXT NOT NULL
```
Using `tenant_id` as the primary key (rather than a surrogate id + unique constraint) directly enforces "at most one config per tenant" from the spec and makes the upsert a single `ON CONFLICT (tenant_id) DO UPDATE`.

**Two server actions, not one.**
`saveMediaConfig(prevState, formData)` and `checkMediaConnection()` are separate `"use server"` functions, matching the UI's two independent buttons (per proposal) and keeping the encrypt/persist path separate from the decrypt/network-call path — the latter is the one that can be slow or fail on the network, and isolating it keeps the save path fast and simple.

**Stale-check invalidation is a side effect of save, not a separate flag check.**
When `saveMediaConfig` writes new `cloud_name`/`api_key`/`api_secret`, it resets `last_checked_at`/`last_check_ok` to `NULL` in the same write, satisfying the "stale result after credentials change" scenario without extra coordination logic.

**Secret masking is presentational, not a stored "masked value."**
The read path (`page.tsx`) never selects/decrypts `api_secret_enc` for display — it only checks whether a config row exists to decide between showing an empty field vs. a "secret configured" placeholder. Decryption only ever happens inside `checkMediaConnection`, immediately before the Cloudinary API call, and the plaintext is never returned from that action either (only ok/fail + timestamp).

## Risks / Trade-offs

- **[Risk] `MEDIA_CONFIG_ENCRYPTION_KEY` loss or rotation makes stored secrets unrecoverable.** → Document the env var as a required, backed-up deployment secret in `.env.example`/deployment docs; out of scope to build key-rotation tooling now, but the encrypted-value format (versioned prefix reserved) leaves room for it later.
- **[Risk] "Check Connection" is an unrated, user-triggered outbound call to a third party — repeated clicking could be used to hammer Cloudinary or probe credentials.** → Accepted for this change (single-tenant-triggered, low volume by nature of a settings page); note as a follow-up if abuse is observed rather than building rate limiting speculatively.
- **[Risk] Encrypting/decrypting on every check call adds latency to the settings UI.** → Negligible in practice (AES-GCM on a short string is sub-millisecond); no mitigation needed.
- **[Trade-off] Using the official `cloudinary` SDK server-side-only means it must never be imported from a client component or a shared module reachable by client bundles.** → Enforced by keeping all Cloudinary SDK usage inside `actions.ts`/server-only lib files, consistent with how `api_secret` handling is already required to be server-only.

## Migration Plan

1. Add migration `db/migrations/003_tenant_media_config.ts` creating `tenant_media_config` (up) and dropping it (down).
2. Register `tenant_media_config` in `TENANT_SCOPED_TABLES` (`src/lib/db/tables.ts`) and add its row type to `src/lib/db/types.ts`.
3. Add `MEDIA_CONFIG_ENCRYPTION_KEY` to `.env.example` and local `.env`; document that it's required before the Media tab can be used.
4. Ship `src/lib/crypto/` and unit-test encrypt/decrypt round-trip independently of the feature.
5. Ship the settings tab, form, and actions.
Rollback: since the table is new and additive, reverting is a straight migration `down` + code revert — no data backfill or dual-write concerns, as no prior data exists for this capability.

## Open Questions

- Exact Cloudinary Admin API call used for `checkMediaConnection` (SDK's `api.ping()` vs. a lightweight `api.usage()` call) — either satisfies "verify credentials without side effects"; can be settled during implementation without affecting the spec or task breakdown.
