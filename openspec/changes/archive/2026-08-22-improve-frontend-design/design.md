## Context

The CMS frontend needs visual polish to become more professional and visually pleasing, establishing trust with its users. See `proposal.md` for motivation. Currently, some layouts might rely on ad-hoc styles instead of taking full advantage of the FlyonUI design system. 

## Goals / Non-Goals

**Goals:**
- Upgrade the visual design of the CMS dashboard (layout, typography, spacing, colors) using FlyonUI semantic classes.
- Make the interface feel premium and modern (dark mode support, smooth gradients, glassmorphism if applicable, micro-animations).
- Consolidate layout components to use proper FlyonUI structures.

**Non-Goals:**
- Refactoring backend business logic or database queries.
- Introducing new features or specs to the system.
- Introducing TailwindCSS outside of the FlyonUI framework or using other UI libraries (like Shadcn).

## Decisions

1. **Adopt strict FlyonUI semantic components**
   - *Rationale:* Consistency and maintainability. Using FlyonUI's built-in `card`, `btn`, `navbar`, `drawer`, etc. ensures the design system handles themes (dark mode) and responsive states properly.
   - *Alternatives considered:* Writing custom Tailwind utility classes everywhere. Rejected because it leads to bloated markup and inconsistent styling.

2. **Enhance visual aesthetics with typography and animations**
   - *Rationale:* To reach the "premium" feel requested. We will utilize modern fonts (e.g., Inter or Outfit), and implement micro-animations for hover states and transitions on interactive elements.
   - *Alternatives considered:* Sticking strictly to default static styles. Rejected because it lacks the requested dynamic and professional look.

3. **Incorporate proper JavaScript plugins / Data Attributes**
   - *Rationale:* For FlyonUI interactive components (dropdowns, tabs, accordions), we will systematically apply the required `data-*` attributes (`data-collapse`, `data-overlay`, etc.) and load the requisite JS.

## Risks / Trade-offs

- **Risk:** Existing custom styles might conflict with FlyonUI defaults when migrating.
  - *Mitigation:* Systematically audit pages and remove hardcoded Tailwind utilities that override semantic classes.
- **Risk:** Performance overhead from adding animations or new fonts.
  - *Mitigation:* Keep animations subtle (micro-interactions) and use system-native or optimized font-loading strategies.
