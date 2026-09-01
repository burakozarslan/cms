## Context

See proposal.md - Why. Relevant existing pieces this builds on:

- `src/lib/widgets/` — the registry pattern: `types.ts` (`WidgetDefinition` contract: `type`, `label`, `description`, `icon`, `configSchema`, `valueSchema(config)`, optional `isEmpty`), `registry.ts` (single `widgets` map, `widgetTypes`, `fieldWidgetSchema` discriminated union), `form.ts` (`configFromForm`/`valueFromForm`, one branch per widget). `richtext.ts` and `relationship.ts` are the two prior widgets that needed something beyond a plain scalar; this change follows their shape rather than `string`/`number`'s.
- `src/app/dashboard/[projectId]/[collectionId]/value-input.tsx` — switches on `field.widget`; `richtext`/`relationship` are the only cases that mount a client island (`richtext-editor.tsx`, `relationship-picker.tsx`) instead of a plain server-rendered control. `relationship-picker.tsx` is the closer precedent: `"use client"`, local state, a `useEffect` that dynamically imports `"./actions"` to call a server action, a hidden `<input name={valueInputName(fieldId)}>` carrying the resolved value into the enclosing native `<form>`.
- `src/lib/media-config/service.ts` and `check-connection.ts` (from `add-cloudinary-media-settings`) — `getMediaCredentials(tenantId)` (decrypted credentials or `undefined`), `checkMediaConnection(tenantId)` (calls `cloudinary.api.ping`, returns `{ok:true} | {ok:false, reason:"NOT_CONFIGURED"|"CHECK_FAILED"}`, swallows the real Cloudinary error). Config is per-tenant (`tenant_media_config`, PK `tenant_id`), not per-user.
- `src/lib/auth/index.ts`'s `requireSession()` — every server action starts with this; tenant scoping always derives from `session.user.tenantId`, never client input.
- No file-input/upload UI exists anywhere in this codebase yet (confirmed by search) — the picker is new UI, built from `@frontend/ui` primitives (`Button`, `Alert`, `Icon`). No toast library exists; all transient feedback is the inline `Alert` component.
- `cloudinary` npm package is already a dependency, used so far only for `api.ping` (Admin API). This change is its first use of the Upload API (`uploader.upload`, `uploader.destroy`).

## Goals / Non-Goals

**Goals:**
- `image` slots into the registry exactly like `richtext`/`relationship`: one module, one registry entry, one `case` in `value-input.tsx`, one `case` in `widget-config-inputs.tsx`, branches in `form.ts`.
- The upload itself happens over a dedicated server action distinct from the entry-save action — uploading is its own request/response cycle (pick file → click Upload → see a thumbnail), not something that happens as a side effect of saving the whole entry form.
- The entry form's save path stays untouched: once an upload completes, its result is just JSON sitting in a hidden input, submitted the same way `richtext`'s hidden input is.
- Every network call to Cloudinary (`ping`, `upload`, `destroy`) runs server-side only, using the tenant's decrypted credentials, exactly as `checkMediaConnection` already does.

**Non-Goals:**
- Remote-URL images, drag-and-drop reordering of multiple images, or a multi-image/gallery field — one file, one field, local picker only (per proposal.md).
- A Cloudinary asset browser/media library UI — this change uploads exactly the file the author just picked, nothing else.
- Rate limiting the upload or ping-before-upload calls — same accepted-risk posture `add-cloudinary-media-settings` took for "Check Connection."
- Image transformations/cropping before upload — the file is sent as picked.

## Decisions

**1. The upload is its own server action (`uploadImageAction`), not part of `updateEntryAction`/`createEntryAction`.**

`ImagePicker` calls this action directly when the author clicks "Upload," the same way `relationship-picker.tsx` dynamically imports and calls `listRelationshipOptionsAction` on mount. The action takes the field's config (`maxSizeMB`, `allowedFormats`) and the raw file (as `FormData`, since server actions accept `File`/`Blob` natively), and returns a discriminated result:

```ts
type UploadImageResult =
  | { ok: true; value: ImageValue }
  | { ok: false; reason: "NOT_CONFIGURED" | "CONNECTION_FAILED" | "TOO_LARGE" | "BAD_FORMAT" | "UPLOAD_FAILED" };
```

`ImageValue` is `{ secureUrl, publicId, width, height, format, bytes }`.

*Alternative considered:* fold the upload into the entry save action, so clicking "Save entry" both uploads and persists in one request. Rejected — it would mean losing an in-progress file selection on any unrelated validation error elsewhere in the form, and it couples a slow, third-party-dependent network call to the fast, all-local entry save path that every other widget currently enjoys. A separate action mirrors why `add-cloudinary-media-settings` split `saveMediaConfig` from `checkMediaConnection` (design decision there: keep the fast path fast, isolate the slow/failure-prone network call).

