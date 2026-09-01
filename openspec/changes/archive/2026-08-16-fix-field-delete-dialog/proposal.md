## Why

Adding a field to a collection immediately shows the "Delete field?" confirmation for that field, and its Cancel button does nothing — the only way to dismiss it is to click "Delete field," which deletes the field the tenant just created. This makes the field builder actively dangerous to use and blocks normal collection editing.

## What Changes

- Fix `ConfirmDialog` (`src/frontend/ui/confirm-dialog.tsx`) so the delete-field dialog stays closed until its trigger is clicked, and so Cancel reliably dismisses it.
- Root cause: the component applies FlyonUI's `.modal-content` utility class directly to the native `<dialog>` element. That class sets `display: flex` unconditionally, and author CSS (even inside a Tailwind `@layer utilities` layer) always overrides the browser's built-in `dialog:not([open]) { display: none }` rule regardless of selector specificity. The dialog is therefore rendered visible in normal document flow at all times, independent of the element's real `open` state or the component's React `open` state. Because the dialog was never genuinely opened via `showModal()`, the Cancel handler's `setOpen(false)` is a no-op (state was already `false`), so nothing closes it. Only the real form submission behind "Delete field" is unaffected by this, since it fires regardless of the dialog's visual state — and once the field row is deleted, its dialog disappears along with it, which is why deleting looks like the "fix."
- No change to field-creation or field-deletion logic itself — this is a presentation-layer defect in the shared confirmation dialog component, which is reused for deleting entries as well, so the same defect likely affects that surface too.

## Capabilities

### Modified Capabilities
- `content-modeling`: The existing "Deleting a field permanently deletes its content values" requirement already mandates that deletion requires confirmation before it happens. This change adds explicit scenarios closing the gap this bug exposes: the confirmation must not appear unless the tenant explicitly initiates deletion, and canceling it must leave the field untouched.

## Impact

- `src/frontend/ui/confirm-dialog.tsx` — the shared confirmation dialog; fixing it here also fixes the same latent defect on the entry-delete confirmation, which reuses this component.
- `src/app/dashboard/[projectId]/[collectionId]/field-list.tsx` — consumer of `ConfirmDialog` for field deletion; no logic change expected, used to verify the fix.
- No database, API, or tenant-isolation impact — this is a client-side rendering/state bug with no server-side or data consequences. No migration or rollback considerations beyond reverting the component change.
