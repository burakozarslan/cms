## 1. Preparation & Auditing

- [x] 1.1 Audit existing frontend pages and layouts (e.g., `src/app/dashboard/**`) for hardcoded Tailwind utility classes.
- [x] 1.2 Identify UI elements that can be replaced with official FlyonUI semantic classes (`card`, `btn`, `navbar`, etc.).
- [x] 1.3 Setup Google Fonts (e.g., Inter or Outfit) in the global layout if not already present.

## 2. Layout & Typography Refactoring

- [x] 2.1 Refactor main dashboard shell/navigation to consistently use FlyonUI's `drawer` or `navbar` components.
- [x] 2.2 Refactor page-level containers and lists to consistently use FlyonUI `card` and appropriate spacing.
- [x] 2.3 Update buttons, inputs, and form elements to strictly use FlyonUI semantic classes (`btn`, `input`, etc.).

## 3. Polish & Interactive Components

- [x] 3.1 Ensure all interactive components (tabs, dropdowns, modals) have proper `data-*` attributes for FlyonUI JS plugins.
- [x] 3.2 Add micro-animations (e.g., hover effects) and smooth gradients to elevate the design to a premium feel.
- [x] 3.3 Verify Dark Mode compatibility across all refactored pages.

## 4. Testing & Verification

- [x] 4.1 Test the UI across different screen sizes (responsive design check).
- [x] 4.2 Validate that no business logic or data fetching was broken during the UI refactor.