**2. Order of checks inside `uploadImageAction`: config existence, then live ping, then file constraints, then upload.**

```
requireSession()
  → getMediaCredentials(tenantId)          undefined → NOT_CONFIGURED
  → checkMediaConnection(tenantId)         fail → CONNECTION_FAILED
  → validate file size/format server-side  fail → TOO_LARGE / BAD_FORMAT
  → cloudinary.uploader.upload(...)        throws → UPLOAD_FAILED
  → (if replacing) cloudinary.uploader.destroy(oldPublicId) — best-effort, errors swallowed
  → { ok: true, value }
```

Config existence is checked before the ping so a tenant who never configured Cloudinary gets "set up Cloudinary" rather than a generic connection failure — same distinction `checkMediaConnection` already draws via its `NOT_CONFIGURED` reason. File constraints are checked after the ping (not before) so a doomed upload never even reaches "is this file okay" — cheapest-first would put file validation first, but the spec's intent (per proposal.md decision 6) is that a broken connection is surfaced before anything else about the attempt, and in practice the ping and the constraint check are both fast enough that ordering has no meaningful cost either way.

*Alternative considered:* validate file size/format client-side only, skip the server-side check. Rejected outright — every existing widget's config (`string.maxLength`, `number.min/max`) is enforced server-side as the source of truth (see content-entries' "Client-side constraints are not trusted" requirement); `image` follows the same rule.

**3. `checkMediaConnection` is called fresh on every upload attempt, not read from the cached `last_check_ok` status.**

Per proposal.md decision 6, this is a deliberate latency trade-off: `getMediaConfigStatus`'s cached badge (shown on the Settings page) reflects whichever check last ran, potentially minutes or days ago, and credentials can be revoked on Cloudinary's side without the tenant re-checking. `checkMediaConnection` is cheap to call (a single `api.ping`) and already exists — reusing it as-is, unmodified, keeps this change from touching `add-cloudinary-media-settings`'s code at all.

*Alternative considered:* trust `getMediaConfigStatus().lastCheckOk` if checked within some recency window (e.g. last 5 minutes), falling back to a live ping otherwise. Rejected — adds a cache-invalidation policy with no clear "right" window, for a call that's already fast; simpler to always verify live.

**4. Value schema validates shape, not liveness — it does not re-contact Cloudinary to confirm a stored URL still resolves.**

`imageValueSchema` is a Zod object requiring `secureUrl` (a URL string), `publicId` (non-empty string), `width`/`height` (positive numbers), `format` (non-empty string), and `bytes` (positive number) — validated the same way any other structured widget value is, at save time, entirely from the shape of what's submitted. It does not call Cloudinary to confirm the asset still exists, mirroring how `relationship`'s validator confirms a *referenced entry* exists (a same-database check) but no widget in this codebase re-verifies third-party state at save time.

