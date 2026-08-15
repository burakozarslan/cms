## Context

`ConfirmDialog` (`src/frontend/ui/confirm-dialog.tsx`) wraps a native `<dialog>` element, styled with the class `"modal-content bg-base-100 m-auto w-full max-w-md rounded-lg p-0 shadow-lg backdrop:bg-black/40"`, and manages visibility with a React `open` boolean synced to the DOM via `dialog.showModal()` / `dialog.close()` in a `useEffect`.

FlyonUI's `.modal-content` utility (`node_modules/flyonui/components/modal.css`) sets `display: flex` unconditionally, inside a Tailwind `@layer utilities` block. It's designed to be the inner box of FlyonUI's own two-part modal markup (`<div class="modal">` for overlay/visibility + `<div class="modal-content">` for the box), where `.modal` (not `.modal-content`) controls show/hide. Here, `.modal-content` was applied directly to the `<dialog>` itself, with no `.modal` wrapper, relying instead on the native `dialog:not([open]) { display: none }` default to keep it hidden.

Per CSS cascade rules, author-origin styles (including Tailwind utility layers) always outrank user-agent default styles regardless of selector specificity. So `.modal-content`'s `display: flex` permanently overrides the browser's `dialog:not([open])` rule — the dialog renders in-flow and visible at all times, independent of its real `open` attribute and independent of the component's React `open` state. See proposal.md — Why / What Changes for the full causal chain to both reported symptoms.

## Goals / Non-Goals

**Goals:**
- Make `ConfirmDialog` visually hidden until actually opened via `showModal()`, using CSS that cannot be defeated by FlyonUI's `.modal-content` utility (or remove that class's conflicting effect from the dialog's own styling).
- Preserve the existing native-`<dialog>`-based approach (focus trap, Escape-to-close, backdrop) — do not switch to FlyonUI's JS-driven `.modal` overlay system, which this app deliberately avoids (per the component's own doc comment).
- Fix once, in the shared component, so every caller (field deletion, entry deletion) benefits.

**Non-Goals:**
- Redesigning the confirmation dialog's visual style or API surface.
- Changing `deleteFieldAction`, `createFieldAction`, or any server-side logic — the defect is purely in client-side visibility styling.
- Auditing other FlyonUI class usages beyond this component, unless the same misapplication pattern (a `.modal*` utility class placed directly on a bare native `<dialog>`) is found elsewhere during implementation.

## Decisions

**Decision: Style the `<dialog>` so the native `open` attribute drives visibility, not `.modal-content`.**

Move the FlyonUI box styling (rounded corners, shadow, padding, flex layout) onto an explicit `dialog[open]` scoped rule or a wrapper element, rather than an unconditional utility class on the `<dialog>` itself. Concretely: replace the `.modal-content` class on the `<dialog>` with the same visual utilities applied only when open — e.g. a local class guarded by `&[open]` in a small CSS module, or by keeping `.modal-content` but adding an explicit `hidden` attribute/`className` toggle driven by the component's `open` state (`hidden={!open}`), which produces `display: none !important`-equivalent behavior that Tailwind's own `[hidden]` reset already provides, and which — being a distinct, always-present style — is not defeated by `.modal-content`'s `display: flex` (the two rules target the same element with different selectors of admittedly similar specificity, so the safest fix is to stop applying `.modal-content`'s raw `display: flex` to an element whose hidden state depends on an attribute Tailwind isn't told about).

Simplest concrete approach, chosen over alternatives below: keep `.modal-content` (it's harmless once the element is legitimately shown) but add `className={open ? "" : "hidden"}` alongside it, or equivalently gate the box-styling classes so they only apply once `open` is true. `hidden` is a plain HTML boolean attribute with a UA style of `display: none`, and — like any attribute-based approach — needs to actually be present in the DOM (not just implied) to take effect; Tailwind does not neutralize `[hidden]` by default, so `className={open ? "modal-content ..." : "hidden"}` reliably hides the element regardless of `.modal-content`.

**Alternatives considered:**
- *Drop `.modal-content` entirely and hand-roll the box styling with plain Tailwind utilities* (rounded, shadow, padding, flex). Correct and simpler to reason about, but throws away the FlyonUI-provided design tokens (`--radius-lg`, theme shadow colors) the rest of the app uses for modals — more drift-prone long term. Rejected in favor of keeping `.modal-content` but conditioning its application.
- *Wrap in FlyonUI's full two-element `<div class="modal"><div class="modal-content">` markup and drive it via FlyonUI's own JS toggle instead of native `showModal()`.* Rejected: the component's doc comment explicitly avoids this because the app doesn't load FlyonUI's overlay JS bundle, and switching would lose native focus-trap/Escape/backdrop for a JS reimplementation.
- *CSS override with `!important` (`dialog:not([open]) { display: none !important; }`) added globally.* Works, but fixes it action-at-a-distance in global CSS rather than at the component that owns the bug, and every future consumer of `.modal-content` on a bare `<dialog>` would silently rely on it. Rejected in favor of a component-local fix.

## Risks / Trade-offs

- [Fix only addresses `ConfirmDialog`, but the same `.modal-content`-on-bare-`<dialog>` pattern could exist elsewhere] → grep the codebase for other native `<dialog>` elements styled with FlyonUI `.modal*` classes during implementation; fix in place if found, otherwise note it as out of scope.
- [Manual QA is required since this is a rendering/interaction bug, not something a type check would catch] → verify by hand in a browser: add a field and confirm no dialog appears; open a delete dialog and confirm Cancel closes it without deleting; confirm Delete still deletes.
