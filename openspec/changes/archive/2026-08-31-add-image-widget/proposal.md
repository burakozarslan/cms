## Why

`add-cloudinary-media-settings` let a tenant store and verify Cloudinary credentials, but explicitly scoped out actual media upload as a non-goal. Since then, `add-richtext-widget` and `add-relationship-widget` filled in the remaining reserved widget slots, but no widget lets a tenant attach an image to an entry — authors have no way to use the Cloudinary account they configured. This change adds that widget, spending the credential-verification machinery `add-cloudinary-media-settings` already built.

## What Changes

- Adds an eighth widget type, `image`, to the registry (`src/lib/widgets/`).
- Authoring is local-file-only: the user picks a file from their computer. Remote-URL image fields are explicitly deferred to a future change.
- Uploads are server-proxied: the browser posts the file to a new `"use server"` action; the server uploads it to Cloudinary via `cloudinary.uploader.upload()` using the tenant's decrypted credentials (`getMediaCredentials`, from `add-cloudinary-media-settings`). The API secret never reaches the client, consistent with that change's invariant.
- Before every upload attempt, the action re-verifies the tenant's Cloudinary credentials via `checkMediaConnection` (also from `add-cloudinary-media-settings`) rather than trusting the cached `last_check_ok` badge, which can be stale. A tenant with no saved configuration, or credentials that fail the check, sees an inline warning and the upload does not proceed.
- Stored value is the uploaded asset's Cloudinary metadata — `secureUrl`, `publicId`, `width`, `height`, `format`, `bytes` — not a bare URL string, so a later replace can target the exact prior asset for cleanup.
- Replacing an already-uploaded image deletes the previous asset from Cloudinary (`uploader.destroy`) as a best-effort step: failure to clean up the old asset does not block saving the new one or surface a blocking error.
- Per-field configuration (`maxSizeMB`, `allowedFormats`), mirroring how `string` exposes `maxLength` — enforced both client-side (courtesy UX) and server-side (source of truth).
- New client island (`image-picker.tsx`, alongside the existing `richtext-editor.tsx`/`relationship-picker.tsx` precedents) for file selection, preview, upload triggering, and inline error/warning display via the existing `Alert` component — this codebase has no toast system.
- **BREAKING**: none. Purely additive: one new widget type, one new registry entry, new switch cases in existing files, one new server action module.

## Capabilities

### New Capabilities

- `image-widget`: Defining and authoring `image` fields — the local file picker, per-field size/format constraints, the pre-upload credential/connection check, the server-proxied upload to and asset cleanup on Cloudinary, the stored value shape (Cloudinary asset metadata), and the inline error/warning states (not configured, connection check failed, file too large, disallowed format, upload failed).

### Modified Capabilities

- `content-modeling`: the widget type enum gains `image`; the field builder's config UI gains a config panel for `maxSizeMB`/`allowedFormats`. No other requirement in `content-modeling` changes.
- `content-entries`: entry values gain a widget whose stored value is Cloudinary asset metadata (a JSON object) rather than a scalar or a Lexical document; server-side validation of submitted values against the collection's current field definitions needs an `image` branch.

## Impact

**New code**
- `src/lib/widgets/image.ts` — widget definition: `imageConfigSchema` (`maxSizeMB?`, `allowedFormats?`), `imageValueSchema` (validates the Cloudinary metadata shape), `label`/`description`/`icon`.
- `src/lib/widgets/registry.ts` — new entry in `widgets`, `widgetTypes`, and the `fieldWidgetSchema` discriminated union.
- `src/lib/widgets/form.ts` — `configFromForm`/`valueFromForm` branches for `image` (config reads the two new fields; value parses the hidden input's JSON, mirroring the existing `richtext` branch).
- `src/app/dashboard/[projectId]/[collectionId]/image-picker.tsx` (new, `"use client"`) — file selection, local preview, upload trigger, hidden-input value sync, inline `Alert`-based error/warning states.
- `src/app/dashboard/[projectId]/[collectionId]/value-input.tsx` — new `case "image"`, rendering `ImagePicker`.
- `src/app/dashboard/[projectId]/[collectionId]/widget-config-inputs.tsx` — new `case "image"` for the `maxSizeMB`/`allowedFormats` config inputs.
- A new server action module for the upload itself (e.g. `src/app/dashboard/[projectId]/[collectionId]/image-upload-actions.ts` or a `src/lib/media-upload/service.ts` service layer plus a thin action wrapper, following the `requireSession` → tenant-scoped service call → discriminated result pattern from `src/app/dashboard/settings/cloudinary/actions.ts`) — exact split settled in design.md.

**Reused, unchanged**
- `getMediaCredentials`, `checkMediaConnection`, `getMediaConfigStatus` (`src/lib/media-config/`) — consumed as-is; no changes to their behavior or the `tenant_media_config` table.
- `cloudinary` npm package — already a dependency; this change is its first use of the Upload API (`uploader.upload`, `uploader.destroy`) alongside the existing Admin API (`api.ping`) usage.

**Database & indexing**
- No schema migration for `fields`/`entry_values` — per the standing invariant from `add-project-widgets`, `config`/`value` are already generic JSON columns, so `image` requires zero DDL, matching `richtext` and `relationship` before it.

**Tenant isolation boundary**
- No change. Upload actions resolve `tenantId` from the session exactly as `checkMediaConnectionAction` does today; no new endpoint accepts a client-supplied tenant or credential identifier.

**Rollback & data migration**
- Purely additive code; rollback is reverting the change. No migration to run `down()` on. If `image` fields are created and populated before a rollback, those rows are harmless afterward — `parseFieldConfig` already treats an unrecognized `widget` string as a `MisconfiguredField` rather than crashing.