*Alternative considered:* re-run `cloudinary.api.resource(publicId)` during validation to confirm the asset is real. Rejected — the value only ever reaches this validator immediately after `uploadImageAction` itself produced it (the form's hidden input is populated exclusively by a successful upload response, never hand-typed), so re-verification would be a redundant network call on every entry save for no realistic benefit.

**5. `image-picker.tsx` follows `relationship-picker.tsx`'s shape: local state, one hidden input, no premature server contact.**

```tsx
"use client";
// local state: pickedFile (File | null), uploading (boolean),
// result (ImageValue | existing value from props), error (UploadImageResult["reason"] | null)

<input type="file" accept="image/*" onChange={...} />       // picks, does not upload
{pickedFile && <Button onClick={upload}>Upload</Button>}     // triggers uploadImageAction
{error === "NOT_CONFIGURED" && <Alert tone="warning">...</Alert>}
{error === "CONNECTION_FAILED" && <Alert tone="error">...</Alert>}
{(error === "TOO_LARGE" || error === "BAD_FORMAT" || error === "UPLOAD_FAILED") && <Alert tone="error">...</Alert>}
{result && <img src={result.secureUrl} ... />}                // preview
<input type="hidden" name={valueInputName(fieldId)} value={JSON.stringify(result)} />
```

No config/connection check runs on mount — per proposal.md decision 5, the warning only appears once the author clicks "Upload," matching the `content-entries`... rather, `image-widget` spec's "No warning before the upload is triggered" scenario. This also avoids pinging Cloudinary once per rendered field on every page load, which a mount-time check would do.

*Alternative considered:* disable the file input entirely (with an inline notice) when the tenant has no saved config, detected via a prop threaded down from the server-rendered `value-input.tsx`. Rejected because it was explicitly ruled out during exploration — the user asked for the warning specifically on upload-button click, not a proactively disabled control — but noted here as a reasonable future enhancement if unconfigured-Cloudinary tenants turn out to hit this widget often enough to want fewer wasted clicks.

**6. `form.ts` gets an `image` branch shaped exactly like `richtext`'s: `configFromForm` returns the two config fields, `valueFromForm` JSON-parses the hidden input.**

```ts
case "image":
  return {
    maxSizeMB: optionalNumber(form.get("config.maxSizeMB")),
    allowedFormats: /* parsed from a comma/line-separated textarea, like select's options */,
  };
```
and in `valueFromForm`, the same try/parse/fallback-to-raw-string pattern `richtext` uses, so a malformed value fails in the value schema (producing a user-facing error) rather than throwing during form parsing.

**7. Replacement cleanup (`uploader.destroy`) happens inside `uploadImageAction`, after the new upload succeeds, and never blocks the response.**

The action receives the field's *current* value (the old `ImageValue`, if any) alongside the file, since it has no other way to know what was previously stored — the entry itself hasn't been saved yet when the upload happens. `destroy(oldPublicId)` is awaited (to keep it simple, no fire-and-forget) but wrapped in a try/catch whose failure is only logged server-side; the action still returns `{ok: true, value: newValue}` regardless of whether cleanup succeeded, per proposal.md decision 3.

*Alternative considered:* run the `destroy` call as fire-and-forget (don't await it at all). Rejected — awaiting keeps error handling in one place (a single try/catch) and costs one extra round-trip on an already-network-bound action; fire-and-forget would need its own error-swallowing wrapper for no real latency win.

## Risks / Trade-offs

- **[Risk] Two Cloudinary round-trips per upload (ping, then upload) roughly doubles perceived latency for a large file.** → Accepted per proposal.md decision 6 — correctness (never uploading against dead credentials) is the stated priority over shaving one request.
- **[Risk] `uploader.destroy` on replace can fail silently (network blip, already-deleted asset), leaving an orphaned asset in the tenant's Cloudinary account.** → Accepted per proposal.md decision 3 — logged server-side for operator visibility, not surfaced to the author as a blocking error. No retry/cleanup-queue mechanism in this change.
- **[Risk] A file is fully uploaded to Cloudinary before the entry itself is saved; if the author never submits the entry form (navigates away, closes the tab), the uploaded asset is orphaned in Cloudinary with no field ever pointing to it.** → Accepted as an inherent consequence of decision 1 (upload as its own action, before save) — no orphan-sweep job is in scope for this change; flagged as a candidate follow-up if it proves to matter in practice.
- **[Trade-off] Server-proxying the file (browser → Next.js server → Cloudinary) means the file's bytes pass through the app server, unlike a direct signed browser-to-Cloudinary upload.** → Accepted per the exploration decision to keep `api_secret` usage entirely server-side, consistent with the existing invariant; a large-file/high-volume future could revisit this with signed direct uploads, but no current requirement calls for it.
- **[Trade-off] `uploadImageAction` needs the field's prior value passed in from the client to know what to `destroy`.** → The client already holds this (it's what's rendered as the current image), so this is just an extra argument on the call, not new state to track — but it does mean the server trusts the client's claim of "this was the previous publicId" for cleanup purposes only, never for the value being validated/stored. Acceptable because destroy is best-effort and scoped to the tenant's own account (a wrong or stale publicId either destroys the tenant's own already-orphaned asset or 404s harmlessly against Cloudinary — no cross-tenant reach, since credentials are resolved server-side from the session, not the client's claim).

## Migration Plan

No database migration — per the standing invariant from `add-project-widgets`, `fields.config`/`entry_values.value` are already generic JSON columns, so `image` requires zero DDL, matching `richtext` and `relationship` before it.

Deploy steps:
1. Add `src/lib/widgets/image.ts` (`imageConfigSchema`, `imageValueSchema`, `label`/`description`/`icon`); register it in `registry.ts` (`widgets`, `widgetTypes`, `fieldWidgetSchema`).
2. Add `image` branches to `form.ts` (`configFromForm`, `valueFromForm`).
3. Add the upload server action (new module) implementing the check order in decision 2, reusing `getMediaCredentials`/`checkMediaConnection` unmodified.
4. Add `image-picker.tsx` (client island) and wire its `case` into `value-input.tsx`.
5. Add the `maxSizeMB`/`allowedFormats` config case in `widget-config-inputs.tsx`.

Rollback is reverting the code change — no migration to run `down()` on, no existing data touched. If `image` fields were created and populated before a rollback, those rows are harmless afterward (`parseFieldConfig` already treats an unrecognized `widget` string as a `MisconfiguredField` rather than crashing); any Cloudinary assets already uploaded remain in the tenant's account, unaffected by an app-level rollback.

## Open Questions

None — the upload path, check ordering, stored value shape, and cleanup behavior were resolved during discovery (see proposal.md) rather than left open.
