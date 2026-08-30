## 1. Widget definition

- [x] 1.1 Create `src/lib/widgets/image.ts`: `imageConfigSchema` (optional `maxSizeMB: number`, optional `allowedFormats: string[]`), `ImageConfig` type, `imageValueSchema` (Zod object requiring `secureUrl` as a URL string, non-empty `publicId`, positive `width`/`height`, non-empty `format`, positive `bytes`), and `imageWidget: WidgetDefinition<ImageConfig>` with `type`, `label`, `description`, `icon`.
- [x] 1.2 Export the `ImageValue` type (the shape `imageValueSchema` validates) for reuse by the upload action and the client picker.

## 2. Registry wiring

- [x] 2.1 Add `"image"` to `WidgetType` in `src/lib/widgets/types.ts`.
- [x] 2.2 Register `imageWidget` in the `widgets` map in `src/lib/widgets/registry.ts`.
- [x] 2.3 Add `"image"` to the `widgetTypes` array in `registry.ts`.
- [x] 2.4 Add an `image` branch to the `fieldWidgetSchema` discriminated union in `registry.ts`.

## 3. Form data translation

- [x] 3.1 Add a `case "image"` to `configFromForm` in `src/lib/widgets/form.ts`, reading `maxSizeMB` (optional number) and `allowedFormats` (parsed from a line- or comma-separated input, mirroring `parseSelectOptions`'s textarea approach).
- [x] 3.2 Add a `case "image"` to `valueFromForm` in `form.ts`: read the hidden input's posted JSON string, `JSON.parse` it, and on parse failure pass the raw string through so `imageValueSchema` produces the user-facing error (mirroring the existing `richtext` branch).

## 4. Upload server action

- [x] 4.1 Create a new server module for the upload (e.g. `src/app/dashboard/[projectId]/[collectionId]/image-upload-actions.ts`), `"use server"`, exporting `uploadImageAction`.
- [x] 4.2 Implement the check order from design.md decision 2: `requireSession()` → `getMediaCredentials(tenantId)` (undefined → return `NOT_CONFIGURED`) → `checkMediaConnection(tenantId)` (fail → return `CONNECTION_FAILED`) → server-side file size/format validation against the field's config (fail → return `TOO_LARGE`/`BAD_FORMAT`) → `cloudinary.uploader.upload(...)` (throws → return `UPLOAD_FAILED`).
- [x] 4.3 On upload success, if a previous `publicId` was passed in (the field's prior value), call `cloudinary.uploader.destroy(oldPublicId)` in a try/catch whose failure is logged server-side and never affects the returned result.
- [x] 4.4 Return the discriminated `UploadImageResult` (`{ok:true, value: ImageValue} | {ok:false, reason}`) defined in design.md decision 1.
- [x] 4.5 Ensure the action never echoes the raw Cloudinary/network error to the client, consistent with `checkMediaConnection`'s existing error-swallowing.

## 5. Client picker component

- [x] 5.1 Create `src/app/dashboard/[projectId]/[collectionId]/image-picker.tsx` (`"use client"`): local state for the picked `File`, upload-in-progress flag, the current `ImageValue` (seeded from the field's existing value), and an error/reason state.
- [x] 5.2 Render a local file input (`accept="image/*"`) that only stores the picked file — no upload on selection.
- [x] 5.3 Render an "Upload" button (shown once a file is picked) that dynamically imports and calls `uploadImageAction`, passing the file, the field's config, and the current `publicId` (if replacing).
- [x] 5.4 Render inline `Alert`s per `UploadImageResult["reason"]`: `NOT_CONFIGURED` (warning, "set up Cloudinary in Settings"), `CONNECTION_FAILED` (error, connection could not be verified), `TOO_LARGE`/`BAD_FORMAT`/`UPLOAD_FAILED` (error, upload failed).
- [x] 5.5 On success, show a thumbnail preview (`<img src={value.secureUrl}>`) and sync `value` into a `<input type="hidden" name={valueInputName(fieldId)} value={JSON.stringify(value)}>`.
- [x] 5.6 Do not perform any config/connection check on mount — the check only runs when the author clicks "Upload" (design.md decision 5).

## 6. Entry editor and field builder wiring

- [x] 6.1 Add a `case "image"` to the `switch (field.widget)` in `value-input.tsx`, rendering `ImagePicker`.
- [x] 6.2 Add a `case "image"` to the `switch (widget)` in `widget-config-inputs.tsx`: inputs for `maxSizeMB` (number) and `allowedFormats` (textarea/list), both optional, mirroring `string`'s `maxLength` input and `select`'s options textarea.
- [x] 6.3 Confirm `field-form.tsx`'s `WidgetPicker` picks up `image` automatically from `widgetTypes`/`widgetDefinition` (label, description, icon) with no separate change needed.

## 7. Tests

- [x] 7.1 Unit test `imageWidget.configSchema`/`imageValueSchema` in `tests/server/widget-registry.test.ts`: accepts well-formed config and value objects; rejects a value missing `secureUrl`/`publicId`; rejects negative/zero `width`/`height`/`bytes`.
- [x] 7.2 Unit test `configFromForm`/`valueFromForm` `image` branches in `tests/server/widget-form.test.ts`: parses the hidden input's JSON; a blank submission reads as absent; malformed JSON passes through for the value schema to reject.
- [x] 7.3 Unit test `uploadImageAction`'s check ordering (mocking `getMediaCredentials`, `checkMediaConnection`, and the Cloudinary SDK): no config → `NOT_CONFIGURED` and no ping/upload attempted; ping fails → `CONNECTION_FAILED` and no upload attempted; file exceeds `maxSizeMB` → `TOO_LARGE` and no upload attempted; format outside `allowedFormats` → `BAD_FORMAT` and no upload attempted; upload throws → `UPLOAD_FAILED`; successful upload with a prior `publicId` triggers `destroy`; a failing `destroy` still returns `{ok:true, value}`.
- [x] 7.4 Integration tests in `tests/server/entries.test.ts` ("image values" describe block): a well-formed `ImageValue` is accepted and stored; a malformed value is rejected naming the field; required + absent value is rejected; optional + absent value stores no row (mirrors existing optional-blank-field tests for other widgets).
- [x] 7.5 Regression test in a new `tests/ui/image-picker.test.tsx` ("ValueInput — image dispatch"): an `image` field mounts the file picker; a `string` field does not. Also cover: no warning/error shown before "Upload" is clicked; the `NOT_CONFIGURED`/`CONNECTION_FAILED`/generic-failure `Alert`s render for their respective mocked `uploadImageAction` results; a successful result renders the thumbnail and populates the hidden input.

## 8. Verification

- [x] 8.1 Full test suite passing, no regressions. Run `tsc --noEmit`, `eslint .`, and `next build` project-wide.
- [ ] 8.2 Manually verify against the running dev app: add an `image` field to a collection, confirm it appears in the widget picker; with no Cloudinary configured, pick a file and click Upload — confirm the "not configured" warning and that no request reaches Cloudinary; configure Cloudinary (real or test account), retry — confirm the ping runs, the upload succeeds, the thumbnail renders, and the entry saves and reloads with the image intact; replace the image and confirm the previous asset is deleted from the Cloudinary account (check the Cloudinary media library) while the new image still saves correctly even if `destroy` is made to fail (e.g. by revoking the old `publicId` first).
