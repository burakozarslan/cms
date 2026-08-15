## 1. Reproduce

- [x] 1.1 Run the app, open a collection's field builder, add a field, and confirm the delete confirmation for it renders unopened (visible, but not a real modal — Escape/backdrop don't close it) and Cancel is a no-op. **Note:** confirmed via static/CSS-cascade analysis, not a live browser click-through — no browser automation tool was available in this environment. Dev server left running at http://localhost:3001 for manual spot-check.
- [x] 1.2 Inspect the `<dialog>` in devtools to confirm its `open` attribute is absent while it is visually shown, and note the computed `display` value comes from `.modal-content`. Confirmed by reading `node_modules/flyonui/components/modal.css`: `.modal-content { display: flex; ... }` is unconditional and, per CSS cascade rules, author styles (even Tailwind's `@layer utilities`) always outrank the UA default `dialog:not([open]) { display: none }` regardless of specificity.

## 2. Fix `ConfirmDialog`

- [x] 2.1 In `src/frontend/ui/confirm-dialog.tsx`, stop applying the `.modal-content` utility's `display: flex` to the `<dialog>` while it is closed — gate the box-styling classes on the component's `open` state (e.g. `className={open ? "modal-content ..." : "hidden"}`) per design.md's Decisions section.
- [x] 2.2 Keep the existing `useEffect` that calls `showModal()` / `close()` and the `onClose`/`onSubmit` handlers that call `setOpen(false)` — no change to the open/close state machine itself, only to how `open` is reflected in the DOM's visual styling.

## 3. Verify

- [ ] 3.1 Add a field in the field builder and confirm no delete dialog appears. **Not run manually** — no browser automation tool available; covered by the new `tests/ui/confirm-dialog.test.tsx` ("stays hidden until the trigger is clicked"), but needs a human click-through to fully close out.
- [ ] 3.2 Click a field's Delete trigger, confirm the dialog opens as a real modal (backdrop, focus trap, Escape closes it). **Not run manually** — backdrop/focus-trap/Escape are native `<dialog>` behaviors jsdom cannot simulate; needs a real browser.
- [ ] 3.3 Click Cancel and confirm the dialog closes and the field is untouched. Covered by the new test ("closes on Cancel without submitting the action"); not additionally verified in a live browser.
- [ ] 3.4 Click Delete field and confirm the field is deleted as before. **Not run manually.**
- [ ] 3.5 Repeat 3.1–3.4 against the entry-delete confirmation (same `ConfirmDialog` component, in the entries list) to confirm the shared fix covers it too. **Not run manually.**
- [x] 3.6 Grep the codebase for any other native `<dialog>` styled with a FlyonUI `.modal*` class outside `ConfirmDialog`; fix in place if found, otherwise confirm none exist. Confirmed: `ConfirmDialog` is the only `<dialog>` element in `src/`.
- [x] 3.7 Run `npm run lint` and the existing test suite (`npm test`) to confirm no regressions. Lint clean; 179/179 tests pass (176 existing + 3 new in `tests/ui/confirm-dialog.test.tsx`).

## 4. Spec sync

- [ ] 4.1 Confirm the delta scenarios in `specs/content-modeling/spec.md` ("Confirmation does not appear unprompted", "Canceling a delete confirmation leaves the field intact") pass manual verification from step 3. Blocked on 3.1–3.5's manual browser verification.
